import { H3Event } from "nitro/h3";
import { describe, expect, it, vi } from "vitest";
import { handleGetLogger } from "../../../../server/routes/api/admin/logger.get";
import { handleSaveLogger } from "../../../../server/routes/api/admin/logger.post";

const note = { title: "2026-09-10.md", contents: "### 2026-09-10\n" };

describe("logger Nitro routes", () => {
  it("authorizes before loading the logger", async () => {
    const requireAdmin = vi.fn().mockResolvedValue({ email: "admin@example.com" });
    const getLogger = vi.fn().mockResolvedValue(note);
    const event = new H3Event(new Request("https://apps.debugjois.dev/api/admin/logger"));

    await expect(handleGetLogger(event, { requireAdmin, getLogger })).resolves.toEqual(note);
    expect(requireAdmin).toHaveBeenCalledWith(event);
    expect(getLogger).toHaveBeenCalledOnce();
  });

  it("passes a validated browser document to the Lambda adapter", async () => {
    const requireAdmin = vi.fn().mockResolvedValue({ email: "admin@example.com" });
    const saveLogger = vi.fn().mockResolvedValue(note);
    const event = new H3Event(
      new Request("https://apps.debugjois.dev/api/admin/logger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(note),
      }),
    );

    await expect(handleSaveLogger(event, { requireAdmin, saveLogger })).resolves.toEqual(note);
    expect(saveLogger).toHaveBeenCalledWith(note);
  });
});
