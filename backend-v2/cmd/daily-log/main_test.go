package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/dailylog"
)

type stubReader struct {
	log dailylog.Log
	err error
}

func (r stubReader) Read(context.Context) (dailylog.Log, error) {
	return r.log, r.err
}

type stubWriter struct {
	contents []byte
	err      error
}

func (w *stubWriter) Write(_ context.Context, contents []byte) error {
	w.contents = contents
	return w.err
}

func TestRunReadWritesRawContents(t *testing.T) {
	var stdout bytes.Buffer
	reader := stubReader{log: dailylog.Log{Title: "2026-04-29.md", Contents: []byte("### Today\n\ntext")}}
	if err := run(context.Background(), []string{"read"}, strings.NewReader("ignored"), &stdout, reader, &stubWriter{}); err != nil {
		t.Fatalf("run read: %v", err)
	}
	if stdout.String() != "### Today\n\ntext" {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestRunWriteReadsAllOfStdin(t *testing.T) {
	writer := &stubWriter{}
	stdin := "### Today\n\nreplacement without trailing newline"
	if err := run(context.Background(), []string{"write"}, strings.NewReader(stdin), &bytes.Buffer{}, stubReader{}, writer); err != nil {
		t.Fatalf("run write: %v", err)
	}
	if string(writer.contents) != stdin {
		t.Fatalf("written contents = %q", writer.contents)
	}
}

func TestRunRejectsInvalidCommand(t *testing.T) {
	for name, args := range map[string][]string{
		"missing": nil,
		"extra":   {"read", "extra"},
		"unknown": {"delete"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := run(context.Background(), args, strings.NewReader(""), &bytes.Buffer{}, stubReader{}, &stubWriter{}); err == nil {
				t.Fatal("expected command error")
			}
		})
	}
}

func TestRunPropagatesOperationErrors(t *testing.T) {
	expected := errors.New("operation failed")
	if err := run(context.Background(), []string{"read"}, strings.NewReader(""), &bytes.Buffer{}, stubReader{err: expected}, &stubWriter{}); !errors.Is(err, expected) {
		t.Fatalf("read error = %v", err)
	}

	writer := &stubWriter{err: expected}
	if err := run(context.Background(), []string{"write"}, strings.NewReader("text"), &bytes.Buffer{}, stubReader{}, writer); !errors.Is(err, expected) {
		t.Fatalf("write error = %v", err)
	}
}
