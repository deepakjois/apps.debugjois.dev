/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IdConfiguration } from "@react-oauth/google";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_ADMIN_EMAIL_STORAGE_KEY } from "../../../lib/auth/config";
import type { AdminSession } from "../../../lib/auth/server";
import { AdminAuthGate } from "./AdminAuthGate";
import { useAdminSession } from "./adminSession";

// Mutable so individual tests can simulate the Google script finishing to load.
const oauthState = vi.hoisted(() => ({ scriptLoadedSuccessfully: false }));

vi.mock("@react-oauth/google", () => ({
  useGoogleOAuth: () => ({
    clientId: "test-client-id",
    scriptLoadedSuccessfully: oauthState.scriptLoadedSuccessfully,
  }),
}));

// Stand-in for the google.accounts.id API installed by Google's script.
const googleId = {
  initialize: vi.fn(),
  renderButton: vi.fn(),
  prompt: vi.fn(),
  disableAutoSelect: vi.fn(),
};

const session: AdminSession = { email: "deepak.jois@gmail.com", name: "Deepak", picture: null };

const SIGN_IN_HEADING = "Sign in to access admin routes.";

beforeEach(() => {
  oauthState.scriptLoadedSuccessfully = false;
  window.google = { accounts: { id: googleId } };
  window.__appsDebugjoisGoogleInit = undefined;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  googleId.initialize.mockReset();
  googleId.renderButton.mockReset();
  googleId.prompt.mockReset();
  googleId.disableAutoSelect.mockReset();
});

function SignOutButton() {
  const { session, signOut } = useAdminSession();

  return (
    <button type="button" onClick={signOut}>
      Sign out {session.email}
    </button>
  );
}

function renderGate() {
  // Each render gets isolated query and mutation state, matching the app's request-local client.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAuthGate>
        <p>Private admin content</p>
        <SignOutButton />
      </AdminAuthGate>
    </QueryClientProvider>,
  );
}

// Fakes the /api/admin/session resource: GET reports `current`, POST signs in as `login`, DELETE
// signs out. Every call gets a fresh Response because a body can only be read once.
function mockSessionApi({
  current,
  login = session,
}: {
  current: AdminSession | null;
  login?: AdminSession;
}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    switch (init?.method ?? "GET") {
      case "POST":
        return Response.json({ session: login });
      case "DELETE":
        return Response.json({ session: null });
      default:
        return Response.json({ session: current });
    }
  });
}

function initializedConfiguration(): IdConfiguration {
  return googleId.initialize.mock.calls[0]?.[0] as IdConfiguration;
}

describe("AdminAuthGate", () => {
  it("shows a checking state until the session is known", async () => {
    mockSessionApi({ current: null });

    renderGate();

    expect(screen.getByText("Checking session...")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: SIGN_IN_HEADING })).toBeNull();
    expect(await screen.findByRole("heading", { name: SIGN_IN_HEADING })).toBeTruthy();
  });

  it("hides admin content when there is no verified session", async () => {
    mockSessionApi({ current: null });

    renderGate();

    expect(await screen.findByRole("heading", { name: SIGN_IN_HEADING })).toBeTruthy();
    expect(screen.queryByText("Private admin content")).toBeNull();
  });

  it("renders admin content for a verified session", async () => {
    const fetchSpy = mockSessionApi({ current: session });

    renderGate();

    expect(await screen.findByText("Private admin content")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: SIGN_IN_HEADING })).toBeNull();
    expect(fetchSpy).toHaveBeenCalledWith("/api/admin/session", undefined);
  });

  it("initializes Google with auto select and the remembered email, then shows One Tap", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    window.localStorage.setItem(LAST_ADMIN_EMAIL_STORAGE_KEY, "deepak.jois@gmail.com");
    mockSessionApi({ current: null });

    renderGate();
    await screen.findByRole("heading", { name: SIGN_IN_HEADING });

    expect(googleId.initialize).toHaveBeenCalledTimes(1);
    expect(initializedConfiguration()).toMatchObject({
      client_id: "test-client-id",
      auto_select: true,
      login_hint: "deepak.jois@gmail.com",
      use_fedcm_for_prompt: true,
      use_fedcm_for_button: true,
    });
    expect(googleId.renderButton).toHaveBeenCalledTimes(1);
    expect(googleId.prompt).toHaveBeenCalledTimes(1);
  });

  it("requests One Tap once per page even when the sign-in card mounts again", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    mockSessionApi({ current: null });

    // StrictMode and Fast Refresh both re-run mount effects; a second FedCM request would fail.
    renderGate();
    await screen.findByRole("heading", { name: SIGN_IN_HEADING });
    cleanup();
    renderGate();
    await screen.findByRole("heading", { name: SIGN_IN_HEADING });

    expect(googleId.initialize).toHaveBeenCalledTimes(1);
    expect(googleId.prompt).toHaveBeenCalledTimes(1);
  });

  it("remembers the email of the account that signed in", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    const fetchSpy = mockSessionApi({ current: null });

    renderGate();
    await screen.findByRole("heading", { name: SIGN_IN_HEADING });
    await act(async () => {
      initializedConfiguration().callback?.({ credential: "signed-google-token" });
    });

    expect(await screen.findByText("Private admin content")).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/admin/session",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.localStorage.getItem(LAST_ADMIN_EMAIL_STORAGE_KEY)).toBe("deepak.jois@gmail.com");
  });

  it("signs out through the session resource without prompting One Tap again", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    window.localStorage.setItem(LAST_ADMIN_EMAIL_STORAGE_KEY, "deepak.jois@gmail.com");
    const fetchSpy = mockSessionApi({ current: session });

    renderGate();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out deepak.jois@gmail.com" }));

    expect(await screen.findByRole("heading", { name: SIGN_IN_HEADING })).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith("/api/admin/session", { method: "DELETE" });
    expect(googleId.disableAutoSelect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LAST_ADMIN_EMAIL_STORAGE_KEY)).toBeNull();
    expect(googleId.renderButton).toHaveBeenCalledTimes(1);
    expect(googleId.prompt).not.toHaveBeenCalled();
  });

  it("initializes Google exactly once when signing out from a page that loaded signed in", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    mockSessionApi({ current: session });

    renderGate();
    const signOut = await screen.findByRole("button", { name: "Sign out deepak.jois@gmail.com" });

    // The sign-in card never rendered, so nothing has initialized Google yet.
    expect(googleId.initialize).not.toHaveBeenCalled();

    fireEvent.click(signOut);
    await screen.findByRole("heading", { name: SIGN_IN_HEADING });

    // Google's disableAutoSelect creates an unconfigured client if none exists, and the card's own
    // initialize() would then be a second call. Ours must run first and the card must reuse it.
    expect(googleId.initialize).toHaveBeenCalledTimes(1);
    expect(googleId.initialize.mock.invocationCallOrder[0]).toBeLessThan(
      googleId.disableAutoSelect.mock.invocationCallOrder[0] ?? 0,
    );
    expect(initializedConfiguration().client_id).toBe("test-client-id");
    expect(initializedConfiguration().login_hint).toBeUndefined();
  });
});
