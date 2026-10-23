import { useGoogleOAuth } from "@react-oauth/google";
import type {
  CredentialResponse,
  GsiButtonConfiguration,
  IdConfiguration,
} from "@react-oauth/google";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AdminSessionContext } from "./adminSession";
import { requestJSON } from "../http";
import { LAST_ADMIN_EMAIL_STORAGE_KEY } from "./config";
import type { AdminSession, SessionResponse } from "./contract";

const SESSION_URL = "/api/admin/session";
const SESSION_QUERY_KEY = ["admin", "session"];

type GoogleIdentityInit = {
  clientId: string;
  onCredential: (response: CredentialResponse) => void;
  oneTapPrompted: boolean;
};

declare global {
  interface Window {
    __appsDebugjoisGoogleInit?: GoogleIdentityInit;
    google?: {
      accounts?: {
        id?: {
          initialize: (configuration: IdConfiguration) => void;
          renderButton: (parent: HTMLElement, configuration: GsiButtonConfiguration) => void;
          prompt: () => void;
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
  const [signedOutHere, setSignedOutHere] = useState(false);

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
      ensureGoogleIdentityInitialized(clientId);
      window.google?.accounts?.id?.disableAutoSelect();
      setSignedOutHere(true);
      queryClient.setQueryData<SessionResponse>(SESSION_QUERY_KEY, { session: null });
    },
  });

  const authError = loginMutation.error ?? sessionQuery.error;
  const authErrorMessage = authError instanceof Error ? authError.message : null;

  if (sessionQuery.isPending) {
    return (
      <main className="admin-auth-screen">
        <section className="admin-auth-card">
          <p className="admin-auth-label">Admin</p>
          <p className="admin-auth-status">Checking session...</p>
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
    <main className="admin-auth-screen">
      <section className="admin-auth-card">
        <p className="admin-auth-label">Admin</p>
        <h1>Sign in to access admin routes.</h1>
        <p>Only allowed Google accounts can view this section.</p>
        <div>
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
        {loginMutation.isPending ? <p className="admin-auth-status">Signing in...</p> : null}
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

async function requestSession(
  init: RequestInit | undefined,
  failureMessage: string,
): Promise<SessionResponse> {
  return requestJSON<SessionResponse>(SESSION_URL, init, failureMessage);
}

// Google allows one initialize() per page, and prompt() and disableAutoSelect() silently create an
// unconfigured client when none exists yet, so every Google Identity Services call goes through here.
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
    callback: (response) => init.onCredential(response),
    auto_select: true,
    cancel_on_tap_outside: false,
    use_fedcm_for_prompt: true,
    use_fedcm_for_button: true,
    itp_support: true,
    ...(lastEmail ? { login_hint: lastEmail } : {}),
  });

  window.__appsDebugjoisGoogleInit = init;

  return init;
}

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
  } catch {}
}

function forgetLastAdminEmail(): void {
  try {
    window.localStorage.removeItem(LAST_ADMIN_EMAIL_STORAGE_KEY);
  } catch {}
}

type GoogleSignInButtonProps = {
  disabled: boolean;
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
    <>
      <div
        aria-disabled={disabled || !scriptLoadedSuccessfully}
        className={
          disabled ? "admin-google-button admin-google-button-disabled" : "admin-google-button"
        }
        ref={buttonContainerRef}
      />
      {!scriptLoadedSuccessfully ? (
        <p className="admin-auth-status">Loading Google sign-in...</p>
      ) : null}
    </>
  );
}
