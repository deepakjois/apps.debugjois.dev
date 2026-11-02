import { describe, expect, it } from "vitest";
import { renderNote } from "./render";

function headingIds(html: string) {
  return [...html.matchAll(/<h\d(?: id="([^"]*)")?>/g)].map((m) => m[1] ?? null);
}

describe("renderNote", () => {
  // Expected IDs are copied from the live archive pages rendered by goldmark.
  it("matches goldmark heading IDs", () => {
    const { html, anchor } = renderNote(
      {
        date: "2025-07-02",
        markdown: [
          "### 2025-07-02",
          "#### Why are we all so weird\u00a0about cheating?",
          "#### Four Thousand Weeks by Oliver Burkeman - Chapter 4",
          "#### [Lessons](https://example.com/a_b) from `go_test` 日本",
        ].join("\n"),
      },
      new Set(),
    );
    expect(anchor).toBe("2025-07-02");
    expect(headingIds(html)).toEqual([
      "2025-07-02",
      "why-are-we-all-so-weirdabout-cheating",
      "four-thousand-weeks-by-oliver-burkeman---chapter-4",
      "lessons-from-go-test-",
    ]);
  });

  it("drops IDs that a newer note on the same archive page already uses", () => {
    const monthIds = new Set<string>();
    renderNote({ date: "2026-10-31", markdown: "### 2026-10-31\n#### Links" }, monthIds);
    const older = renderNote(
      { date: "2026-10-30", markdown: "### 2026-10-30\n#### Links\n#### Links" },
      monthIds,
    );
    expect(headingIds(older.html)).toEqual(["2026-10-30", null, "links-1"]);
  });

  it("anchors a note with a mistyped date heading at that heading", () => {
    const { anchor } = renderNote(
      { date: "2025-07-10", markdown: "### 2025-07-10S\ntext" },
      new Set(),
    );
    expect(anchor).toBe("2025-07-10s");
  });
});
