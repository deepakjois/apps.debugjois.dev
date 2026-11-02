import { INDEX_PATH, type IndexStatus } from "./archive.ts";

export type Sort = "newest" | "relevance";

export type SubResult = {
  title: string;
  url: string;
  excerpt: string;
  anchor?: { id: string; text: string };
};

export type ResultData = {
  url: string;
  excerpt: string;
  meta: { date: string };
  sub_results: SubResult[];
};

type Result = { id: string; data: () => Promise<ResultData> };

type Pagefind = {
  options: (options: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void>;
  debouncedSearch: (
    term: string,
    options: { sort?: Record<string, "asc" | "desc"> },
    timeout: number,
  ) => Promise<{ results: Result[] } | null>;
};

// Shared with scripts/site-search-index/site-search.ts so the CLI searches exactly like the page.
export const PAGEFIND_OPTIONS = { excerptLength: 28, excerptEllipsis: "…" };

export function searchOptions(sort: Sort): { sort?: Record<string, "asc" | "desc"> } {
  return sort === "newest" ? { sort: { date: "desc" } } : {};
}

let pagefind: Promise<Pagefind> | undefined;

function loadPagefind(): Promise<Pagefind> {
  pagefind ??= (async () => {
    // A full URL keeps Vite's dev server from rewriting the import of a public/ file.
    const url = new URL(`${INDEX_PATH}/pagefind.js`, window.location.href).href;
    const module = (await import(/* @vite-ignore */ url)) as Pagefind;
    await module.options(PAGEFIND_OPTIONS);
    await module.init();
    return module;
  })();
  pagefind.catch(() => {
    pagefind = undefined;
  });
  return pagefind;
}

/** Resolves to null when a newer search supersedes this one. */
export async function search(term: string, sort: Sort): Promise<Result[] | null> {
  const pf = await loadPagefind();
  const response = await pf.debouncedSearch(term, searchOptions(sort), 150);
  return response?.results ?? null;
}

export async function fetchIndexStatus(): Promise<IndexStatus> {
  const response = await fetch(`${INDEX_PATH}/status.json`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as IndexStatus;
}

export function preload() {
  void loadPagefind().catch(() => {});
}
