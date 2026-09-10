import { queryOptions } from "@tanstack/react-query";

export const TRANSCRIPT_INDEX_URL = "https://www.debugjois.dev/transcripts/transcripts.json";
export const LINKPREVIEW_API_URL = "https://api.linkpreview.net/";

export type TranscriptIndexItem = {
  title?: string;
  location: string;
  date?: string;
};

type TranscriptIndexResponse = {
  transcripts?: TranscriptIndexItem[];
};

export type LoggerLinkPreview = {
  title: string;
};

type LoggerLinkPreviewResponse = {
  title?: unknown;
};

// Fetcher lets tests inject a fake fetch implementation without global state.
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type FetchLoggerLinkPreviewOptions = {
  apiKey: string;
  fetcher?: Fetcher;
};

type TranscriptSentence = {
  text?: string;
};

export type TranscriptParagraph = {
  sentences?: TranscriptSentence[];
  speaker?: number | string | null;
};

type TranscriptAlternative = {
  paragraphs?: {
    paragraphs?: TranscriptParagraph[];
  };
};

type TranscriptChannel = {
  alternatives?: TranscriptAlternative[];
};

type TranscriptModelInfo = Record<
  string,
  {
    name?: string;
    version?: string;
    arch?: string;
  }
>;

export type TranscriptPayload = {
  podcast?: {
    source?: {
      share_title?: string;
      episode_url?: string;
    };
    podcast?: {
      title?: string;
      url?: string;
    };
    episode?: {
      title?: string;
      published_date?: string;
      duration?: string;
      description_html?: string;
    };
  };
  deepgram?: {
    metadata?: {
      model_info?: TranscriptModelInfo;
    };
    results?: {
      channels?: TranscriptChannel[];
    };
  };
};

export type ResolvedTranscript = {
  item: TranscriptIndexItem | null;
  canonicalHash: string | null;
  shouldRedirect: boolean;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchTranscriptIndex(): Promise<TranscriptIndexItem[]> {
  const payload = await fetchJson<TranscriptIndexResponse>(TRANSCRIPT_INDEX_URL);

  return Array.isArray(payload.transcripts) ? payload.transcripts : [];
}

export function transcriptIndexQueryOptions() {
  return queryOptions({
    queryKey: ["transcripts", "index"],
    queryFn: fetchTranscriptIndex,
  });
}

export async function fetchTranscript(location: string): Promise<TranscriptPayload> {
  return fetchJson<TranscriptPayload>(location);
}

export function transcriptQueryOptions(location: string) {
  return queryOptions({
    queryKey: ["transcripts", "item", location],
    queryFn: () => fetchTranscript(location),
  });
}

export async function fetchLoggerLinkPreview(
  url: string,
  options: FetchLoggerLinkPreviewOptions,
): Promise<LoggerLinkPreview> {
  if (typeof window !== "undefined") {
    throw new Error("LinkPreview API calls must run on the server.");
  }

  const normalizedUrl = normalizeHttpUrl(url);
  if (!normalizedUrl) {
    throw new Error("A valid HTTP or HTTPS URL is required.");
  }

  const apiKey = options.apiKey.trim();
  if (apiKey.length !== 32) {
    throw new Error("LINKPREVIEW_API_KEY must be set to a 32-character key.");
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${LINKPREVIEW_API_URL}?q=${encodeURIComponent(normalizedUrl)}`, {
    headers: {
      "X-Linkpreview-Api-Key": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`LinkPreview API returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as LoggerLinkPreviewResponse;

  return {
    title: typeof data.title === "string" ? data.title : "",
  };
}

export function loggerLinkPreviewQueryOptions(url: string) {
  return queryOptions({
    queryKey: ["admin", "logger", "link-preview", url],
    queryFn: async () => {
      const { getLoggerLinkPreviewServerFn } = await import("../server/logger");

      return getLoggerLinkPreviewServerFn({ data: { url } });
    },
  });
}

export function isHttpUrl(value: string): boolean {
  return normalizeHttpUrl(value) !== null;
}

function normalizeHttpUrl(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedValue);

    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? parsedUrl.toString()
      : null;
  } catch {
    return null;
  }
}

export function normalizeTranscriptHash(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return normalized || undefined;
}

export function extractFullHash(location: string | undefined): string {
  const match = String(location ?? "").match(/--([a-f0-9]{64})\.json$/i);

  return match ? match[1].toLowerCase() : "";
}

export function canonicalHashForTranscript(item: TranscriptIndexItem | null | undefined): string {
  const fullHash = extractFullHash(item?.location);

  return fullHash ? fullHash.slice(0, 16) : "";
}

export function findTranscriptByHashPrefix(
  items: TranscriptIndexItem[],
  prefix: string | undefined,
): TranscriptIndexItem | null {
  const normalizedPrefix = normalizeTranscriptHash(prefix);

  if (!normalizedPrefix || !/^[a-f0-9]{4,64}$/.test(normalizedPrefix)) {
    return null;
  }

  for (const item of items) {
    const fullHash = extractFullHash(item.location);

    if (fullHash && fullHash.startsWith(normalizedPrefix)) {
      return item;
    }
  }

  return null;
}

export function resolveTranscript(
  items: TranscriptIndexItem[],
  requestedHash: string | undefined,
): ResolvedTranscript {
  if (items.length === 0) {
    return {
      item: null,
      canonicalHash: null,
      shouldRedirect: false,
    };
  }

  if (!requestedHash) {
    const latestTranscript = items[0];

    return {
      item: latestTranscript,
      canonicalHash: canonicalHashForTranscript(latestTranscript) || null,
      shouldRedirect: false,
    };
  }

  const matchedTranscript = findTranscriptByHashPrefix(items, requestedHash);

  if (!matchedTranscript) {
    return {
      item: null,
      canonicalHash: null,
      shouldRedirect: true,
    };
  }

  return {
    item: matchedTranscript,
    canonicalHash: canonicalHashForTranscript(matchedTranscript) || null,
    shouldRedirect: false,
  };
}

export function formatTranscriptDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return value;
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(`${year}-${month}-${day}T00:00:00Z`);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsedDate);
}

export function getTranscriptTitle(transcript: TranscriptPayload | null | undefined): string {
  return (
    transcript?.podcast?.episode?.title ||
    transcript?.podcast?.source?.share_title ||
    "Transcript Reader"
  );
}

export function getTranscriptPageTitle(transcript: TranscriptPayload | null | undefined): string {
  const title = getTranscriptTitle(transcript);

  return title === "Transcript Reader" ? title : `${title} | Transcript Reader`;
}

export function getTranscriptParagraphs(
  transcript: TranscriptPayload | null | undefined,
): TranscriptParagraph[] {
  return (
    transcript?.deepgram?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs ?? []
  );
}
