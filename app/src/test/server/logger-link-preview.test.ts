import { describe, expect, test, vi } from "vitest";
import { getLoggerLinkPreviewForSession } from "../../lib/logger/linkPreview";

const adminSession = { email: "deepak.jois@gmail.com", name: null, picture: null };

describe("logger link preview session helper", () => {
  test("requires an admin session before fetching a link preview", async () => {
    await expect(
      getLoggerLinkPreviewForSession("https://example.com", {
        getSession: async () => null,
        getApiKey: () => "a".repeat(32),
        fetchLinkPreview: vi.fn(),
      }),
    ).rejects.toThrow("Admin session required.");
  });

  test("passes the server API key to the LinkPreview fetcher", async () => {
    const fetchLinkPreview = vi.fn(async () => ({ title: "Example Title" }));

    await expect(
      getLoggerLinkPreviewForSession("https://example.com", {
        getSession: async () => adminSession,
        getApiKey: () => "b".repeat(32),
        fetchLinkPreview,
      }),
    ).resolves.toEqual({ title: "Example Title" });

    expect(fetchLinkPreview).toHaveBeenCalledWith("https://example.com", {
      apiKey: "b".repeat(32),
    });
  });
});
