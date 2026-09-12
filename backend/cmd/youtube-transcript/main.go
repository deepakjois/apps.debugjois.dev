package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/config"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/deepgram"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/youtube"
)

const (
	deepgramAPIKeyEnv    = "DEEPGRAM_API_KEY"
	backendLambdaNameEnv = "BACKEND_LAMBDA_FUNCTION_NAME"
	publishAction        = "publish-completed-transcription"
	chromeCookies        = "chrome"
	deepgramTimeout      = 10 * time.Minute
)

// cliOptions controls local source extraction before publishing.
type cliOptions struct {
	sourceURL          string
	cookiesFromBrowser string
}

// publishRequest is the media-free direct Lambda invocation contract.
type publishRequest struct {
	Action        string                         `json:"action"`
	Transcription podscriber.TranscriptionResult `json:"transcription"`
}

// lambdaInvoker isolates the synchronous AWS transport.
type lambdaInvoker interface {
	Invoke(context.Context, *awslambda.InvokeInput, ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error)
}

var (
	transcribeLocally = transcribeYouTube
	publishToLambda   = invokePublishAction
)

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, stdout io.Writer) error {
	options, err := parseArgs(args)
	if err != nil {
		return err
	}
	if err := validateEnvironment(); err != nil {
		return err
	}
	result, err := transcribeLocally(ctx, options.sourceURL, options.cookiesFromBrowser)
	if err != nil {
		return err
	}
	response, err := publishToLambda(ctx, result)
	if err != nil {
		return err
	}
	if _, err := stdout.Write(append(response, '\n')); err != nil {
		return fmt.Errorf("write Lambda response: %w", err)
	}
	return nil
}

func parseArgs(args []string) (cliOptions, error) {
	flags := flag.NewFlagSet("youtube-transcript", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	noCookies := flags.Bool("no-cookies", false, "download without Chrome cookies")
	if err := flags.Parse(args); err != nil {
		return cliOptions{}, fmt.Errorf("parse flags: %w", err)
	}
	if flags.NArg() != 1 || strings.TrimSpace(flags.Arg(0)) == "" {
		return cliOptions{}, errors.New("usage: youtube-transcript [--no-cookies] <YouTube URL>")
	}
	cookies := chromeCookies
	if *noCookies {
		cookies = ""
	}
	return cliOptions{sourceURL: strings.TrimSpace(flags.Arg(0)), cookiesFromBrowser: cookies}, nil
}

func validateEnvironment() error {
	for _, name := range []string{deepgramAPIKeyEnv, backendLambdaNameEnv} {
		if strings.TrimSpace(os.Getenv(name)) == "" {
			return fmt.Errorf("%s must be set", name)
		}
	}
	return nil
}

func transcribeYouTube(ctx context.Context, sourceURL, cookiesFromBrowser string) (result podscriber.TranscriptionResult, retErr error) {
	apiKey := strings.TrimSpace(os.Getenv(deepgramAPIKeyEnv))
	if apiKey == "" {
		return result, fmt.Errorf("%s must be set", deepgramAPIKeyEnv)
	}
	workDir, err := os.MkdirTemp("", "youtube-transcript-*")
	if err != nil {
		return result, fmt.Errorf("create temporary directory: %w", err)
	}
	defer func() {
		if err := os.RemoveAll(workDir); err != nil {
			retErr = errors.Join(retErr, fmt.Errorf("remove temporary directory: %w", err))
		}
	}()

	extractor, err := youtube.New(youtube.Config{OutputDir: workDir, CookiesFromBrowser: cookiesFromBrowser})
	if err != nil {
		return result, err
	}
	prepared, err := extractor.Extract(ctx, sourceURL)
	if err != nil {
		return result, err
	}
	transcriber, err := deepgram.New(apiKey)
	if err != nil {
		return result, err
	}
	transcriptionCtx, cancel := context.WithTimeout(ctx, deepgramTimeout)
	defer cancel()
	transcribed, err := transcriber.Transcribe(transcriptionCtx, prepared)
	if err != nil {
		return result, err
	}
	return transcribed, nil
}

func invokePublishAction(ctx context.Context, result podscriber.TranscriptionResult) (json.RawMessage, error) {
	functionName := strings.TrimSpace(os.Getenv(backendLambdaNameEnv))
	if functionName == "" {
		return nil, fmt.Errorf("%s must be set", backendLambdaNameEnv)
	}
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("load AWS config: %w", err)
	}
	return invokeLambda(ctx, awslambda.NewFromConfig(cfg), functionName, result)
}

func invokeLambda(ctx context.Context, client lambdaInvoker, functionName string, result podscriber.TranscriptionResult) (json.RawMessage, error) {
	payload, err := json.Marshal(publishRequest{Action: publishAction, Transcription: result})
	if err != nil {
		return nil, fmt.Errorf("encode Lambda request: %w", err)
	}
	output, err := client.Invoke(ctx, &awslambda.InvokeInput{FunctionName: &functionName, Payload: payload})
	if err != nil {
		return nil, fmt.Errorf("invoke backend Lambda: %w", err)
	}
	if output.FunctionError != nil {
		return nil, fmt.Errorf("backend Lambda failed (%s): %s", *output.FunctionError, strings.TrimSpace(string(output.Payload)))
	}
	if len(output.Payload) == 0 || !json.Valid(output.Payload) {
		return nil, errors.New("backend Lambda returned an empty or invalid JSON response")
	}
	return json.RawMessage(output.Payload), nil
}
