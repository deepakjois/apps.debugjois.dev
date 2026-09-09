import {
  getBackendLambdaFunctionName,
  invokeBackendLambda,
  type InvokeBackendLambdaOptions,
} from "../backend/lambda";
import type { PodcastTranscribeResponse } from "./types";

// QueuePodcastTranscriptionPayload is the JSON envelope expected by the backend Lambda.
type QueuePodcastTranscriptionPayload = {
  action: "queue-podcast-transcription";
  text: string;
};

export type InvokePodscriberLambdaOptions = InvokeBackendLambdaOptions;

export function getPodscriberLambdaFunctionName(
  env?: Parameters<typeof getBackendLambdaFunctionName>[0],
): string {
  return getBackendLambdaFunctionName(env);
}

export async function invokePodscriberLambda(
  text: string,
  options: InvokePodscriberLambdaOptions = {},
): Promise<PodcastTranscribeResponse> {
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw new Error("Paste the Podcast Addict payload before submitting.");
  }

  const payload: QueuePodcastTranscriptionPayload = {
    action: "queue-podcast-transcription",
    text: trimmedText,
  };

  return invokeBackendLambda<PodcastTranscribeResponse>(payload, options);
}
