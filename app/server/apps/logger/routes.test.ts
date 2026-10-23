import { beforeEach, describe, expect, it, vi } from "vitest";
import getLogger from "../../routes/api/admin/logger.get";
import saveLogger from "../../routes/api/admin/logger.post";
import { AUTH_COOKIE_NAME } from "../../core/adminSession";

const dailyLog = vi.hoisted(() => ({ getLoggerNote: vi.fn(), saveLoggerNote: vi.fn() }));
vi.mock("./dailyLog", () => dailyLog);
vi.mock("../../core/googleIdToken", () => ({
  verifyGoogleIdToken: vi.fn().mockResolvedValue({
    email: "admin@example.com",
    name: null,
    picture: null,
  }),
}));

const note = { title: "2026-09-10.md", contents: "### 2026-09-10\n" };

function signedInRequest(body?: unknown) {
  return new Request("https://apps.debugjois.dev/api/admin/logger", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=signed-google-token`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.DEV_ADMIN_BYPASS;
  dailyLog.getLoggerNote.mockReset();
  dailyLog.saveLoggerNote.mockReset();
});

describe("logger Nitro routes", () => {
  it("loads the note for a signed-in admin", async () => {
    dailyLog.getLoggerNote.mockResolvedValue(note);

    const response = await getLogger.fetch(signedInRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(note);
  });

  it("passes a validated browser document to the Lambda adapter", async () => {
    dailyLog.saveLoggerNote.mockResolvedValue(note);

    const response = await saveLogger.fetch(signedInRequest({ ...note, extra: "dropped" }));

    expect(response.status).toBe(200);
    expect(dailyLog.saveLoggerNote).toHaveBeenCalledWith(note);
  });

  it("rejects a document without contents before invoking the backend", async () => {
    const response = await saveLogger.fetch(signedInRequest({ title: note.title }));

    expect(response.status).toBe(400);
    expect(dailyLog.saveLoggerNote).not.toHaveBeenCalled();
  });
});
