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

func TestRunInvokeReadsPayloadFromStdin(t *testing.T) {
	var stdout bytes.Buffer
	err := runInvoke(context.Background(), nil, strings.NewReader(`{"action":"health-check"}`), &stdout)
	if err != nil {
		t.Fatalf("run invoke: %v", err)
	}

	var got map[string]bool
	if err := json.Unmarshal(bytes.TrimSpace(stdout.Bytes()), &got); err != nil {
		t.Fatalf("unmarshal stdout: %v", err)
	}
	if !got["ok"] {
		t.Fatalf("expected ok response, got %q", stdout.String())
	}
}

func TestRunInvokeReadsPayloadFromFile(t *testing.T) {
	dir := t.TempDir()
	payloadPath := filepath.Join(dir, "event.json")
	if err := os.WriteFile(payloadPath, []byte(`{"action":"health-check"}`), 0o600); err != nil {
		t.Fatalf("write payload: %v", err)
	}

	var stdout bytes.Buffer
	if err := runInvoke(context.Background(), []string{"--payload", payloadPath}, strings.NewReader(""), &stdout); err != nil {
		t.Fatalf("run invoke: %v", err)
	}
	if !strings.Contains(stdout.String(), `"ok":true`) {
		t.Fatalf("expected ok response, got %q", stdout.String())
	}
}

func TestRunInvokeRejectsEmptyPayload(t *testing.T) {
	var stdout bytes.Buffer
	if err := runInvoke(context.Background(), nil, strings.NewReader("  \n"), &stdout); err == nil {
		t.Fatal("expected empty payload error")
	}
}

func TestDispatchBackendEventHandlesScheduledEvent(t *testing.T) {
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"source":"aws.events","detail-type":"Scheduled Event","id":"evt-1"}`))
	if err != nil {
		t.Fatalf("dispatch scheduled event: %v", err)
	}
	if !strings.Contains(string(body), `"ok":true`) {
		t.Fatalf("expected ok response, got %s", string(body))
	}
}
