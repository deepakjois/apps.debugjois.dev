import { invokeBackendLambda } from "./backendLambda";

export type PodcastTranscribeResponse = {
  podcast: Record<string, unknown>;
  transcription_lambda_id: string;
};

export async function submitPodcastTranscription(text: string): Promise<PodcastTranscribeResponse> {
  return invokeBackendLambda<PodcastTranscribeResponse>({
    action: "queue-podcast-transcription",
    text: text.trim(),
  });
}
