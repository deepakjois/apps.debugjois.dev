package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	secretsmanagersdk "github.com/aws/aws-sdk-go-v2/service/secretsmanager"

	"github.com/deepakjois/apps.debugjois.dev/backend/internal/transcribe"
)

const deepgramAPIKeySecretARNEnvVar = "DEEPGRAM_API_KEY_SECRET_ARN"

func loadLambdaSecrets(ctx context.Context) error {
	secretARN := strings.TrimSpace(os.Getenv(deepgramAPIKeySecretARNEnvVar))
	if secretARN == "" {
		return fmt.Errorf("%s must be set in Lambda", deepgramAPIKeySecretARNEnvVar)
	}

	apiKey, err := fetchSecretValue(ctx, secretARN)
	if err != nil {
		return fmt.Errorf("load Deepgram API key: %w", err)
	}

	if err := os.Setenv(transcribe.DeepgramAPIKeyEnvVar, apiKey); err != nil {
		return fmt.Errorf("set %s: %w", transcribe.DeepgramAPIKeyEnvVar, err)
	}

	return nil
}

func fetchSecretValue(ctx context.Context, arn string) (string, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("load AWS config for secret %q: %w", arn, err)
	}

	client := secretsmanagersdk.NewFromConfig(cfg)
	output, err := client.GetSecretValue(ctx, &secretsmanagersdk.GetSecretValueInput{
		SecretId: aws.String(arn),
	})
	if err != nil {
		return "", fmt.Errorf("get secret value for %q: %w", arn, err)
	}

	// Secrets Manager stores the raw Deepgram API key as the secret string.
	value := strings.TrimSpace(aws.ToString(output.SecretString))
	if value == "" {
		return "", fmt.Errorf("secret %q is empty", arn)
	}

	return value, nil
}
