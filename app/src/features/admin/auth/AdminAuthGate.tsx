import { useGoogleOAuth } from "@react-oauth/google";
import type {
  CredentialResponse,
  GsiButtonConfiguration,
  IdConfiguration,
} from "@react-oauth/google";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LAST_ADMIN_EMAIL_STORAGE_KEY } from "../../../lib/auth/config";
import type { AdminSession } from "../../../lib/auth/server";
import { AdminSessionContext } from "./adminSession";

// Body of every /api/admin/session response; null means this browser holds no valid session.
type SessionResponse = {
  session: AdminSession | null;
};

// One Nitro resource owns the session: GET reads it, POST signs in, DELETE signs out.
const SESSION_URL = "/api/admin/session";
// Query cache entry mirroring the server's view of the session; sign-in and sign-out update it.
const SESSION_QUERY_KEY = ["admin", "session"];

// Page-wide Google Identity Services state: the client it was initialized for and the handler
// that currently receives credentials (whichever sign-in button is mounted, if any).
type GoogleIdentityInit = {
  clientId: string;
  onCredential: (response: CredentialResponse) => void;
  // Whether One Tap has been requested on this page; Chrome allows one FedCM request at a time.
  oneTapPrompted: boolean;
};

declare global {
  interface Window {
    __appsDebugjoisGoogleInit?: GoogleIdentityInit;
    // API installed by the Google Identity Services script after it loads.
    google?: {
      accounts?: {
        id?: {
          initialize: (configuration: IdConfiguration) => void;
          renderButton: (parent: HTMLElement, configuration: GsiButtonConfiguration) => void;
          // Shows One Tap (a FedCM account chooser in Chrome) for the initialized client.
          prompt: () => void;
          // Records an opt-out so auto_select cannot sign the user straight back in after sign-out.
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

type AdminAuthGateProps = {
  children: React.ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const { clientId } = useGoogleOAuth();
  const queryClient = useQueryClient();
  // After an explicit sign-out, One Tap stays quiet so the chooser does not pop straight back up.
  const [signedOutHere, setSignedOutHere] = useState(false);

  // Only the browser fetches this. On the server the query stays pending, so SSR emits the checking
  // state and admin pages never depend on server-rendered session data.
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchAdminSession,
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: loginAdmin,
    onSuccess: (nextSession) => {
      rememberLastAdminEmail(nextSession.email);
      setSignedOutHere(false);
      queryClient.setQueryData<SessionResponse>(SESSION_QUERY_KEY, { session: nextSession });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logoutAdmin,
    onSuccess: () => {
      forgetLastAdminEmail();
      // Google records the opt-out through its client, so ours must exist first. Otherwise it
      // creates an unconfigured one and the sign-in card's initialize() warns about a second call.
      ensureGoogleIdentityInitialized(clientId);
      window.google?.accounts?.id?.disableAutoSelect();
      setSignedOutHere(true);
      queryClient.setQueryData<SessionResponse>(SESSION_QUERY_KEY, { session: null });
    },
  });

  // A failed sign-in attempt is more actionable than a failed session check, so it wins.
  const authError = loginMutation.error ?? sessionQuery.error;
  const authErrorMessage = authError instanceof Error ? authError.message : null;

  if (sessionQuery.isPending) {
    return (
      <main className="admin-webtui admin-screen">
        <section box-="double" className="admin-auth-card">
          <div className="admin-copy" is-="typography-block">
            <span cap-="square round" is-="badge" variant-="foreground0">
              Admin
            </span>
            <p className="admin-status-copy">Checking session...</p>
          </div>
        </section>
      </main>
    );
  }

  const session = sessionQuery.data?.session ?? null;

  if (session) {
    return (
      <AdminSessionContext.Provider
        value={{
          session,
          signOut: () => logoutMutation.mutate(),
          isSigningOut: logoutMutation.isPending,
        }}
      >
        {children}
      </AdminSessionContext.Provider>
    );
  }

  return (
    <main className="admin-webtui admin-screen">
      <section box-="double" className="admin-auth-card">
        <div className="admin-copy" is-="typography-block">
          <span cap-="square round" is-="badge" variant-="foreground0">
            Admin
          </span>
          <h1>Sign in to access admin routes.</h1>
          <p>Only allowed Google accounts can view this section.</p>
        </div>
        <div className="admin-auth-actions">
          <GoogleSignInButton
            disabled={loginMutation.isPending}
            promptOneTap={!signedOutHere}
            onCredential={(response) => {
              if (!response.credential) {
                loginMutation.reset();
                return;
              }

              loginMutation.mutate(response.credential);
            }}
            onError={() => {
              loginMutation.reset();
            }}
          />
        </div>
        {loginMutation.isPending ? <p className="admin-status-copy">Signing in...</p> : null}
        {authErrorMessage ? <p className="admin-auth-error">{authErrorMessage}</p> : null}
      </section>
    </main>
  );
}

async function fetchAdminSession(): Promise<SessionResponse> {
  return requestSession(undefined, "Admin session could not be checked");
}

async function loginAdmin(credential: string): Promise<AdminSession> {
  const { session } = await requestSession(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential }),
    },
    "Google sign-in could not be completed",
  );

  if (!session) {
    throw new Error("Google sign-in could not be completed");
  }

  return session;
}

async function logoutAdmin(): Promise<void> {
  await requestSession({ method: "DELETE" }, "Sign-out could not be completed");
}

// Every session request hits the same resource; any non-2xx response surfaces as `failureMessage`.
async function requestSession(
  init: RequestInit | undefined,
  failureMessage: string,
): Promise<SessionResponse> {
  const response = await fetch(SESSION_URL, init);

  if (!response.ok) {
    throw new Error(failureMessage);
  }

  return response.json() as Promise<SessionResponse>;
}

// Google allows one initialize() per page, and some of its other entry points (prompt,
// disableAutoSelect) silently create an unconfigured client when none exists yet. Every call into
// Google Identity Services therefore goes through here first. Returns null until its script loads.
function ensureGoogleIdentityInitialized(clientId: string): GoogleIdentityInit | null {
  const googleId = window.google?.accounts?.id;

  if (!googleId) {
    return null;
  }

  const existing = window.__appsDebugjoisGoogleInit;

  if (existing?.clientId === clientId) {
    return existing;
  }

  const init: GoogleIdentityInit = { clientId, onCredential: () => {}, oneTapPrompted: false };
  const lastEmail = readLastAdminEmail();

  googleId.initialize({
    client_id: clientId,
    // Delegates to whichever sign-in button is mounted when Google returns a credential.
    callback: (response) => init.onCredential(response),
    // A returning user with one Google session that already approved this app is signed in
    // without a click; otherwise One Tap lists the signed-in accounts to choose from.
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
    // In Chrome the button also goes through FedCM, so it stays personalized (avatar, name,
    // email) even when third-party cookies are blocked, and clicking opens the FedCM chooser.
    use_fedcm_for_button: true,
    itp_support: true,
    // Preselects whoever signed in last on this browser when the button popup opens.
    ...(lastEmail ? { login_hint: lastEmail } : {}),
  });

  window.__appsDebugjoisGoogleInit = init;

  return init;
}

// localStorage can be unavailable or full; the login hint is a convenience, so failures are ignored.
function readLastAdminEmail(): string | null {
  try {
    return window.localStorage.getItem(LAST_ADMIN_EMAIL_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberLastAdminEmail(email: string): void {
  try {
    window.localStorage.setItem(LAST_ADMIN_EMAIL_STORAGE_KEY, email);
  } catch {
    // See readLastAdminEmail.
  }
}

function forgetLastAdminEmail(): void {
  try {
    window.localStorage.removeItem(LAST_ADMIN_EMAIL_STORAGE_KEY);
  } catch {
    // See readLastAdminEmail.
  }
}

type GoogleSignInButtonProps = {
  disabled: boolean;
  // Whether to show One Tap alongside the button once Google Identity Services is ready.
  promptOneTap: boolean;
  onCredential: (response: CredentialResponse) => void;
  onError: () => void;
};

function GoogleSignInButton({
  disabled,
  promptOneTap,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    if (!scriptLoadedSuccessfully || typeof window === "undefined") {
      return;
    }

    const init = ensureGoogleIdentityInitialized(clientId);

    if (!init) {
      return;
    }

    init.onCredential = (response) => {
      if (!response.credential) {
        onErrorRef.current();
        return;
      }

      onCredentialRef.current(response);
    };

    return () => {
      // A credential arriving after this button unmounts has nowhere to go.
      init.onCredential = () => {};
    };
  }, [clientId, scriptLoadedSuccessfully]);

  useEffect(() => {
    if (!scriptLoadedSuccessfully || typeof window === "undefined") {
      return;
    }

    const googleId = window.google?.accounts?.id;
    const buttonContainer = buttonContainerRef.current;

    if (!googleId || !buttonContainer) {
      return;
    }

    buttonContainer.replaceChildren();
    googleId.renderButton(buttonContainer, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      width: 260,
    });
  }, [scriptLoadedSuccessfully]);

  useEffect(() => {
    if (!scriptLoadedSuccessfully || !promptOneTap || typeof window === "undefined") {
      return;
    }

    const init = ensureGoogleIdentityInitialized(clientId);

    // Chrome allows one FedCM request per page at a time and Google does not abort a pending One
    // Tap before starting another, so a repeated prompt() (StrictMode or Fast Refresh re-running
    // this effect) fails with NotAllowedError. One Tap is therefore requested once per page load.
    if (!init || init.oneTapPrompted) {
      return;
    }

    init.oneTapPrompted = true;
    window.google?.accounts?.id?.prompt();
  }, [clientId, promptOneTap, scriptLoadedSuccessfully]);

  return (
    <div className="admin-google-button-wrap">
      <div
        aria-disabled={disabled || !scriptLoadedSuccessfully}
        className={disabled ? "admin-google-button-disabled" : undefined}
        ref={buttonContainerRef}
      />
      {!scriptLoadedSuccessfully ? (
        <p className="admin-status-copy">Loading Google sign-in...</p>
      ) : null}
    </div>
  );
}
