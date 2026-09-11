package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/dailylog"
)

// logStore records the storage boundary without Google credentials.
type logStore struct {
	title    string
	contents []byte
	found    bool
	err      error
	saves    int
}

func (s *logStore) Load(_ context.Context, title string) ([]byte, bool, error) {
	s.title = title
	return s.contents, s.found, s.err
}
func (s *logStore) Save(_ context.Context, title string, contents []byte) error {
	s.title = title
	s.contents = contents
	s.saves++
	return s.err
}

func TestDailyLogWireContract(t *testing.T) {
	oldStore, oldNow := newDailyLogStore, dailyLogNow
	t.Cleanup(func() { newDailyLogStore, dailyLogNow = oldStore, oldNow })
	store := &logStore{contents: []byte("hello"), found: true}
	newDailyLogStore = func(context.Context) (dailylog.Store, error) { return store, nil }
	// UTC is still April 28, but Berlin is already April 29.
	dailyLogNow = func() time.Time { return time.Date(2026, 4, 28, 22, 30, 0, 0, time.UTC) }
	body, err := dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"post-daily-log","title":" 2026-04-29.md ","contents":"aGVs\nbG8="}`))
	if err != nil || string(body) != `{"title":"2026-04-29.md","contents":"aGVs\nbG8="}` || store.title != "2026-04-29.md" || string(store.contents) != "hello" {
		t.Fatalf("body=%s store=%+v err=%v", body, store, err)
	}
	for _, payload := range []string{
		`{"action":"post-daily-log","title":"2026-04-28.md","contents":"aGVsbG8="}`,
		`{"action":"post-daily-log","title":"2026-04-29.md","contents":"%%%"}`,
	} {
		if _, err := dispatchBackendEvent(context.Background(), json.RawMessage(payload)); err == nil {
			t.Fatal("accepted invalid post")
		}
	}
	if store.saves != 1 {
		t.Fatalf("invalid post wrote to storage: %d saves", store.saves)
	}
	body, err = dispatchBackendEvent(context.Background(), json.RawMessage(`{"action":"get-daily-log"}`))
	var got dailyLogResponse
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatal(err)
	}
	if got.Title != store.title || got.Contents != "aGVsbG8=" || !strings.HasSuffix(got.Title, ".md") {
		t.Fatalf("unexpected get: %s", body)
	}
	store.err = errors.New("Drive unavailable")
	if _, err := handleGetDailyLog(context.Background()); !errors.Is(err, store.err) {
		t.Fatalf("lost load error: %v", err)
	}
	if _, err := handlePostDailyLog(context.Background(), "2026-04-29.md", ""); !errors.Is(err, store.err) {
		t.Fatalf("lost save error: %v", err)
	}
}
