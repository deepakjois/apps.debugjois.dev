import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeBackendLambda = vi.hoisted(() => vi.fn());
vi.mock("../../../../server/utils/backendLambda", () => ({ invokeBackendLambda }));

import { submitPodcastTranscription } from "../../../../server/utils/podscriber";

beforeEach(() => invokeBackendLambda.mockReset());

describe("Podscriber Lambda adapter", () => {
  it("trims and wraps the Podcast Addict text in the backend action", async () => {
    const response = {
      podcast: { episode: { title: "Closer Look: Levinas, On Escape" } },
      transcription_lambda_id: "request-123",
    };
    invokeBackendLambda.mockResolvedValue(response);

    await expect(submitPodcastTranscription("  Shared from Podcast Addict  ")).resolves.toEqual(
      response,
    );
    expect(invokeBackendLambda).toHaveBeenCalledWith({
      action: "queue-podcast-transcription",
      text: "Shared from Podcast Addict",
    });
  });
});
