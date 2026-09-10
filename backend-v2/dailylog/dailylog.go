// Package dailylog provides the application logic for reading and writing today's log.
package dailylog

import (
	"context"
	"fmt"
	"time"
)

// Log is a dated Markdown daily log.
type Log struct {
	Title    string
	Contents []byte
}

// Reader reads today's daily log.
type Reader interface {
	Read(context.Context) (Log, error)
}

// Writer writes today's daily log.
type Writer interface {
	Write(context.Context, []byte) error
}

// Store persists daily logs by filename.
type Store interface {
	Load(context.Context, string) (contents []byte, found bool, err error)
	Save(context.Context, string, []byte) error
}

// Service implements daily-log operations independently of any transport.
type Service struct {
	store    Store
	location *time.Location
	now      func() time.Time
}

// New creates a daily-log service using the supplied storage and timezone.
func New(store Store, location *time.Location) *Service {
	return &Service{
		store:    store,
		location: location,
		now:      time.Now,
	}
}

// Read returns today's log, or a new log heading when no file exists yet.
func (s *Service) Read(ctx context.Context) (Log, error) {
	date, title := s.today()
	contents, found, err := s.store.Load(ctx, title)
	if err != nil {
		return Log{}, fmt.Errorf("load daily log: %w", err)
	}
	if !found {
		contents = []byte(fmt.Sprintf("### %s\n", date))
	}

	return Log{Title: title, Contents: contents}, nil
}

// Write replaces today's log contents.
func (s *Service) Write(ctx context.Context, contents []byte) error {
	_, title := s.today()
	if err := s.store.Save(ctx, title, contents); err != nil {
		return fmt.Errorf("save daily log: %w", err)
	}

	return nil
}

func (s *Service) today() (string, string) {
	date := s.now().In(s.location).Format(time.DateOnly)
	return date, date + ".md"
}
