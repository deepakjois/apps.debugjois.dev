import { useGoogleOAuth } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";
import { loginAdminServerFn, logoutAdminServerFn } from "../../server/adminAuth";

declare global {
  interface Window {
    __appsDebugjoisGoogleInit?: {
      clientId: string;
    };
  }
}

export type AdminSession = {
  email: string;
  name: string | null;
  picture: string | null;
};

type AdminAuthGateProps = {
  initialSession: AdminSession | null;
};

export function AdminAuthGate({ initialSession }: AdminAuthGateProps) {
  const queryClient = useQueryClient();
  const sessionQueryKey = ["admin-session"];

  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: async () => initialSession,
    initialData: initialSession,
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: async (credential: string) => {
      return loginAdminServerFn({ data: { credential } });
    },
    onSuccess: (session) => {
      queryClient.setQueryData(sessionQueryKey, session);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => logoutAdminServerFn(),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });

  const session = sessionQuery.data;
  const loginError = loginMutation.error instanceof Error ? loginMutation.error.message : null;

  return (
    <main className="admin-webtui admin-screen">
      {!session ? (
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
          {loginError ? <p className="admin-auth-error">{loginError}</p> : null}
        </section>
      ) : (
        <div className="admin-shell">
          <header box-="double" className="admin-shell-header">
            <div className="admin-copy" is-="typography-block">
              <span cap-="square round" is-="badge" variant-="foreground0">
                Admin
              </span>
              <h1>Authenticated admin area</h1>
              <p>
                Signed in as <code>{session.email}</code>
              </p>
            </div>
            <button
              box-="round"
              className="admin-logout-button"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              type="button"
              variant-="foreground0"
            >
              {logoutMutation.isPending ? "Signing out..." : "Sign out"}
            </button>
          </header>
          <Outlet />
        </div>
      )}
    </main>
  );
}

type GoogleSignInButtonProps = {
  disabled: boolean;
  onCredential: (response: CredentialResponse) => void;
  onError: () => void;
};

function GoogleSignInButton({ disabled, onCredential, onError }: GoogleSignInButtonProps) {
  const { clientId, scriptLoadedSuccessfully } = useGoogleOAuth();
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);

  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!scriptLoadedSuccessfully || typeof window === "undefined") {
      return;
    }

    const googleId = window.google?.accounts?.id;

    if (!googleId) {
      return;
    }

    if (window.__appsDebugjoisGoogleInit?.clientId === clientId) {
      return;
    }

    googleId.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          onErrorRef.current();
          return;
        }

        onCredentialRef.current(response);
      },
    });

    window.__appsDebugjoisGoogleInit = { clientId };
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
      {disabled ? (
        <p className="admin-status-copy">Waiting for the current sign-in attempt...</p>
      ) : null}
    </div>
  );
}
