import { describe, expect, test, vi } from "vitest";
import { submitPodscriberForSession } from "../../lib/podscriber/submit";

describe("submitPodscriberForSession", () => {
  test("requires an admin session", async () => {
    await expect(
      submitPodscriberForSession("payload", {
        getSession: async () => null,
        invoke: vi.fn(),
      }),
    ).rejects.toThrow("Admin session required.");
  });

  test("passes text through to the Lambda invoker", async () => {
    const invoke = vi.fn(async () => ({
      podcast: { episode: { title: "Episode" } },
      transcription_lambda_id: "request-123",
    }));

    await expect(
      submitPodscriberForSession("payload text", {
        getSession: async () => ({ email: "deepak.jois@gmail.com", name: null, picture: null }),
        invoke,
      }),
    ).resolves.toMatchObject({ transcription_lambda_id: "request-123" });

    expect(invoke).toHaveBeenCalledWith("payload text");
  });
});
