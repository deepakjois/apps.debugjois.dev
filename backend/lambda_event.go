package main

import "encoding/json"

type eventType int

const (
	eventTypeAPIGateway eventType = iota
	eventTypeScheduled
	eventTypeDirect
)

// eventProbe unmarshals only the fields needed to classify a Lambda payload.
type eventProbe struct {
	// API Gateway V2 events are intentionally not handled by this local-only port.
	RequestContext *struct {
		HTTP *struct{} `json:"http"`
	} `json:"requestContext"`

	// EventBridge events include source and detail-type.
	Source     string `json:"source"`
	DetailType string `json:"detail-type"`
}

func classifyEvent(payload json.RawMessage) eventType {
	var probe eventProbe
	if err := json.Unmarshal(payload, &probe); err != nil {
		return eventTypeDirect
	}

	if probe.RequestContext != nil && probe.RequestContext.HTTP != nil {
		return eventTypeAPIGateway
	}

	if probe.Source != "" && probe.DetailType != "" {
		return eventTypeScheduled
	}

	return eventTypeDirect
}
