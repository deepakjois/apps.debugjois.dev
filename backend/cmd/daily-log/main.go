package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"time"

	"github.com/deepakjois/apps.debugjois.dev/backend/dailylog"
	"github.com/deepakjois/apps.debugjois.dev/backend/dailylog/gdrive"
)

func main() {
	ctx := context.Background()
	if err := validateArgs(os.Args[1:]); err != nil {
		log.Fatal(err)
	}

	store, err := gdrive.New(ctx)
	if err != nil {
		log.Fatal(err)
	}

	location, err := time.LoadLocation("Europe/Berlin")
	if err != nil {
		log.Fatalf("load Europe/Berlin timezone: %v", err)
	}
	service := dailylog.New(store, location)

	if err := run(ctx, os.Args[1:], os.Stdin, os.Stdout, service, service); err != nil {
		log.Fatal(err)
	}
}

func run(
	ctx context.Context,
	args []string,
	stdin io.Reader,
	stdout io.Writer,
	reader dailylog.Reader,
	writer dailylog.Writer,
) error {
	if err := validateArgs(args); err != nil {
		return err
	}

	if args[0] == "read" {
		log, err := reader.Read(ctx)
		if err != nil {
			return err
		}
		if _, err := stdout.Write(log.Contents); err != nil {
			return fmt.Errorf("write log to stdout: %w", err)
		}
		return nil
	}

	contents, err := io.ReadAll(stdin)
	if err != nil {
		return fmt.Errorf("read log from stdin: %w", err)
	}
	return writer.Write(ctx, contents)
}

func validateArgs(args []string) error {
	if len(args) != 1 {
		return errors.New("usage: daily-log <read|write>")
	}
	if args[0] != "read" && args[0] != "write" {
		return fmt.Errorf("unknown command %q; usage: daily-log <read|write>", args[0])
	}

	return nil
}
