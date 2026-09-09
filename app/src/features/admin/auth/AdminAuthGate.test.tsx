/* @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAuthGate } from "./AdminAuthGate";

vi.mock("@react-oauth/google", () => ({
  useGoogleOAuth: () => ({
    clientId: "test-client-id",
    scriptLoadedSuccessfully: false,
  }),
}));

afterEach(cleanup);

function renderGate(initialSession: Parameters<typeof AdminAuthGate>[0]["initialSession"]) {
  // Each render gets isolated mutation state, matching the app's request-local query client.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAuthGate initialSession={initialSession}>
        <p>Private admin content</p>
      </AdminAuthGate>
    </QueryClientProvider>,
  );
}

describe("AdminAuthGate", () => {
  it("hides admin content when there is no verified session", () => {
    renderGate(null);

    expect(screen.getByRole("heading", { name: "Sign in to access admin routes." })).toBeTruthy();
    expect(screen.queryByText("Private admin content")).toBeNull();
  });

  it("renders admin content for the server-verified session", () => {
    renderGate({ email: "deepak.jois@gmail.com", name: "Deepak", picture: null });

    expect(screen.getByText("Private admin content")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sign in to access admin routes." })).toBeNull();
  });
});
