import { H3Event } from "nitro/h3";
import { describe, expect, it, vi } from "vitest";
import { handleSubmitPodscriber } from "../../../../server/routes/api/admin/podscriber.post";

const response = {
  podcast: { episode: { title: "Closer Look: Levinas, On Escape" } },
  transcription_lambda_id: "request-123",
};

function podscriberEvent(text: unknown) {
  return new H3Event(
    new Request("https://apps.debugjois.dev/api/admin/podscriber", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }),
  );
}

describe("Podscriber Nitro route", () => {
  it("authorizes and submits trimmed text", async () => {
    const requireAdmin = vi.fn().mockResolvedValue({ email: "admin@example.com" });
    const submit = vi.fn().mockResolvedValue(response);
    const event = podscriberEvent("  Shared from Podcast Addict  ");

    await expect(handleSubmitPodscriber(event, { requireAdmin, submit })).resolves.toEqual(
      response,
    );
    expect(requireAdmin).toHaveBeenCalledWith(event);
    expect(submit).toHaveBeenCalledWith("Shared from Podcast Addict");
  });

  it("rejects an empty payload without invoking the backend", async () => {
    const requireAdmin = vi.fn().mockResolvedValue({ email: "admin@example.com" });
    const submit = vi.fn();

    await expect(
      handleSubmitPodscriber(podscriberEvent("   "), { requireAdmin, submit }),
    ).rejects.toMatchObject({ status: 400 });
    expect(submit).not.toHaveBeenCalled();
  });
});
