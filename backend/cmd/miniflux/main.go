// Command miniflux reads podcast entries from Miniflux and queues starred
// episodes for transcription by the backend Lambda.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go-v2/config"
	awslambda "github.com/aws/aws-sdk-go-v2/service/lambda"

	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/resolvers/miniflux"
	"github.com/deepakjois/apps.debugjois.dev/backend/podscriber/starred"
)

const backendLambdaNameEnv = "BACKEND_LAMBDA_FUNCTION_NAME"

const usage = `usage:
  miniflux entry [-url instance] <entry-URL-or-ID>   print one entry's transcription input
  miniflux starred [-url instance]                   print every starred entry
  miniflux queue-starred [-url instance] [-dry-run]  queue starred episodes on the backend Lambda`

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdout, os.Stderr); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// entryReport is one starred entry and, for podcast episodes, its parsed
// transcription input or parse error.
type entryReport struct {
	EntryID     int64                          `json:"entry_id"`
	Feed        string                         `json:"feed"`
	Title       string                         `json:"title"`
	MinifluxURL string                         `json:"miniflux_url"`
	HasAudio    bool                           `json:"has_audio"`
	Error       string                         `json:"error,omitempty"`
	Parsed      *podscriber.TranscriptionInput `json:"parsed,omitempty"`
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		return errors.New(usage)
	}
	command, args := args[0], args[1:]
	flags := flag.NewFlagSet("miniflux "+command, flag.ContinueOnError)
	flags.SetOutput(stderr)
	baseURL := flags.String("url", envOr(miniflux.BaseURLEnv, miniflux.DefaultBaseURL), "Miniflux instance URL (env "+miniflux.BaseURLEnv+")")
	dryRun := false
	if command == "queue-starred" {
		flags.BoolVar(&dryRun, "dry-run", false, "list the entries that would be queued without invoking Lambda")
	}
	if err := flags.Parse(args); err != nil {
		return err
	}
	newClient := func() (*miniflux.Client, error) {
		client, err := miniflux.New(miniflux.Config{BaseURL: *baseURL, Token: os.Getenv(miniflux.TokenEnv)})
		if err != nil {
			return nil, fmt.Errorf("%w (set %s)", err, miniflux.TokenEnv)
		}
		return client, nil
	}

	switch {
	case command == "entry" && flags.NArg() == 1:
		client, err := newClient()
		if err != nil {
			return err
		}
		return printEntry(ctx, client, flags.Arg(0), stdout)
	case command == "starred" && flags.NArg() == 0:
		client, err := newClient()
		if err != nil {
			return err
		}
		return printStarred(ctx, client, stdout, stderr)
	case command == "queue-starred" && flags.NArg() == 0:
		client, err := newClient()
		if err != nil {
			return err
		}
		return queueStarred(ctx, client, dryRun, stdout, stderr)
	default:
		return errors.New(usage)
	}
}

// printEntry prints the transcription input for one entry URL or bare entry ID.
func printEntry(ctx context.Context, client *miniflux.Client, input string, stdout io.Writer) error {
	input = strings.TrimSpace(input)
	var (
		parsed podscriber.TranscriptionInput
		err    error
	)
	if id, convErr := strconv.ParseInt(input, 10, 64); convErr == nil {
		entry, fetchErr := client.Entry(ctx, id)
		if fetchErr != nil {
			return fetchErr
		}
		parsed, err = client.ParseEntry(client.EntryURL(entry), entry)
	} else if extractor := miniflux.NewExtractor(client); extractor.CanHandle(input) {
		parsed, err = extractor.Extract(ctx, input)
	} else {
		return fmt.Errorf("not a Miniflux entry URL or ID: %q", input)
	}
	if err != nil {
		return err
	}
	return writeJSON(stdout, parsed)
}

// printStarred prints every starred entry, parsing those with audio. It fails
// only when a podcast entry cannot be parsed; articles are reported as such.
func printStarred(ctx context.Context, client *miniflux.Client, stdout, stderr io.Writer) error {
	entries, err := client.StarredEntries(ctx)
	if err != nil {
		return err
	}
	reports := make([]entryReport, 0, len(entries))
	podcasts, failed := 0, 0
	for _, entry := range entries {
		report := entryReport{
			EntryID:     entry.ID,
			Feed:        entry.Feed.Title,
			Title:       entry.Title,
			MinifluxURL: client.EntryURL(entry),
			HasAudio:    miniflux.HasAudio(entry),
		}
		if report.HasAudio {
			podcasts++
			parsed, err := client.ParseEntry(report.MinifluxURL, entry)
			if err != nil {
				report.Error = err.Error()
				failed++
			} else {
				report.Parsed = &parsed
			}
		}
		reports = append(reports, report)
	}
	if err := writeJSON(stdout, reports); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stderr, "%d starred entries: %d with audio, %d failed to parse\n", len(entries), podcasts, failed)
	if failed > 0 {
		return fmt.Errorf("%d of %d starred podcast entries failed to parse", failed, podcasts)
	}
	return nil
}

// queueStarred sends each starred podcast entry to the backend Lambda's
// single-URL queue action, the same iteration the queue-miniflux-starred
// Lambda action runs.
func queueStarred(ctx context.Context, client *miniflux.Client, dryRun bool, stdout, stderr io.Writer) error {
	var dispatch starred.Dispatcher
	if !dryRun {
		functionName := strings.TrimSpace(os.Getenv(backendLambdaNameEnv))
		if functionName == "" {
			return fmt.Errorf("%s must be set (or pass -dry-run)", backendLambdaNameEnv)
		}
		cfg, err := config.LoadDefaultConfig(ctx)
		if err != nil {
			return fmt.Errorf("load AWS config: %w", err)
		}
		dispatch = starred.LambdaDispatcher(awslambda.NewFromConfig(cfg), functionName)
	}
	report, err := starred.Queue(ctx, client, dispatch)
	if err != nil {
		return err
	}
	if err := writeJSON(stdout, report); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stderr, "%d starred entries: %d queued, %d already transcribed, %d without audio, %d dry run, %d failed\n",
		len(report.Entries), report.Counts[starred.StatusQueued], report.Counts[starred.StatusAlreadyTranscribed],
		report.Counts[starred.StatusNoAudio], report.Counts[starred.StatusDryRun], report.Failed())
	if report.Failed() > 0 {
		return fmt.Errorf("%d starred entries failed to queue", report.Failed())
	}
	return nil
}

func writeJSON(w io.Writer, value any) error {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return fmt.Errorf("write JSON: %w", err)
	}
	return nil
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
