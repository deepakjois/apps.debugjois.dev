package dailylog

import (
	"context"
	"errors"
	"testing"
	"time"
)

type memoryStore struct {
	contents  []byte
	found     bool
	loadErr   error
	saveErr   error
	loadedKey string
	savedKey  string
	saved     []byte
}

func (s *memoryStore) Load(_ context.Context, key string) ([]byte, bool, error) {
	s.loadedKey = key
	return s.contents, s.found, s.loadErr
}

func (s *memoryStore) Save(_ context.Context, key string, contents []byte) error {
	s.savedKey = key
	s.saved = contents
	return s.saveErr
}

func newTestService(t *testing.T, store Store) *Service {
	t.Helper()

	location, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		t.Fatalf("load timezone: %v", err)
	}
	service := New(store, location)
	service.now = func() time.Time {
		// This instant is still the previous day in UTC, but April 29 in Berlin.
		return time.Date(2026, 4, 28, 22, 30, 0, 0, time.UTC)
	}
	return service
}

func TestServiceReadExistingLog(t *testing.T) {
	store := &memoryStore{contents: []byte("existing\n"), found: true}
	log, err := newTestService(t, store).Read(context.Background())
	if err != nil {
		t.Fatalf("read daily log: %v", err)
	}
	if store.loadedKey != "2026-04-29.md" {
		t.Fatalf("loaded key = %q", store.loadedKey)
	}
	if log.Title != "2026-04-29.md" || string(log.Contents) != "existing\n" {
		t.Fatalf("unexpected log: %#v", log)
	}
}

func TestServiceReadMissingLogReturnsHeading(t *testing.T) {
	log, err := newTestService(t, &memoryStore{}).Read(context.Background())
	if err != nil {
		t.Fatalf("read daily log: %v", err)
	}
	if string(log.Contents) != "### 2026-04-29\n" {
		t.Fatalf("contents = %q", log.Contents)
	}
}

func TestServiceWrite(t *testing.T) {
	store := &memoryStore{}
	contents := []byte("### updated\n")
	if err := newTestService(t, store).Write(context.Background(), contents); err != nil {
		t.Fatalf("write daily log: %v", err)
	}
	if store.savedKey != "2026-04-29.md" || string(store.saved) != string(contents) {
		t.Fatalf("saved key %q with contents %q", store.savedKey, store.saved)
	}
}

func TestServiceWrapsStoreErrors(t *testing.T) {
	expected := errors.New("drive unavailable")
	service := newTestService(t, &memoryStore{loadErr: expected})
	if _, err := service.Read(context.Background()); !errors.Is(err, expected) {
		t.Fatalf("read error = %v", err)
	}

	service = newTestService(t, &memoryStore{saveErr: expected})
	if err := service.Write(context.Background(), nil); !errors.Is(err, expected) {
		t.Fatalf("write error = %v", err)
	}
}
