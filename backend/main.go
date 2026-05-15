package main

import (
	"bytes"
	"context"
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
	if isLambdaRuntime() {
		lambda.Start(handleInvocation)
		return
	}

	startLocal(handleInvocation)
}

// InvocationRequest is the temporary input shape used while the backend is rebuilt.
type InvocationRequest struct {
	Message string `json:"message"`
}

// InvocationResponse is the temporary output shape shared by Lambda and local runs.
type InvocationResponse struct {
	Message string `json:"message"`
	Runtime string `json:"runtime"`
}

func handleInvocation(_ context.Context, request InvocationRequest) (InvocationResponse, error) {
	message := strings.TrimSpace(request.Message)
	if message == "" {
		message = "hello world"
	}

	return InvocationResponse{
		Message: message,
		Runtime: runtimeName(),
	}, nil
}

func startLocal(handler any) {
	if err := runLocal(context.Background(), handler, os.Args[1:], os.Stdin, os.Stdout); err != nil {
		log.Fatal(err)
	}
}

func runLocal(ctx context.Context, handler any, args []string, stdin io.Reader, stdout io.Writer) error {
	if err := loadOptionalLocalEnvFile(); err != nil {
		return err
	}

	payload, err := localPayload(args, stdin)
	if err != nil {
		return err
	}

	response, err := lambda.NewHandler(handler).Invoke(ctx, payload)
	if err != nil {
		return fmt.Errorf("invoke local handler: %w", err)
	}

	if _, err := stdout.Write(response); err != nil {
		return fmt.Errorf("write local invocation response: %w", err)
	}
	if _, err := fmt.Fprintln(stdout); err != nil {
		return fmt.Errorf("write local invocation newline: %w", err)
	}

	return nil
}

func localPayload(args []string, stdin io.Reader) ([]byte, error) {
	localFlags := flag.NewFlagSet("local", flag.ContinueOnError)
	localFlags.SetOutput(io.Discard)

	payloadValue := localFlags.String("payload", "", "JSON payload to invoke locally")
	payloadFile := localFlags.String("payload-file", "", "JSON payload file to invoke locally, or - for stdin")
	if err := localFlags.Parse(args); err != nil {
		return nil, fmt.Errorf("parse local flags: %w", err)
	}
	if localFlags.NArg() != 0 {
		return nil, fmt.Errorf("unexpected local arguments: %s", strings.Join(localFlags.Args(), " "))
	}
	if strings.TrimSpace(*payloadValue) != "" && strings.TrimSpace(*payloadFile) != "" {
		return nil, fmt.Errorf("use only one of --payload or --payload-file")
	}

	var (
		payload []byte
		err     error
	)
	switch {
	case strings.TrimSpace(*payloadValue) != "":
		payload = []byte(*payloadValue)
	case strings.TrimSpace(*payloadFile) == "-":
		payload, err = io.ReadAll(stdin)
	case strings.TrimSpace(*payloadFile) != "":
		payload, err = os.ReadFile(*payloadFile)
	default:
		payload = []byte(`{}`)
	}
	if err != nil {
		return nil, fmt.Errorf("read local invocation payload: %w", err)
	}

	payload = bytes.TrimSpace(payload)
	if len(payload) == 0 {
		payload = []byte(`{}`)
	}

	return payload, nil
}

func isLambdaRuntime() bool {
	return strings.TrimSpace(os.Getenv("AWS_LAMBDA_RUNTIME_API")) != ""
}

func runtimeName() string {
	if isLambdaRuntime() {
		return "lambda"
	}

	return "local"
}

func loadOptionalLocalEnvFile() error {
	if _, err := os.Stat(defaultLocalDotEnvPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}

		return fmt.Errorf("stat local env file %q: %w", defaultLocalDotEnvPath, err)
	}

	if err := godotenv.Overload(defaultLocalDotEnvPath); err != nil {
		return fmt.Errorf("load local env file %q: %w", defaultLocalDotEnvPath, err)
	}

	return nil
}
