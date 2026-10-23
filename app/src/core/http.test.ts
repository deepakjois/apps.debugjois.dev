import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJSON } from "./http";

afterEach(() => vi.restoreAllMocks());

describe("requestJSON", () => {
  it("surfaces the message of an error the server raised on purpose", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ status: 400, message: "Title is required." }, { status: 400 }),
    );

    await expect(requestJSON("/api/x", undefined, "Could not save")).rejects.toThrow(
      "Title is required.",
    );
  });

  it("falls back to the caller's message for an unhandled server error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ status: 500, unhandled: true, message: "HTTPError" }, { status: 500 }),
    );

    await expect(requestJSON("/api/x", undefined, "Could not save")).rejects.toThrow(
      "Could not save (HTTP 500).",
    );
  });
});
