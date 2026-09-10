import { invokeBackendLambda } from "./backendLambda";

// LoggerNote is decoded Markdown exchanged by the Nitro API and browser editor.
export type LoggerNote = {
  title: string;
  contents: string;
};

// LoggerLambdaResponse is the backend wire format, where Markdown is base64 encoded.
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
