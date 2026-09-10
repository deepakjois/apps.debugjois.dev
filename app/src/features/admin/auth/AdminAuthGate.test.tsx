/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IdConfiguration } from "@react-oauth/google";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_ADMIN_EMAIL_STORAGE_KEY } from "../../../lib/auth/config";
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

const session = { email: "deepak.jois@gmail.com", name: "Deepak", picture: null };

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

function renderGate(initialSession: Parameters<typeof AdminAuthGate>[0]["initialSession"]) {
  // Each render gets isolated mutation state, matching the app's request-local query client.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAuthGate initialSession={initialSession}>
        <p>Private admin content</p>
        <SignOutButton />
      </AdminAuthGate>
    </QueryClientProvider>,
  );
}

function mockFetchJson(body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

function initializedConfiguration(): IdConfiguration {
  return googleId.initialize.mock.calls[0]?.[0] as IdConfiguration;
}

describe("AdminAuthGate", () => {
  it("hides admin content when there is no verified session", () => {
    renderGate(null);

    expect(screen.getByRole("heading", { name: "Sign in to access admin routes." })).toBeTruthy();
    expect(screen.queryByText("Private admin content")).toBeNull();
  });

  it("renders admin content for the server-verified session", () => {
    renderGate(session);

    expect(screen.getByText("Private admin content")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in to access admin routes." })).toBeNull();
  });

  it("initializes Google with auto select and the remembered email, then shows One Tap", () => {
    oauthState.scriptLoadedSuccessfully = true;
    window.localStorage.setItem(LAST_ADMIN_EMAIL_STORAGE_KEY, "deepak.jois@gmail.com");

    renderGate(null);

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

  it("remembers the email of the account that signed in", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    const fetchSpy = mockFetchJson(session);

    renderGate(null);
    await act(async () => {
      initializedConfiguration().callback?.({ credential: "signed-google-token" });
    });

    expect(await screen.findByText("Private admin content")).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith(
      "/admin/login",
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.localStorage.getItem(LAST_ADMIN_EMAIL_STORAGE_KEY)).toBe("deepak.jois@gmail.com");
  });

  it("signs out through the logout route without prompting One Tap again", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    window.localStorage.setItem(LAST_ADMIN_EMAIL_STORAGE_KEY, "deepak.jois@gmail.com");
    const fetchSpy = mockFetchJson({ ok: true });

    renderGate(session);
    fireEvent.click(screen.getByRole("button", { name: "Sign out deepak.jois@gmail.com" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to access admin routes." }),
    ).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledWith("/admin/logout", { method: "POST" });
    expect(googleId.disableAutoSelect).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(LAST_ADMIN_EMAIL_STORAGE_KEY)).toBeNull();
    expect(googleId.renderButton).toHaveBeenCalledTimes(1);
    expect(googleId.prompt).not.toHaveBeenCalled();
  });

  it("initializes Google exactly once when signing out from a page that loaded signed in", async () => {
    oauthState.scriptLoadedSuccessfully = true;
    mockFetchJson({ ok: true });

    // The sign-in card never rendered, so nothing has initialized Google yet.
    renderGate(session);
    expect(googleId.initialize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign out deepak.jois@gmail.com" }));
    await screen.findByRole("heading", { name: "Sign in to access admin routes." });

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
