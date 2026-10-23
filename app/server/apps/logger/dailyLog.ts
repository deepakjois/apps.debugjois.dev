import type { LoggerNote } from "#/apps/logger/contract";
import { invokeBackendLambda } from "../../core/backendLambda";

type LoggerLambdaResponse = {
  title: string;
  contents: string;
};

export async function getLoggerNote(): Promise<LoggerNote> {
  const response = await invokeBackendLambda<LoggerLambdaResponse>({ action: "get-daily-log" });
  return decodeLoggerResponse(response);
}

export async function saveLoggerNote(note: LoggerNote): Promise<LoggerNote> {
  const response = await invokeBackendLambda<LoggerLambdaResponse>({
    action: "post-daily-log",
    title: note.title,
    contents: Buffer.from(note.contents, "utf8").toString("base64"),
  });
  return decodeLoggerResponse(response);
}

function decodeLoggerResponse(response: LoggerLambdaResponse): LoggerNote {
  return {
    title: response.title,
    contents: response.contents ? Buffer.from(response.contents, "base64").toString("utf8") : "",
  };
}
