import { InvokeCommand, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_PODSCRIBER_LAMBDA_FUNCTION_NAME,
  getPodscriberLambdaFunctionName,
  invokePodscriberLambda,
} from "../../lib/podscriber/lambda";

class FakeLambdaClient {
  commands: InvokeCommand[] = [];

  constructor(private readonly output: InvokeCommandOutput) {}

  async send(command: InvokeCommand): Promise<InvokeCommandOutput> {
    this.commands.push(command);
    return this.output;
  }
}

function encodedPayload(value: unknown): Uint8Array {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
}

describe("podscriber Lambda invoke helper", () => {
  test("uses the configured Lambda name with default fallback", () => {
    expect(getPodscriberLambdaFunctionName({})).toBe(DEFAULT_PODSCRIBER_LAMBDA_FUNCTION_NAME);
    expect(
      getPodscriberLambdaFunctionName({ PODSCRIBER_LAMBDA_FUNCTION_NAME: " custom-name " }),
    ).toBe("custom-name");
  });

  test("invokes Lambda with direct queue-podcast-transcription JSON", async () => {
    const client = new FakeLambdaClient({
      $metadata: {},
      Payload: encodedPayload({
        podcast: { episode: { title: "Episode" } },
        transcription_lambda_id: "request-123",
      }),
    });

    await expect(
      invokePodscriberLambda(" Shared from Podcast Addict ", {
        client,
        functionName: "target-lambda",
      }),
    ).resolves.toMatchObject({ transcription_lambda_id: "request-123" });

    expect(client.commands).toHaveLength(1);
    const input = client.commands[0]?.input;
    expect(input).toMatchObject({
      FunctionName: "target-lambda",
      InvocationType: "RequestResponse",
    });
    expect(JSON.parse(new TextDecoder().decode(input?.Payload as Uint8Array))).toEqual({
      action: "queue-podcast-transcription",
      text: "Shared from Podcast Addict",
    });
  });

  test("rejects empty text before invoking Lambda", async () => {
    const client = new FakeLambdaClient({ $metadata: {} });

    await expect(invokePodscriberLambda("   ", { client })).rejects.toThrow(
      "Paste the Podcast Addict payload before submitting.",
    );
    expect(client.commands).toHaveLength(0);
  });

  test("maps Lambda function errors to readable errors", async () => {
    const client = new FakeLambdaClient({
      $metadata: {},
      FunctionError: "Unhandled",
      Payload: encodedPayload({ errorMessage: "expected Podcast Addict episode URL" }),
    });

    await expect(invokePodscriberLambda("bad", { client })).rejects.toThrow(
      "expected Podcast Addict episode URL",
    );
  });

  test("rejects invalid Lambda JSON responses", async () => {
    const client = new FakeLambdaClient({
      $metadata: {},
      Payload: encodedPayload("not-json"),
    });

    await expect(invokePodscriberLambda("payload", { client })).rejects.toThrow(
      "Lambda returned invalid JSON",
    );
  });
});
