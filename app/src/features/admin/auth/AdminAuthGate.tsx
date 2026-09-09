import { useGoogleOAuth } from "@react-oauth/google";
import type {
  CredentialResponse,
  GsiButtonConfiguration,
  IdConfiguration,
} from "@react-oauth/google";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { AdminSession } from "../../../lib/auth/server";

declare global {
  interface Window {
    // Tracks the singleton Google Identity Services configuration for this page.
    __appsDebugjoisGoogleInit?: {
      clientId: string;
    };
    // API installed by the Google Identity Services script after it loads.
    google?: {
      accounts?: {
        id?: {
          initialize: (configuration: IdConfiguration) => void;
          renderButton: (parent: HTMLElement, configuration: GsiButtonConfiguration) => void;
        };
      };
    };
  }
}

type AdminAuthGateProps = {
  initialSession: AdminSession | null;
  children: React.ReactNode;
};

export function AdminAuthGate({ initialSession, children }: AdminAuthGateProps) {
  const [session, setSession] = useState(initialSession);
  const loginMutation = useMutation({
    mutationFn: loginAdmin,
    onSuccess: setSession,
  });

  const loginError = loginMutation.error instanceof Error ? loginMutation.error.message : null;

  if (session) {
    return children;
  }

  return (
    <main className="admin-auth-screen">
      <section className="admin-auth-card">
        <p className="admin-eyebrow">Admin</p>
        <h1>Sign in to access admin routes.</h1>
        <p>Only allowed Google accounts can view this section.</p>
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
    </main>
  );
}

async function loginAdmin(credential: string): Promise<AdminSession> {
  const response = await fetch("/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credential }),
  });

  if (!response.ok) {
    throw new Error("Google sign-in could not be completed");
  }

  return response.json() as Promise<AdminSession>;
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

  useEffect(() => {
    onCredentialRef.current = onCredential;
    onErrorRef.current = onError;
  }, [onCredential, onError]);

  useEffect(() => {
    if (!scriptLoadedSuccessfully || typeof window === "undefined") {
      return;
    }

    const googleId = window.google?.accounts?.id;

    if (!googleId || window.__appsDebugjoisGoogleInit?.clientId === clientId) {
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
    </div>
  );
}
