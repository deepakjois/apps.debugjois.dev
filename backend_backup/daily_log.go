package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend/internal/transcribe"
)

// dailyLogResponse is the JSON shape shared by daily-log Lambda actions.
type dailyLogResponse struct {
	Title    string `json:"title"`
	Contents string `json:"contents"`
}

var (
	loadDailyLogContentFunc = loadDailyLogContentFromDrive
	saveDailyLogContentFunc = saveDailyLogContentToDrive
	currentDailyDateFunc    = todayStringInBerlin
)

func handleGetDailyLog(ctx context.Context) (json.RawMessage, error) {
	date := currentDailyDateFunc()
	content, err := loadDailyLogContentFunc(ctx, date)
	if err != nil {
		return nil, err
	}

	return json.Marshal(dailyLogResponse{
		Title:    fmt.Sprintf("%s.md", date),
		Contents: encodeDailyLogContents(content),
	})
}

func handlePostDailyLog(ctx context.Context, title, encodedContents string) (json.RawMessage, error) {
	title = strings.TrimSpace(title)
	if err := validateDailyLogTitle(title, currentDailyDateFunc()); err != nil {
		return nil, &transcribe.Error{
			Kind: transcribe.ErrorKindInvalidInput,
			Err:  err,
		}
	}

	contents, err := base64.StdEncoding.DecodeString(encodedContents)
	if err != nil {
		return nil, &transcribe.Error{
			Kind: transcribe.ErrorKindInvalidInput,
			Err:  fmt.Errorf("contents must be valid base64"),
		}
	}

	if err := saveDailyLogContentFunc(ctx, title, string(contents)); err != nil {
		return nil, err
	}

	return json.Marshal(dailyLogResponse{
		Title:    title,
		Contents: encodedContents,
	})
}

func todayStringInBerlin() string {
	return time.Now().In(berlinLocation()).Format("2006-01-02")
}

func validateDailyLogTitle(title, currentDate string) error {
	if title != fmt.Sprintf("%s.md", currentDate) {
		return fmt.Errorf("title must match current date %s.md", currentDate)
	}

	return nil
}

func encodeDailyLogContents(contents string) string {
	return base64.StdEncoding.EncodeToString([]byte(contents))
}

func berlinLocation() *time.Location {
	location, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		return time.FixedZone("CET", 60*60)
	}

	return location
}
