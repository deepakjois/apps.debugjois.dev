import { describe, expect, it } from "vitest";
import {
  canonicalHashForTranscript,
  extractFullHash,
  findTranscriptByHashPrefix,
  formatTranscriptDate,
  getTranscriptDisplayParagraphs,
  getTranscriptPageTitle,
  normalizeTranscriptHash,
} from "./data";
import type { TranscriptIndexItem, TranscriptPayload } from "./data";

const HASH_A = "ABCDEF0123456789aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "1234567890abcdefbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const ITEM_A: TranscriptIndexItem = {
  title: "Latest",
  location: `https://example.com/latest--${HASH_A}.json`,
};
const ITEM_B: TranscriptIndexItem = {
  title: "Earlier",
  location: `https://example.com/earlier--${HASH_B}.json`,
};

describe("transcript identity", () => {
  it("normalizes user input and derives its canonical content hash", () => {
    expect(normalizeTranscriptHash("  ABCDEF0123456789  ")).toBe("abcdef0123456789");
    expect(normalizeTranscriptHash(123)).toBeUndefined();
    expect(extractFullHash(ITEM_A.location)).toBe(HASH_A.toLowerCase());
    expect(canonicalHashForTranscript(ITEM_A)).toBe("abcdef0123456789");
    expect(canonicalHashForTranscript({ location: "https://example.com/not-addressed.json" })).toBe(
      "",
    );
  });

  it("matches case-insensitive hash prefixes and rejects malformed or unknown ones", () => {
    expect(findTranscriptByHashPrefix([ITEM_A, ITEM_B], "12345678")).toBe(ITEM_B);
    expect(findTranscriptByHashPrefix([ITEM_A, ITEM_B], "ABCDEF01")).toBe(ITEM_A);
    expect(findTranscriptByHashPrefix([ITEM_A, ITEM_B], "abc")).toBeNull();
    expect(findTranscriptByHashPrefix([ITEM_A, ITEM_B], "xyz!")).toBeNull();
    expect(findTranscriptByHashPrefix([ITEM_A, ITEM_B], "ffff")).toBeNull();
  });
});

describe("transcript display data", () => {
  it("uses stable UTC dates, title fallbacks, and the first Deepgram alternative", () => {
    const payload: TranscriptPayload = {
      podcast: {
        source: { share_title: "Shared episode" },
      },
      deepgram: {
        results: {
          channels: [
            {
              alternatives: [
                {
                  paragraphs: {
                    paragraphs: [
                      { speaker: 2, sentences: [{ text: "First" }, { text: "paragraph." }] },
                      { speaker: 2, sentences: [{ text: "Same speaker." }] },
                      { speaker: 3, sentences: [{ text: "" }] },
                      { speaker: 3, sentences: [{ text: "New speaker." }] },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    };

    expect(formatTranscriptDate("2026-01-02")).toBe("January 2, 2026");
    expect(formatTranscriptDate("unknown")).toBe("unknown");
    expect(getTranscriptPageTitle(payload)).toBe("Shared episode | Transcript Reader");
    expect(getTranscriptDisplayParagraphs(payload)).toEqual([
      {
        key: "2-0-First paragraph.",
        speaker: 2,
        text: "First paragraph.",
        showSpeaker: true,
      },
      {
        key: "2-1-Same speaker.",
        speaker: 2,
        text: "Same speaker.",
        showSpeaker: false,
      },
      {
        key: "3-3-New speaker.",
        speaker: 3,
        text: "New speaker.",
        showSpeaker: true,
      },
    ]);
  });
});
