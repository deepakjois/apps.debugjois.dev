import { InvokeCommand, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { describe, expect, test } from "vitest";
import { invokeGetDailyLogLambda, invokePostDailyLogLambda } from "../../lib/logger/lambda";

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

describe("logger Lambda invoke helper", () => {
  test("invokes Lambda with get-daily-log action and decodes contents", async () => {
    const client = new FakeLambdaClient({
      $metadata: {},
      Payload: encodedPayload({
        title: "2026-04-29.md",
        contents: "IyMjIDIwMjYtMDQtMjkK",
      }),
    });

    await expect(
      invokeGetDailyLogLambda({ client, functionName: "target-lambda" }),
    ).resolves.toEqual({
      title: "2026-04-29.md",
      contents: "### 2026-04-29\n",
    });

    expect(
      JSON.parse(new TextDecoder().decode(client.commands[0]?.input.Payload as Uint8Array)),
    ).toEqual({
      action: "get-daily-log",
    });
  });

  test("invokes Lambda with post-daily-log action and encoded contents", async () => {
    const client = new FakeLambdaClient({
      $metadata: {},
      Payload: encodedPayload({
        title: "2026-04-29.md",
        contents: "aGVsbG8=",
      }),
    });

    await expect(
      invokePostDailyLogLambda(
        { title: "2026-04-29.md", contents: "hello" },
        { client, functionName: "target-lambda" },
      ),
    ).resolves.toEqual({
      title: "2026-04-29.md",
      contents: "hello",
    });

    expect(
      JSON.parse(new TextDecoder().decode(client.commands[0]?.input.Payload as Uint8Array)),
    ).toEqual({
      action: "post-daily-log",
      title: "2026-04-29.md",
      contents: "aGVsbG8=",
    });
  });
});
