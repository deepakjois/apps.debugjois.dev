import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const textDecoder = new TextDecoder();

// Backend Lambda responses are direct JSON payloads rather than API Gateway responses.
type LambdaErrorPayload = {
  error?: unknown;
  errorMessage?: unknown;
};

export async function invokeBackendLambda<ResponseBody>(payload: unknown): Promise<ResponseBody> {
  const functionName = process.env.BACKEND_LAMBDA_FUNCTION_NAME?.trim();
  if (!functionName) {
    throw new Error("BACKEND_LAMBDA_FUNCTION_NAME must be set.");
  }

  const output = await new LambdaClient({}).send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "RequestResponse",
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    }),
  );
  const responseText = output.Payload ? textDecoder.decode(output.Payload) : "";

  if (output.FunctionError) {
    throw new Error(readLambdaError(responseText) ?? `Lambda failed: ${output.FunctionError}`);
  }
  if (!responseText) {
    throw new Error("Lambda returned an empty response.");
  }

  try {
    return JSON.parse(responseText) as ResponseBody;
  } catch (error) {
    throw new Error(
      `Lambda returned invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function readLambdaError(responseText: string): string | null {
  if (!responseText) {
    return null;
  }

  try {
    const payload = JSON.parse(responseText) as LambdaErrorPayload;
    for (const value of [payload.errorMessage, payload.error]) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
  } catch {
    return responseText;
  }

  return null;
}
