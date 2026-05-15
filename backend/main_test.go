package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunLocalInvokesHandlerWithPayload(t *testing.T) {
	var stdout bytes.Buffer

	err := runLocal(
		context.Background(),
		handleInvocation,
		[]string{"--payload", `{"message":"local hello"}`},
		strings.NewReader(`{"message":"local hello"}`),
		&stdout,
	)
	if err != nil {
		t.Fatalf("run local: %v", err)
	}

	var got InvocationResponse
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &got); err != nil {
		t.Fatalf("unmarshal local response: %v", err)
	}
	if got.Message != "local hello" {
		t.Fatalf("expected local message, got %q", got.Message)
	}
	if got.Runtime != "local" {
		t.Fatalf("expected local runtime, got %q", got.Runtime)
	}
}

func TestRunLocalLoadsDotEnvBeforeHandler(t *testing.T) {
	t.Setenv("BACKEND_LOCAL_ENV_TEST", "")
	originalDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("get current directory: %v", err)
	}
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatalf("change to temp directory: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(originalDir); err != nil {
			t.Fatalf("restore current directory: %v", err)
		}
	})
	if err := os.WriteFile(filepath.Join(".", defaultLocalDotEnvPath), []byte("BACKEND_LOCAL_ENV_TEST=loaded\n"), 0o600); err != nil {
		t.Fatalf("write env file: %v", err)
	}

	var stdout bytes.Buffer
	handler := func(context.Context, InvocationRequest) (InvocationResponse, error) {
		return InvocationResponse{
			Message: os.Getenv("BACKEND_LOCAL_ENV_TEST"),
			Runtime: runtimeName(),
		}, nil
	}

	if err := runLocal(context.Background(), handler, nil, strings.NewReader(`{}`), &stdout); err != nil {
		t.Fatalf("run local: %v", err)
	}

	var got InvocationResponse
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &got); err != nil {
		t.Fatalf("unmarshal local response: %v", err)
	}
	if got.Message != "loaded" {
		t.Fatalf("expected dotenv value, got %q", got.Message)
	}
}

func TestRunLocalReadsExplicitStdinPayload(t *testing.T) {
	var stdout bytes.Buffer

	err := runLocal(
		context.Background(),
		handleInvocation,
		[]string{"--payload-file", "-"},
		strings.NewReader(`{"message":"stdin hello"}`),
		&stdout,
	)
	if err != nil {
		t.Fatalf("run local: %v", err)
	}

	var got InvocationResponse
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &got); err != nil {
		t.Fatalf("unmarshal local response: %v", err)
	}
	if got.Message != "stdin hello" {
		t.Fatalf("expected stdin message, got %q", got.Message)
	}
}
