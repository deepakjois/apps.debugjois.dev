package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend/transcripts"
)

const cliTimeout = 2 * time.Minute

var newTranscriptIndexS3ClientFunc = newTranscriptIndexS3Client

type cliOptions struct {
	write bool
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), cliTimeout)
	defer cancel()

	if err := run(ctx, os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string, stdout io.Writer) error {
	options, err := parseArgs(args)
	if err != nil {
		return err
	}

	client, err := newTranscriptIndexS3ClientFunc(ctx, transcripts.BucketName)
	if err != nil {
		return err
	}

	var index transcripts.Index
	if options.write {
		index, err = transcripts.RefreshIndex(ctx, client, transcripts.BucketName)
	} else {
		index, err = buildIndex(ctx, client)
	}
	if err != nil {
		return err
	}

	body, err := transcripts.MarshalIndex(index)
	if err != nil {
		return err
	}

	if err := writeIndentedJSON(stdout, body); err != nil {
		return fmt.Errorf("encode transcript index: %w", err)
	}

	return nil
}

func parseArgs(args []string) (cliOptions, error) {
	flags := flag.NewFlagSet("podcast-index", flag.ContinueOnError)
	flags.SetOutput(io.Discard)

	write := flags.Bool("write", false, "Write transcripts/transcripts.json back to the bucket")
	if err := flags.Parse(args); err != nil {
		return cliOptions{}, fmt.Errorf("parse flags: %w", err)
	}

	if flags.NArg() != 0 {
		return cliOptions{}, fmt.Errorf("expected no positional arguments")
	}

	return cliOptions{write: *write}, nil
}

func buildIndex(ctx context.Context, client transcripts.S3Client) (transcripts.Index, error) {
	snapshot, err := transcripts.ReadIndex(ctx, client, transcripts.BucketName)
	if err != nil {
		return transcripts.Index{}, err
	}
	return transcripts.BuildIndex(ctx, client, transcripts.BucketName, snapshot.Index)
}

func newTranscriptIndexS3Client(ctx context.Context, bucketName string) (transcripts.S3Client, error) {
	return transcripts.NewS3Client(ctx, bucketName)
}

func writeIndentedJSON(w io.Writer, body []byte) error {
	var indented bytes.Buffer
	if err := json.Indent(&indented, body, "", "  "); err != nil {
		return err
	}
	indented.WriteByte('\n')

	_, err := w.Write(indented.Bytes())
	return err
}
