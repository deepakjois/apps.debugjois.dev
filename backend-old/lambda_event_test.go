package main

import (
	"encoding/json"
	"testing"
)

func TestClassifyAPIGatewayV2Event(t *testing.T) {
	payload := json.RawMessage(`{"requestContext":{"http":{"method":"GET"}}}`)

	if got := classifyEvent(payload); got != eventTypeAPIGateway {
		t.Fatalf("expected API Gateway event, got %v", got)
	}
}

func TestClassifyScheduledEvent(t *testing.T) {
	payload := json.RawMessage(`{"source":"aws.events","detail-type":"Scheduled Event"}`)

	if got := classifyEvent(payload); got != eventTypeScheduled {
		t.Fatalf("expected scheduled event, got %v", got)
	}
}

func TestClassifyDirectInvocation(t *testing.T) {
	payload := json.RawMessage(`{"action":"health-check"}`)

	if got := classifyEvent(payload); got != eventTypeDirect {
		t.Fatalf("expected direct event, got %v", got)
	}
}

func TestClassifyMalformedJSON(t *testing.T) {
	if got := classifyEvent(json.RawMessage(`{`)); got != eventTypeDirect {
		t.Fatalf("expected malformed JSON to be direct, got %v", got)
	}
}
