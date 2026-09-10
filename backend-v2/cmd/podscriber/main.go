package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber/deepgram"
	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber/resolvers"
	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber/resolvers/audiourl"
	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber/resolvers/podcastaddict"
	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber/resolvers/youtube"
	"github.com/deepakjois/apps.debugjois.dev/backend-v2/podscriber/s3publisher"
)

const deepgramAPIKeyEnv = "DEEPGRAM_API_KEY"

func main() {
	if err := run(context.Background(), os.Args[1:], os.Stdin, os.Stdout); err != nil {
		if _, writeErr := fmt.Fprintln(os.Stderr, err); writeErr != nil {
			os.Exit(1)
		}
		os.Exit(1)
	}
}

// cliOptions describes which half of the eventual queue/worker flow to run.
type cliOptions struct {
	parseOnly bool
	publish   bool
	output    string
	input     string
}

func run(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer) (runErr error) {
	options, err := parseArgs(args, stdin)
	if err != nil {
		return err
	}

	apiKey := ""
	if !options.parseOnly {
		apiKey = strings.TrimSpace(os.Getenv(deepgramAPIKeyEnv))
		if apiKey == "" {
			return fmt.Errorf("%s must be set", deepgramAPIKeyEnv)
		}
	}

	workDir, err := os.MkdirTemp("", "podscriber-*")
	if err != nil {
		return fmt.Errorf("create temporary directory: %w", err)
	}
	defer func() {
		if err := os.RemoveAll(workDir); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("remove temporary directory: %w", err))
		}
	}()

	youtubeExtractor, err := youtube.New(youtube.Config{OutputDir: workDir})
	if err != nil {
		return err
	}
	resolver := resolvers.New(
		podcastaddict.New(nil),
		youtubeExtractor,
		audiourl.New(),
	)

	prepared, err := resolver.Resolve(ctx, options.input)
	if err != nil {
		return err
	}
	if options.parseOnly {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(prepared); err != nil {
			return fmt.Errorf("write parsed payload: %w", err)
		}
		return nil
	}

	transcriber, err := deepgram.New(apiKey)
	if err != nil {
		return err
	}
	result, err := transcriber.Transcribe(ctx, prepared)
	if err != nil {
		return err
	}
	if options.publish {
		publisher, err := s3publisher.New(ctx)
		if err != nil {
			return err
		}
		if err := publisher.Publish(ctx, result); err != nil {
			return err
		}
	}
	return writeTranscript(stdout, options.output, result.Transcript.Text)
}

func parseArgs(args []string, stdin io.Reader) (cliOptions, error) {
	flags := flag.NewFlagSet("podscriber", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	parseOnly := flags.Bool("parse", false, "resolve input and print the transcription payload without transcribing")
	publish := flags.Bool("publish", false, "publish the transcript to S3 and refresh the public index")
	output := flags.String("output", "", "write transcript text to this file instead of stdout")
	if err := flags.Parse(args); err != nil {
		return cliOptions{}, fmt.Errorf("parse flags: %w", err)
	}
	if flags.NArg() > 1 {
		return cliOptions{}, usageError()
	}
	if *parseOnly && (*publish || strings.TrimSpace(*output) != "") {
		return cliOptions{}, errors.New("-parse cannot be combined with -publish or -output")
	}

	input := ""
	if flags.NArg() == 1 {
		input = flags.Arg(0)
	} else {
		body, err := io.ReadAll(stdin)
		if err != nil {
			return cliOptions{}, fmt.Errorf("read payload from stdin: %w", err)
		}
		input = string(body)
	}
	input = strings.TrimSpace(input)
	if input == "" {
		return cliOptions{}, usageError()
	}

	return cliOptions{
		parseOnly: *parseOnly,
		publish:   *publish,
		output:    strings.TrimSpace(*output),
		input:     input,
	}, nil
}

func usageError() error {
	return errors.New("usage: podscriber [-parse] [-publish] [-output file] [URL-or-Podcast-Addict-share-text]")
}

func writeTranscript(stdout io.Writer, outputPath, transcript string) error {
	contents := []byte(transcript + "\n")
	if outputPath != "" {
		if err := os.WriteFile(outputPath, contents, 0o600); err != nil {
			return fmt.Errorf("write transcript file %q: %w", outputPath, err)
		}
		return nil
	}
	if _, err := stdout.Write(contents); err != nil {
		return fmt.Errorf("write transcript to stdout: %w", err)
	}
	return nil
}
