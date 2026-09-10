import type { PodcastTranscribeResponse } from "./types";

// AdminSessionForPodscriber is the small auth shape needed to prove admin access.
type AdminSessionForPodscriber = {
  email: string;
  name: string | null;
  picture: string | null;
};

// PodscriberSubmitDeps keeps auth and Lambda dependencies injectable for tests.
type PodscriberSubmitDeps = {
  getSession: () => Promise<AdminSessionForPodscriber | null>;
  invoke: (text: string) => Promise<PodcastTranscribeResponse>;
};

export async function submitPodscriberForSession(
  text: string,
  deps: PodscriberSubmitDeps,
): Promise<PodcastTranscribeResponse> {
  const session = await deps.getSession();
  if (!session) {
    throw new Error("Admin session required.");
  }

  return deps.invoke(text);
}
