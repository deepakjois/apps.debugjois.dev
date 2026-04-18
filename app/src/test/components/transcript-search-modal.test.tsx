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

    const input = screen.getByRole("combobox", { name: "Search transcripts" });

    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: "second" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const trigger = screen.getByRole("button", { name: "Search transcripts" });

    expect(trigger).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    const reopenedInput = screen.getByRole("combobox", { name: "Search transcripts" });

    expect(reopenedInput).toHaveProperty("value", "");
    expect(reopenedInput.getAttribute("aria-activedescendant")).toBe("transcript-search-result-0");
  });

  test("slash opens fresh outside editable fields and ignores editable fields", () => {
    renderModal();

    const externalInput = document.createElement("input");

    document.body.appendChild(externalInput);
    externalInput.focus();

    fireEvent.keyDown(externalInput, { key: "/" });
    expect(screen.queryByRole("combobox", { name: "Search transcripts" })).toBeNull();

    externalInput.remove();
    fireEvent.keyDown(document, { key: "/" });

    expect(screen.getByRole("combobox", { name: "Search transcripts" })).toBeTruthy();
  });

  test("does not open from keyboard when there are no transcripts", () => {
    renderModal([]);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent.keyDown(document, { key: "/" });

    expect(screen.queryByRole("combobox", { name: "Search transcripts" })).toBeNull();
  });

  test("traps tab focus inside the modal panel", () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));

    const input = screen.getByRole("combobox", { name: "Search transcripts" });
    const secondButton = screen.getByRole("option", { name: /Second transcript/ });

    act(() => {
      input.focus();
    });

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(secondButton).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(input).toBe(document.activeElement);

    act(() => {
      secondButton.focus();
    });

    fireEvent.keyDown(document, { key: "Tab" });
    expect(input).toBe(document.activeElement);
  });

  test("arrow keys wrap and enter selects the active transcript", () => {
    const { onSelectTranscript } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Search transcripts" }));

    const input = screen.getByRole("combobox", { name: "Search transcripts" });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe("transcript-search-result-1");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectTranscript).toHaveBeenCalledWith(TRANSCRIPTS[1]);
  });
});
