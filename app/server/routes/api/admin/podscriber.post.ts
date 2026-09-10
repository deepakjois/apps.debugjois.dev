import { createError, defineEventHandler, readBody, type H3Event } from "nitro/h3";
import { requireAdminSession } from "../../../utils/adminSession";
import {
  submitPodcastTranscription,
  type PodcastTranscribeResponse,
} from "../../../utils/podscriber";

// Route dependencies keep authorization and request validation independent from AWS in tests.
type PodscriberDependencies = {
  requireAdmin: (event: H3Event) => Promise<unknown>;
  submit: (text: string) => Promise<PodcastTranscribeResponse>;
};

export async function handleSubmitPodscriber(
  event: H3Event,
  dependencies: PodscriberDependencies = {
    requireAdmin: requireAdminSession,
    submit: submitPodcastTranscription,
  },
): Promise<PodcastTranscribeResponse> {
  await dependencies.requireAdmin(event);
  const body = await readBody<{ text?: unknown }>(event);

  if (typeof body?.text !== "string" || !body.text.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: "Paste the Podcast Addict payload before submitting.",
    });
  }

  return dependencies.submit(body.text.trim());
}

export default defineEventHandler(handleSubmitPodscriber);
