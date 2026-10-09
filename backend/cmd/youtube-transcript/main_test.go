package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
)

// invokeFunc records one synthetic Lambda invocation.
type invokeFunc func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error)

func (f invokeFunc) Invoke(_ context.Context, input *awslambda.InvokeInput, _ ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error) {
	return f(input)
}

func completedResult() podscriber.TranscriptionResult {
	return podscriber.TranscriptionResult{
		SchemaVersion: podscriber.SchemaVersion,
		Source:        podscriber.Source{Type: podscriber.SourceTypeYouTube, Input: "https://youtu.be/example", URL: "https://www.youtube.com/watch?v=example"},
		Metadata:      podscriber.Metadata{Title: "Video", PublishedDate: "2026-09-10"},
		Transcript:    podscriber.Transcript{Text: "Text", Provider: "deepgram", Raw: json.RawMessage(`{"results":{}}`)},
	}
}

func TestRunTranscribesAndPublishesURLArgument(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "deepgram-key")
	t.Setenv(backendLambdaNameEnv, "backend")
	oldTranscribe, oldPublish := transcribeLocally, publishToLambda
	t.Cleanup(func() { transcribeLocally, publishToLambda = oldTranscribe, oldPublish })
	transcribeLocally = func(_ context.Context, sourceURL, cookiesFromBrowser string) (podscriber.TranscriptionResult, error) {
		if sourceURL != "https://youtu.be/example" {
			t.Fatalf("source URL = %q", sourceURL)
		}
		if cookiesFromBrowser != chromeCookies {
			t.Fatalf("browser cookies = %q", cookiesFromBrowser)
		}
		return completedResult(), nil
	}
	publishToLambda = func(_ context.Context, result podscriber.TranscriptionResult) (json.RawMessage, error) {
		if result.Metadata.Title != "Video" || result.Source.Type != podscriber.SourceTypeYouTube {
			t.Fatalf("result = %#v", result)
		}
		return json.RawMessage(`{"ok":true}`), nil
	}

	var stdout bytes.Buffer
	if err := run(context.Background(), []string{" https://youtu.be/example "}, &stdout); err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if stdout.String() != "{\"ok\":true}\n" {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestRunChecksEnvironmentBeforeTranscribing(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "")
	t.Setenv(backendLambdaNameEnv, "backend")
	oldTranscribe := transcribeLocally
	t.Cleanup(func() { transcribeLocally = oldTranscribe })
	transcribeLocally = func(context.Context, string, string) (podscriber.TranscriptionResult, error) {
		t.Fatal("transcribed before checking environment")
		return podscriber.TranscriptionResult{}, nil
	}

	err := run(context.Background(), []string{"https://youtu.be/example"}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), deepgramAPIKeyEnv) {
		t.Fatalf("run() error = %v", err)
	}
}

func TestRunRequiresLambdaNameOnlyWhenPublishing(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "deepgram-key")
	t.Setenv(backendLambdaNameEnv, "")
	oldTranscribe := transcribeLocally
	t.Cleanup(func() { transcribeLocally = oldTranscribe })
	transcribeLocally = func(context.Context, string, string) (podscriber.TranscriptionResult, error) {
		t.Fatal("transcribed before checking environment")
		return podscriber.TranscriptionResult{}, nil
	}

	// Publishing still requires the backend Lambda target.
	err := run(context.Background(), []string{"https://youtu.be/example"}, &bytes.Buffer{})
	if err == nil || !strings.Contains(err.Error(), backendLambdaNameEnv) {
		t.Fatalf("run() error = %v", err)
	}
}

func TestRunNoPublishPrintsPublishPayload(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "deepgram-key")
	t.Setenv(backendLambdaNameEnv, "")
	oldTranscribe, oldPublish := transcribeLocally, publishToLambda
	t.Cleanup(func() { transcribeLocally, publishToLambda = oldTranscribe, oldPublish })
	transcribeLocally = func(context.Context, string, string) (podscriber.TranscriptionResult, error) {
		return completedResult(), nil
	}
	publishToLambda = func(context.Context, podscriber.TranscriptionResult) (json.RawMessage, error) {
		t.Fatal("published despite --no-publish")
		return nil, nil
	}

	var stdout bytes.Buffer
	if err := run(context.Background(), []string{"--no-publish", "https://youtu.be/example"}, &stdout); err != nil {
		t.Fatalf("run() error = %v", err)
	}

	var request publishRequest
	if err := json.Unmarshal([]byte(stdout.String()), &request); err != nil {
		t.Fatalf("stdout is not the publish payload: %q", stdout.String())
	}
	if request.Action != publishAction || request.Transcription.Source.Type != podscriber.SourceTypeYouTube || request.Transcription.Transcript.Text != "Text" {
		t.Fatalf("request = %#v", request)
	}
	want, err := encodePublishRequest(completedResult())
	if err != nil {
		t.Fatal(err)
	}
	if stdout.String() != string(want)+"\n" {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestRunOutputFileWritesPublishPayload(t *testing.T) {
	t.Setenv(deepgramAPIKeyEnv, "deepgram-key")
	t.Setenv(backendLambdaNameEnv, "")
	oldTranscribe, oldPublish := transcribeLocally, publishToLambda
	t.Cleanup(func() { transcribeLocally, publishToLambda = oldTranscribe, oldPublish })
	transcribeLocally = func(context.Context, string, string) (podscriber.TranscriptionResult, error) {
		return completedResult(), nil
	}
	publishToLambda = func(context.Context, podscriber.TranscriptionResult) (json.RawMessage, error) {
		t.Fatal("published despite -o output")
		return nil, nil
	}

	outputPath := filepath.Join(t.TempDir(), "payload.json")
	var stdout bytes.Buffer
	if err := run(context.Background(), []string{"-o", outputPath, "https://youtu.be/example"}, &stdout); err != nil {
		t.Fatalf("run() error = %v", err)
	}
	if stdout.Len() != 0 {
		t.Fatalf("stdout = %q", stdout.String())
	}
	contents, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	want, err := encodePublishRequest(completedResult())
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) != string(want)+"\n" {
		t.Fatalf("output file = %q", string(contents))
	}
}

func TestParseArgsRejectsInvalidArguments(t *testing.T) {
	for _, args := range [][]string{nil, {""}, {"one", "two"}, {"--unknown", "url"}, {"-o"}, {"-o", "", "url"}, {"--no-publish"}} {
		if _, err := parseArgs(args); err == nil {
			t.Fatalf("parseArgs(%q) error = nil", args)
		}
	}
}

func TestParseArgsControlsPublishing(t *testing.T) {
	publishing, err := parseArgs([]string{"https://youtu.be/example"})
	if err != nil || publishing.noPublish || publishing.outputFile != "" {
		t.Fatalf("default options = %#v, error = %v", publishing, err)
	}
	skipping, err := parseArgs([]string{"--no-publish", "https://youtu.be/example"})
	if err != nil || !skipping.noPublish || skipping.outputFile != "" {
		t.Fatalf("no-publish options = %#v, error = %v", skipping, err)
	}
	toFile, err := parseArgs([]string{"-o", " out.json ", "https://youtu.be/example"})
	if err != nil || !toFile.noPublish || toFile.outputFile != "out.json" {
		t.Fatalf("output options = %#v, error = %v", toFile, err)
	}
	if _, err := parseArgs([]string{"-o", "  ", "url"}); err == nil {
		t.Fatal("blank output file accepted")
	}
}

func TestParseArgsControlsChromeCookies(t *testing.T) {
	withCookies, err := parseArgs([]string{" https://youtu.be/example "})
	if err != nil || withCookies.sourceURL != "https://youtu.be/example" || withCookies.cookiesFromBrowser != chromeCookies {
		t.Fatalf("default options = %#v, error = %v", withCookies, err)
	}
	withoutCookies, err := parseArgs([]string{"--no-cookies", "https://youtu.be/example"})
	if err != nil || withoutCookies.cookiesFromBrowser != "" {
		t.Fatalf("cookie-free options = %#v, error = %v", withoutCookies, err)
	}
}

func TestInvokeLambdaSendsPortableTranscription(t *testing.T) {
	result := completedResult()
	response, err := invokeLambda(context.Background(), invokeFunc(func(input *awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
		if *input.FunctionName != "backend" {
			t.Fatalf("function = %q", *input.FunctionName)
		}
		var request publishRequest
		if err := json.Unmarshal(input.Payload, &request); err != nil {
			t.Fatal(err)
		}
		if request.Action != publishAction || request.Transcription.Metadata.Title != "Video" {
			t.Fatalf("request = %#v", request)
		}
		if bytes.Contains(input.Payload, []byte(`"media"`)) || bytes.Contains(input.Payload, []byte(`"path"`)) {
			t.Fatalf("request leaked media location: %s", input.Payload)
		}
		return &awslambda.InvokeOutput{Payload: []byte(`{"ok":true}`)}, nil
	}), "backend", result)
	if err != nil || string(response) != `{"ok":true}` {
		t.Fatalf("response = %s, error = %v", response, err)
	}
}

func TestInvokeLambdaReportsFunctionError(t *testing.T) {
	failure := "Unhandled"
	_, err := invokeLambda(context.Background(), invokeFunc(func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
		return &awslambda.InvokeOutput{FunctionError: &failure, Payload: []byte(`{"errorMessage":"upload failed"}`)}, nil
	}), "backend", completedResult())
	if err == nil || !strings.Contains(err.Error(), "upload failed") {
		t.Fatalf("invokeLambda() error = %v", err)
	}

	want := errors.New("network failed")
	_, err = invokeLambda(context.Background(), invokeFunc(func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
		return nil, want
	}), "backend", completedResult())
	if !errors.Is(err, want) {
		t.Fatalf("invokeLambda() error = %v", err)
	}
}
