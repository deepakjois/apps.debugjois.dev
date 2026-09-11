package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend/dailylog"
	"github.com/deepakjois/apps.debugjois.dev/backend/dailylog/gdrive"
)

// dailyLogResponse is the existing base64-encoded daily-log wire format.
type dailyLogResponse struct {
	Title    string `json:"title"`
	Contents string `json:"contents"`
}

var newDailyLogStore = func(ctx context.Context) (dailylog.Store, error) { return gdrive.New(ctx) }
var dailyLogNow = time.Now

func dailyLogLocation() *time.Location {
	location, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		return time.FixedZone("CET", 60*60)
	}
	return location
}

func handleGetDailyLog(ctx context.Context) (json.RawMessage, error) {
	store, err := newDailyLogStore(ctx)
	if err != nil {
		return nil, err
	}
	entry, err := dailylog.New(store, dailyLogLocation()).Read(ctx)
	if err != nil {
		return nil, err
	}
	return json.Marshal(dailyLogResponse{Title: entry.Title, Contents: base64.StdEncoding.EncodeToString(entry.Contents)})
}

func handlePostDailyLog(ctx context.Context, title, encodedContents string) (json.RawMessage, error) {
	title = strings.TrimSpace(title)
	date := dailyLogNow().In(dailyLogLocation()).Format(time.DateOnly)
	if title != date+".md" {
		return nil, fmt.Errorf("title must match current date %s.md", date)
	}
	contents, err := base64.StdEncoding.DecodeString(encodedContents)
	if err != nil {
		return nil, errors.New("contents must be valid base64")
	}
	store, err := newDailyLogStore(ctx)
	if err != nil {
		return nil, err
	}
	// Save the validated filename, even if Drive initialization crosses midnight.
	if err := store.Save(ctx, title, contents); err != nil {
		return nil, err
	}
	return json.Marshal(dailyLogResponse{Title: title, Contents: encodedContents})
}
