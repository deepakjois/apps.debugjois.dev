package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/joho/godotenv"
)

const defaultLocalDotEnvPath = ".env"

func main() {
	ctx := context.Background()
	_ = loadOptionalLocalEnvFile()

	if isLambdaRuntime() {
		lambda.Start(handleDirectRuntimeEvent)
		return
	}

	if len(os.Args) < 2 {
		printUsage(os.Stderr)
		os.Exit(1)
	}

	switch os.Args[1] {
	case "invoke":
		if err := runInvoke(ctx, os.Args[2:], os.Stdin, os.Stdout); err != nil {
			log.Fatal(err)
		}
	default:
		printUsage(os.Stderr)
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		os.Exit(1)
	}
}

func printUsage(w io.Writer) {
	_, _ = fmt.Fprintf(w, "Usage: %s <command> [args]\n\n", os.Args[0])
	_, _ = fmt.Fprintf(w, "Commands:\n")
	_, _ = fmt.Fprintf(w, "  invoke   Process a direct/EventBridge JSON payload (from stdin or --payload file)\n")
}

func runInvoke(ctx context.Context, args []string, stdin io.Reader, stdout io.Writer) error {
	invokeFlags := flag.NewFlagSet("invoke", flag.ContinueOnError)
	invokeFlags.SetOutput(io.Discard)
	payloadFile := invokeFlags.String("payload", "", "Path to JSON payload file (reads from stdin if not set)")
	if err := invokeFlags.Parse(args); err != nil {
		return fmt.Errorf("parse invoke flags: %w", err)
	}
	if invokeFlags.NArg() != 0 {
		return fmt.Errorf("invoke does not accept positional arguments")
	}

	payload, err := readInvokePayload(*payloadFile, stdin)
	if err != nil {
		return err
	}

	result, err := dispatchBackendEvent(ctx, payload)
	if err != nil {
		return err
	}
	if result == nil {
		return nil
	}

	if _, err := fmt.Fprintln(stdout, string(result)); err != nil {
		return fmt.Errorf("write invoke response: %w", err)
	}

	return nil
}

func readInvokePayload(payloadFile string, stdin io.Reader) (json.RawMessage, error) {
	var (
		payload []byte
		err     error
	)

	if strings.TrimSpace(payloadFile) != "" {
		payload, err = os.ReadFile(payloadFile)
	} else {
		payload, err = io.ReadAll(stdin)
	}
	if err != nil {
		return nil, fmt.Errorf("read invoke payload: %w", err)
	}

	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 {
		return nil, errors.New("invoke payload is empty")
	}

	return json.RawMessage(payload), nil
}

func handleDirectRuntimeEvent(ctx context.Context, payload json.RawMessage) (json.RawMessage, error) {
	return dispatchBackendEvent(ctx, payload)
}

func isLambdaRuntime() bool {
	return strings.TrimSpace(os.Getenv("AWS_LAMBDA_RUNTIME_API")) != ""
}

func loadOptionalLocalEnvFile() error {
	if _, err := os.Stat(defaultLocalDotEnvPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("stat local env file %q: %w", defaultLocalDotEnvPath, err)
	}

	if err := godotenv.Overload(defaultLocalDotEnvPath); err != nil {
		return fmt.Errorf("load local env file %q: %w", defaultLocalDotEnvPath, err)
	}

	return nil
}
