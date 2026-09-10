import { createError, defineEventHandler, readBody, type H3Event } from "nitro/h3";
import { requireAdminSession } from "../../../../utils/adminSession";

const LINK_PREVIEW_API_URL = "https://api.linkpreview.net/";

// Only the page title is exposed to the browser.
type LoggerLinkPreview = {
  title: string;
};

type LinkPreviewDependencies = {
  requireAdmin: (event: H3Event) => Promise<unknown>;
  fetcher: typeof fetch;
};

export async function handleLoggerLinkPreview(
  event: H3Event,
  dependencies: LinkPreviewDependencies = {
    requireAdmin: requireAdminSession,
    fetcher: fetch,
  },
): Promise<LoggerLinkPreview> {
  await dependencies.requireAdmin(event);
  const body = await readBody<{ url?: unknown }>(event);
  const url = normalizeHttpUrl(body?.url);
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: "A valid HTTP or HTTPS URL is required." });
  }

  const apiKey = process.env.LINKPREVIEW_API_KEY?.trim() ?? "";
  if (apiKey.length !== 32) {
    throw new Error("LINKPREVIEW_API_KEY must be set to a 32-character key.");
  }

  const response = await dependencies.fetcher(
    `${LINK_PREVIEW_API_URL}?q=${encodeURIComponent(url)}`,
    {
      headers: { "X-Linkpreview-Api-Key": apiKey },
    },
  );
  if (!response.ok) {
    throw new Error(`LinkPreview API returned HTTP ${response.status}.`);
  }

  const result = (await response.json()) as { title?: unknown };
  return { title: typeof result.title === "string" ? result.title : "" };
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default defineEventHandler(handleLoggerLinkPreview);
