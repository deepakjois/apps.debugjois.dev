package starred

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/miniflux"
)

type invokeFunc func(*awslambda.InvokeInput) (*awslambda.InvokeOutput, error)

func (f invokeFunc) Invoke(_ context.Context, in *awslambda.InvokeInput, _ ...func(*awslambda.Options)) (*awslambda.InvokeOutput, error) {
	return f(in)
}

func audioEntry(id int64) miniflux.Entry {
	return miniflux.Entry{ID: id, FeedID: 1, Title: "Episode", Enclosures: []miniflux.Enclosure{{URL: "https://cdn.example.com/a.mp3", MimeType: "audio/mpeg"}}}
}

func TestQueueContinuesAfterFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"total": 3, "entries": []miniflux.Entry{audioEntry(1), audioEntry(2), audioEntry(3)}})
	}))
	t.Cleanup(server.Close)
	client, err := miniflux.New(miniflux.Config{BaseURL: server.URL, Token: "secret"})
	if err != nil {
		t.Fatal(err)
	}

	var texts []string
	dispatch := LambdaDispatcher(invokeFunc(func(in *awslambda.InvokeInput) (*awslambda.InvokeOutput, error) {
		var request QueueRequest
		if err := json.Unmarshal(in.Payload, &request); err != nil || request.Action != QueueAction || !request.SkipExisting {
			t.Fatalf("payload = %s", in.Payload)
		}
		texts = append(texts, request.Text)
		switch {
		case strings.HasSuffix(request.Text, "/entry/1"):
			return nil, errors.New("throttled")
		case strings.HasSuffix(request.Text, "/entry/2"):
			return &awslambda.InvokeOutput{FunctionError: aws.String("Unhandled"), Payload: []byte(`{"errorMessage":"no audio"}`)}, nil
		default:
			return &awslambda.InvokeOutput{Payload: []byte(`{"transcription_lambda_id":"worker-3"}`)}, nil
		}
	}), "backend")

	report, err := Queue(context.Background(), client, dispatch)
	if err != nil {
		t.Fatal(err)
	}
	if len(texts) != 3 || report.Failed() != 2 || report.Counts[StatusQueued] != 1 {
		t.Fatalf("texts=%v report=%+v", texts, report)
	}
	if !strings.Contains(report.Entries[0].Error, "throttled") || !strings.Contains(report.Entries[1].Error, "no audio") ||
		report.Entries[2].TranscriptionLambdaID != "worker-3" {
		t.Fatalf("entries = %+v", report.Entries)
	}
}
