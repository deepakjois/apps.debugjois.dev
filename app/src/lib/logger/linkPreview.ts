import type { FetchLoggerLinkPreviewOptions, LoggerLinkPreview } from "../../queries/queries";

// AdminSessionForLinkPreview is the auth proof needed before fetching titles.
type AdminSessionForLinkPreview = {
  email: string;
  name: string | null;
  picture: string | null;
};

// LinkPreviewDeps keeps auth, config, and API access injectable for tests.
type LinkPreviewDeps = {
  getSession: () => Promise<AdminSessionForLinkPreview | null>;
  getApiKey: () => string | undefined;
  fetchLinkPreview: (
    url: string,
    options: FetchLoggerLinkPreviewOptions,
  ) => Promise<LoggerLinkPreview>;
};

export async function getLoggerLinkPreviewForSession(
  url: string,
  deps: LinkPreviewDeps,
): Promise<LoggerLinkPreview> {
  const session = await deps.getSession();
  if (!session) {
    throw new Error("Admin session required.");
  }

  return deps.fetchLinkPreview(url, {
    apiKey: deps.getApiKey() ?? "",
  });
}
