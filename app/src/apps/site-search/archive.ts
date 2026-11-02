export const LOG_ORIGIN = "https://www.debugjois.dev";

export const INDEX_PATH = "/site-search/index";

export type IndexStatus = {
  entries: number;
  newest?: string;
  oldest?: string;
  commit?: string;
  indexedAt: string;
};

/** The monthly archive page on www.debugjois.dev that renders a daily note. */
export function archiveUrl(date: string, anchor?: string): string {
  const url = `${LOG_ORIGIN}/daily-archive-${date.slice(0, 7)}`;
  return anchor ? `${url}#${anchor}` : url;
}

/** Where a matching section links: its heading on the archive page, or the entry itself. */
export function sectionUrl(date: string, entryUrl: string, anchorId?: string): string {
  return anchorId ? archiveUrl(date, anchorId) : entryUrl;
}
