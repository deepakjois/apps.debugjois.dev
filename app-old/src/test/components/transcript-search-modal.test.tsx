// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import TranscriptSearchModal from "../../components/transcript-reader/TranscriptSearchModal";

const TRANSCRIPTS = [
  {
    location:
      "https://example.com/one--1111111111111111222222222222222233333333333333334444444444444444.json",
    title: "First transcript",
    date: "2025-01-01",
  },
  {
    location:
      "https://example.com/two--aaaaaaaaaaaaaaaa555555555555555566666666666666667777777777777777.json",
    title: "Second transcript",
    date: "2025-01-02",
  },
];

function renderModal(transcriptList = TRANSCRIPTS) {
  const onSelectTranscript = vi.fn();

  return {
    onSelectTranscript,
    ...render(
      <TranscriptSearchModal
        onSelectTranscript={onSelectTranscript}
        transcriptList={transcriptList}
      />,
    ),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TranscriptSearchModal", () => {
  test("cmd/ctrl+k opens fresh and closes with focus restored", () => {
    renderModal();

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const input = screen.getByRole("searchbox", { name: "Search transcripts" });

    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const trigger = screen.getByRole("button", { name: "Search transcripts" });

    expect(trigger).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const reopenedInput = screen.getByRole("searchbox", { name: "Search transcripts" });
    const reopenedResults = screen.getByRole("listbox", { name: "Matching transcripts" });

    expect(reopenedInput).toHaveProperty("value", "");
    expect(reopenedResults).toHaveProperty("value", TRANSCRIPTS[0].location);
  });

  test("slash opens fresh outside editable fields and ignores editable fields", () => {
    renderModal();

    const externalInput = document.createElement("input");

    document.body.appendChild(externalInput);
    externalInput.focus();

    fireEvent.keyDown(externalInput, { key: "/" });
    expect(screen.queryByRole("searchbox", { name: "Search transcripts" })).toBeNull();

    externalInput.remove();
    fireEvent.keyDown(document, { key: "/" });

    expect(screen.getByRole("searchbox", { name: "Search transcripts" })).toBeTruthy();
  });

  test("does not open from keyboard when there are no transcripts", () => {
    renderModal([]);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.keyDown(document, { key: "/" });

    expect(screen.queryByRole("searchbox", { name: "Search transcripts" })).toBeNull();
  });

  test("traps tab focus inside the modal panel", () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));

    const input = screen.getByRole("searchbox", { name: "Search transcripts" });
    const results = screen.getByRole("listbox", { name: "Matching transcripts" });

    act(() => {
      input.focus();
    });

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(results).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(input).toBe(document.activeElement);

    act(() => {
      results.focus();
    });

    fireEvent.keyDown(document, { key: "Tab" });
    expect(input).toBe(document.activeElement);
  });

  test("arrow keys wrap and enter selects the active transcript", () => {
    const { onSelectTranscript } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));

    const input = screen.getByRole("searchbox", { name: "Search transcripts" });
    const results = screen.getByRole("listbox", { name: "Matching transcripts" });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(results).toHaveProperty("value", TRANSCRIPTS[1].location);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectTranscript).toHaveBeenCalledWith(TRANSCRIPTS[1]);
  });

  test("selecting a native result selects the transcript", () => {
    const { onSelectTranscript } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));

    fireEvent.change(screen.getByRole("listbox", { name: "Matching transcripts" }), {
      target: { value: TRANSCRIPTS[1].location },
    });

    expect(onSelectTranscript).toHaveBeenCalledWith(TRANSCRIPTS[1]);
  });
});
