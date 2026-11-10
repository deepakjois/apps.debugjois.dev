import { beforeEach, describe, expect, it, vi } from "vitest";
import setTranscriptState from "../../routes/api/admin/transcript-reader/state.post";
import { AUTH_COOKIE_NAME } from "../../core/adminSession";

const backend = vi.hoisted(() => ({ invokeBackendLambda: vi.fn() }));
vi.mock("../../core/backendLambda", () => backend);
vi.mock("../../core/googleIdToken", () => ({
  verifyGoogleIdToken: vi.fn().mockResolvedValue({
    email: "admin@example.com",
    name: null,
    picture: null,
  }),
}));

const location = "https://www.debugjois.dev/transcripts/episode--abc.json";

function signedInRequest(body: unknown) {
  return new Request("https://apps.debugjois.dev/api/admin/transcript-reader/state", {
    method: "POST",
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=signed-google-token`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.DEV_ADMIN_BYPASS;
  backend.invokeBackendLambda.mockReset();
});

describe("transcript state Nitro route", () => {
  it("sends the change to the backend action and returns the updated index", async () => {
    const index = { transcripts: [{ title: "Episode", location, archived: true }] };
    backend.invokeBackendLambda.mockResolvedValue(index);

    const response = await setTranscriptState.fetch(
      signedInRequest({ location, state: "archived", extra: "dropped" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(index);
    expect(backend.invokeBackendLambda).toHaveBeenCalledWith({
      action: "set-transcript-state",
      location,
      state: "archived",
    });
  });

  it.each([{ location }, { location, state: "Archived" }, { state: "deleted" }])(
    "rejects %j before invoking the backend",
    async (body) => {
      const response = await setTranscriptState.fetch(signedInRequest(body));

      expect(response.status).toBe(400);
      expect(backend.invokeBackendLambda).not.toHaveBeenCalled();
    },
  );
});
