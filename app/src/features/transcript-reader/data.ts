import { queryOptions } from "@tanstack/react-query";

export const TRANSCRIPT_INDEX_URL = "https://www.debugjois.dev/transcripts/transcripts.json";

export type TranscriptIndexItem = {
  title?: string;
  location: string;
  date?: string;
  archived?: boolean;
};

type TranscriptIndexResponse = {
  transcripts?: TranscriptIndexItem[];
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

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const DESCRIPTION_MAX_LENGTH = 200;

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x?)([0-9a-f]+);/gi, (entity, hex: string, digits: string) => {
      const codePoint = Number.parseInt(digits, hex ? 16 : 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

export function getTranscriptDescription(transcript: TranscriptPayload | null | undefined): string {
  const episode = transcript?.podcast?.episode;
  const byline = [
    transcript?.podcast?.podcast?.title,
    formatTranscriptDate(episode?.published_date),
    episode?.duration,
  ]
    .filter(Boolean)
    .join(" · ");
  const showNotes = truncateAtWord(
    htmlToText(episode?.description_html ?? ""),
    DESCRIPTION_MAX_LENGTH,
  );

  return [byline, showNotes].filter(Boolean).join(" — ") || "Podcast episode transcript.";
}

export function getTranscriptParagraphs(
  transcript: TranscriptPayload | null | undefined,
): TranscriptParagraph[] {
  return (
    transcript?.deepgram?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs ?? []
  );
}

export type TranscriptDisplayParagraph = {
  key: string;
  speaker: string | number;
  text: string;
  showSpeaker: boolean;
};

export function getTranscriptDisplayParagraphs(
  transcript: TranscriptPayload | null | undefined,
): TranscriptDisplayParagraph[] {
  const displayParagraphs: TranscriptDisplayParagraph[] = [];
  let lastSpeaker: string | number | null = null;

  for (const [index, paragraph] of getTranscriptParagraphs(transcript).entries()) {
    const speaker = paragraph.speaker ?? 0;
    const text = (paragraph.sentences ?? [])
      .map((sentence) => sentence.text ?? "")
      .join(" ")
      .trim();

    if (!text) {
      continue;
    }

    displayParagraphs.push({
      key: `${speaker}-${index}-${text.slice(0, 32)}`,
      speaker,
      text,
      showSpeaker: speaker !== lastSpeaker,
    });
    lastSpeaker = speaker;
  }

  return displayParagraphs;
}
