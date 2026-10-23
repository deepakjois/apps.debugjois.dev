import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <main className="site-status">
      <h1>Page not found</h1>
      <p>There is nothing at this address.</p>
      <Link to="/">Go to the home page</Link>
    </main>
  );
}

export function ErrorPage({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <main className="site-status">
      <h1>Something went wrong</h1>
      <p>{error instanceof Error && error.message ? error.message : "The page could not load."}</p>
      <button type="button" onClick={() => void router.invalidate()}>
        Try again
      </button>
    </main>
  );
}
