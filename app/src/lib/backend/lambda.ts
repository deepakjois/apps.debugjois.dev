import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { spawn } from "node:child_process";
import path from "node:path";

const textDecoder = new TextDecoder();

type EnvSource = Pick<NodeJS.ProcessEnv, "BACKEND_LAMBDA_FUNCTION_NAME">;

// LambdaInvoker is the minimal AWS Lambda client surface used by tests and production.
export type LambdaInvoker = {
  send(command: InvokeCommand): Promise<InvokeCommandOutput>;
};

export type InvokeBackendLambdaOptions = {
  client?: LambdaInvoker;
  functionName?: string;
};

export function getBackendLambdaFunctionName(env: EnvSource = process.env): string {
  const functionName = env.BACKEND_LAMBDA_FUNCTION_NAME?.trim();
  if (!functionName) {
    throw new Error("BACKEND_LAMBDA_FUNCTION_NAME must be set.");
  }

  return functionName;
}

export async function invokeBackendLambda<ResponseBody>(
  payload: unknown,
  options: InvokeBackendLambdaOptions = {},
): Promise<ResponseBody> {
  if (!options.functionName?.trim() && !process.env.BACKEND_LAMBDA_FUNCTION_NAME?.trim()) {
    return invokeLocalBackend<ResponseBody>(payload);
  }

  const client = options.client ?? new LambdaClient({});
  const functionName = options.functionName?.trim() || getBackendLambdaFunctionName();
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

  return parseLambdaJSONResponse<ResponseBody>(responseText);
}

async function invokeLocalBackend<ResponseBody>(payload: unknown): Promise<ResponseBody> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("BACKEND_LAMBDA_FUNCTION_NAME must be set.");
  }

  const responseText = await runLocalBackendInvoke(JSON.stringify(payload));
  if (!responseText) {
    throw new Error("Local backend returned an empty response.");
  }

  return parseLambdaJSONResponse<ResponseBody>(responseText);
}

function runLocalBackendInvoke(payload: string): Promise<string> {
  const backendDir =
    process.env.LOCAL_BACKEND_INVOKE_DIR?.trim() || path.resolve(process.cwd(), "../backend");

  return new Promise((resolve, reject) => {
    const child = spawn("go", ["run", ".", "invoke"], {
      cwd: backendDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      reject(new Error(`Start local backend invoke: ${error.message}`));
    });
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(stderr || `Local backend invoke exited with code ${code}`));
        return;
      }

      resolve(stdout);
    });

    child.stdin.end(payload);
  });
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

function parseLambdaJSONResponse<ResponseBody>(responseText: string): ResponseBody {
  try {
    return JSON.parse(responseText) as ResponseBody;
  } catch (error) {
    throw new Error(
      `Lambda returned invalid JSON: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
