import { invokeBackendLambda, type InvokeBackendLambdaOptions } from "../backend/lambda";
import type { DailyLogLambdaResponse, DailyLogNote } from "./types";

type GetDailyLogPayload = {
  action: "get-daily-log";
};

type PostDailyLogPayload = {
  action: "post-daily-log";
  title: string;
  contents: string;
};

export type InvokeDailyLogLambdaOptions = InvokeBackendLambdaOptions;

export async function invokeGetDailyLogLambda(
  options: InvokeDailyLogLambdaOptions = {},
): Promise<DailyLogNote> {
  const response = await invokeBackendLambda<DailyLogLambdaResponse>(
    { action: "get-daily-log" } satisfies GetDailyLogPayload,
    options,
  );

  return decodeDailyLogResponse(response);
}

export async function invokePostDailyLogLambda(
  note: DailyLogNote,
  options: InvokeDailyLogLambdaOptions = {},
): Promise<DailyLogNote> {
  const payload: PostDailyLogPayload = {
    action: "post-daily-log",
    title: note.title,
    contents: encodeBase64(note.contents),
  };
  const response = await invokeBackendLambda<DailyLogLambdaResponse>(payload, options);

  return decodeDailyLogResponse(response);
}

function decodeDailyLogResponse(response: DailyLogLambdaResponse): DailyLogNote {
  return {
    title: response.title,
    contents: decodeBase64(response.contents),
  };
}

function encodeBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value: string): string {
  if (!value) {
    return "";
  }

  return Buffer.from(value, "base64").toString("utf8");
}
