package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestDispatchEnvelopes(t *testing.T) {
	for _, tc := range []struct{ name, payload, wantError string }{
		{"health", `{"action":" health-check ","future":true}`, ""},
		{"scheduled", `{"source":"aws.events","detail-type":"Scheduled Event"}`, ""},
		{"future EventBridge", `{"source":"future.service","detail-type":"New Type","action":"unknown"}`, ""},
		{"API precedence", `{"requestContext":{"http":{}},"source":"aws.events","detail-type":"Scheduled Event"}`, "API Gateway events are not supported"},
		{"partial envelope", `{"source":"future","action":"health-check"}`, ""},
		{"empty", `{}`, "unknown direct invocation action"},
		{"unknown", `{"action":"new-action"}`, "unknown direct invocation action"},
		{"old alias", `{"action":"transcribe"}`, "unknown direct invocation action"},
		{"malformed", `{`, "unmarshal direct invocation payload"},
		{"wrong field type", `{"action":3}`, "unmarshal direct invocation payload"},
		{"malformed schedule", `{"source":"aws.events","detail-type":"Scheduled Event","time":"bad"}`, "unmarshal EventBridge event"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := dispatchBackendEvent(context.Background(), json.RawMessage(tc.payload))
			if tc.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.wantError) || body != nil {
					t.Fatalf("body=%s err=%v", body, err)
				}
			} else if err != nil || string(body) != `{"ok":true}` {
				t.Fatalf("body=%s err=%v", body, err)
			}
		})
	}
}
