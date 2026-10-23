import { createError, readBody } from "nitro/h3";
import type { LoggerLinkPreview } from "#/apps/logger/contract";
import { defineAdminHandler } from "../../../../core/adminHandler";

const LINK_PREVIEW_API_URL = "https://api.linkpreview.net/";

export default defineAdminHandler(async (event): Promise<LoggerLinkPreview> => {
  const body = await readBody<{ url?: unknown }>(event);
  const url = normalizeHttpUrl(body?.url);
  if (!url) {
    throw createError({ statusCode: 400, statusMessage: "A valid HTTP or HTTPS URL is required." });
  }

  const apiKey = process.env.LINKPREVIEW_API_KEY?.trim() ?? "";
  if (apiKey.length !== 32) {
    throw new Error("LINKPREVIEW_API_KEY must be set to a 32-character key.");
  }

  const response = await fetch(`${LINK_PREVIEW_API_URL}?q=${encodeURIComponent(url)}`, {
    headers: { "X-Linkpreview-Api-Key": apiKey },
  });
  if (!response.ok) {
    throw new Error(`LinkPreview API returned HTTP ${response.status}.`);
  }

  const result = (await response.json()) as { title?: unknown };
  return { title: typeof result.title === "string" ? result.title : "" };
});

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
