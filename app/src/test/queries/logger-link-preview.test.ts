import { describe, expect, test, vi } from "vitest";
import {
  fetchLoggerLinkPreview,
  isHttpUrl,
  loggerLinkPreviewQueryOptions,
} from "../../queries/queries";

const apiKey = "a".repeat(32);

describe("logger link preview queries", () => {
  test("recognizes only HTTP and HTTPS URLs", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl(" http://example.com ")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });

  test("builds stable query options for a logger URL preview", () => {
    expect(loggerLinkPreviewQueryOptions("https://example.com").queryKey).toEqual([
      "admin",
      "logger",
      "link-preview",
      "https://example.com",
    ]);
  });

  test("requires a 32-character LinkPreview API key", async () => {
    await expect(
      fetchLoggerLinkPreview("https://example.com", { apiKey: "short" }),
    ).rejects.toThrow("LINKPREVIEW_API_KEY must be set to a 32-character key.");
  });

  test("requires an HTTP or HTTPS URL", async () => {
    await expect(fetchLoggerLinkPreview("ftp://example.com", { apiKey })).rejects.toThrow(
      "A valid HTTP or HTTPS URL is required.",
    );
  });

  test("calls LinkPreview with the encoded URL and API key header", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(JSON.stringify({ title: "Example Title" }), { status: 200 });
    });

    await expect(
      fetchLoggerLinkPreview("https://example.com/post", { apiKey, fetcher }),
    ).resolves.toEqual({
      title: "Example Title",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.linkpreview.net/?q=https%3A%2F%2Fexample.com%2Fpost",
      {
        headers: {
          "X-Linkpreview-Api-Key": apiKey,
        },
      },
    );
  });

  test("throws when LinkPreview returns a non-OK response", async () => {
    const fetcher = vi.fn(async () => new Response("Too many requests", { status: 429 }));

    await expect(
      fetchLoggerLinkPreview("https://example.com", { apiKey, fetcher }),
    ).rejects.toThrow("LinkPreview API returned HTTP 429.");
  });
});
