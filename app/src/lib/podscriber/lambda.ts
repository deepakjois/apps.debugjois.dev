import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import type { PodcastTranscribeResponse } from "./types";

export const DEFAULT_PODSCRIBER_LAMBDA_FUNCTION_NAME =
  "DebugjoisDevStack-DebugJoisDevLambda1E2510C0-FbQR7k6bgY9Q";

const textDecoder = new TextDecoder();

type EnvSource = Pick<NodeJS.ProcessEnv, "PODSCRIBER_LAMBDA_FUNCTION_NAME">;

// LambdaInvoker is the minimal AWS Lambda client surface used by tests and production.
type LambdaInvoker = {
  send(command: InvokeCommand): Promise<InvokeCommandOutput>;
};

// QueuePodcastTranscriptionPayload is the JSON envelope expected by the backend Lambda.
type QueuePodcastTranscriptionPayload = {
  action: "queue-podcast-transcription";
  text: string;
};

export type InvokePodscriberLambdaOptions = {
  client?: LambdaInvoker;
  functionName?: string;
};

export function getPodscriberLambdaFunctionName(env: EnvSource = process.env): string {
  return env.PODSCRIBER_LAMBDA_FUNCTION_NAME?.trim() || DEFAULT_PODSCRIBER_LAMBDA_FUNCTION_NAME;
}

export async function invokePodscriberLambda(
  text: string,
  options: InvokePodscriberLambdaOptions = {},
): Promise<PodcastTranscribeResponse> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error("Paste the Podcast Addict payload before submitting.");
  }

  const payload: QueuePodcastTranscriptionPayload = {
    action: "queue-podcast-transcription",
    text: trimmedText,
  };

  const client = options.client ?? new LambdaClient({});
  const functionName = options.functionName?.trim() || getPodscriberLambdaFunctionName();
  const output = await client.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    }),
  );

  const responseText = decodeLambdaPayload(output.Payload);
  if (output.FunctionError) {
    throw new Error(lambdaErrorMessage(responseText) ?? `Lambda failed: ${output.FunctionError}`);
  }
  if (!responseText) {
    throw new Error("Lambda returned an empty response.");
  }

  return parseLambdaJSONResponse(responseText);
}

function decodeLambdaPayload(payload: InvokeCommandOutput["Payload"]): string {
  return payload ? textDecoder.decode(payload) : "";
}

function lambdaErrorMessage(responseText: string): string | null {
  if (!responseText) {
    return null;
  }

  try {
    const body = JSON.parse(responseText) as { errorMessage?: unknown; error?: unknown };
    for (const value of [body.errorMessage, body.error]) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  } catch {
    return responseText;
  }

  return null;
}

function parseLambdaJSONResponse(responseText: string): PodcastTranscribeResponse {
  try {
    return JSON.parse(responseText) as PodcastTranscribeResponse;
  } catch (error) {
    throw new Error(
      `Lambda returned invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
