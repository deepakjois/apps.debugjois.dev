type ErrorBody = { message?: unknown; unhandled?: unknown } | null;

export async function requestJSON<ResponseBody>(
  url: string,
  init: RequestInit | undefined,
  failureMessage: string,
): Promise<ResponseBody> {
  const response = await fetch(url, init);
  if (response.ok) {
    return (await response.json()) as ResponseBody;
  }

  // h3 replaces the message of an unhandled server error with a generic "HTTPError", so only an
  // error the server raised on purpose carries a message worth showing.
  const body = (await response.json().catch(() => null)) as ErrorBody;
  const message =
    body?.unhandled !== true && typeof body?.message === "string" ? body.message.trim() : "";
  throw new Error(message || `${failureMessage} (HTTP ${response.status}).`);
}
