import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeBackendLambda = vi.hoisted(() => vi.fn());
vi.mock("../../../../server/utils/backendLambda", () => ({ invokeBackendLambda }));

import { getLoggerNote, saveLoggerNote } from "../../../../server/utils/logger";

beforeEach(() => invokeBackendLambda.mockReset());

describe("logger Lambda adapter", () => {
  it("loads and decodes the logger note", async () => {
    invokeBackendLambda.mockResolvedValue({
      title: "2026-09-10.md",
      contents: "IyMjIDIwMjYtMDktMTAK",
    });

    await expect(getLoggerNote()).resolves.toEqual({
      title: "2026-09-10.md",
      contents: "### 2026-09-10\n",
    });
    expect(invokeBackendLambda).toHaveBeenCalledWith({ action: "get-daily-log" });
  });

  it("encodes Markdown when saving", async () => {
    invokeBackendLambda.mockResolvedValue({ title: "2026-09-10.md", contents: "aGVsbG8=" });

    await expect(saveLoggerNote({ title: "2026-09-10.md", contents: "hello" })).resolves.toEqual({
      title: "2026-09-10.md",
      contents: "hello",
    });
    expect(invokeBackendLambda).toHaveBeenCalledWith({
      action: "post-daily-log",
      title: "2026-09-10.md",
      contents: "aGVsbG8=",
    });
  });
});
