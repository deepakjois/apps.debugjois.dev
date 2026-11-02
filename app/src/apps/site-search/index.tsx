import { useEffect, useRef, useState } from "react";
import { LOG_ORIGIN, archiveUrl, sectionUrl, type IndexStatus } from "./archive";
import {
  fetchIndexStatus,
  preload,
  search,
  type ResultData,
  type Sort,
  type SubResult,
} from "./pagefind";

const PAGE_SIZE = 12;
const SECTIONS_PER_RESULT = 3;

type Props = {
  query: string;
  sort: Sort;
  onChange: (next: { query: string; sort: Sort }) => void;
};

type Results = { term: string; sort: Sort; total: number; items: ResultData[] };

export function SiteSearch({ query, sort, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(query);
  const [results, setResults] = useState<Results | null>(null);
  const [loadMore, setLoadMore] = useState<(() => Promise<void>) | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<IndexStatus | null>(null);

  useEffect(() => {
    preload();
    fetchIndexStatus().then(setStatus, () => {});
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const term = value.trim();
    if (!term) return;
    let cancelled = false;
    search(term, sort).then(
      async (found) => {
        if (cancelled || !found) return;
        setError(false);
        let loaded: ResultData[] = [];
        const next = async () => {
          const page = await Promise.all(
            found.slice(loaded.length, loaded.length + PAGE_SIZE).map((r) => r.data()),
          );
          if (cancelled) return;
          loaded = [...loaded, ...page];
          setResults({ term, sort, total: found.length, items: loaded });
          setLoadMore(() => (loaded.length < found.length ? next : null));
        };
        await next();
      },
      () => !cancelled && setError(true),
    );
    return () => {
      cancelled = true;
    };
  }, [value, sort]);

  function update(nextValue: string, nextSort = sort) {
    setValue(nextValue);
    onChange({ query: nextValue, sort: nextSort });
  }

  const term = value.trim();
  // Keep the previous results on screen while the next search runs.
  const showing = term ? results : null;

  return (
    <div className="site-search">
      <main>
        <header className="ss-header">
          <p>
            <a href={`${LOG_ORIGIN}/`} className="ss-back">
              ← Home
            </a>
          </p>
          <p>
            Search every entry of the <a href={`${LOG_ORIGIN}/daily`}>daily log</a>, or browse the{" "}
            <a href={`${LOG_ORIGIN}/daily-archive-index`}>archive index</a>.
          </p>
        </header>

        <search className="ss-form">
          <form onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="ss-input" className="ss-visually-hidden">
              Search the daily log
            </label>
            <div className="ss-field">
              <svg className="ss-icon" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="4.75" />
                <path d="M10 10l4.25 4.25" />
              </svg>
              <input
                ref={inputRef}
                id="ss-input"
                type="search"
                value={value}
                placeholder="Search the daily log"
                autoComplete="off"
                spellCheck={false}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page exists to take a query
                autoFocus
                onChange={(event) => update(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && value) {
                    event.preventDefault();
                    update("");
                  }
                }}
              />
              {value ? (
                <button
                  type="button"
                  className="ss-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    update("");
                    inputRef.current?.focus();
                  }}
                >
                  ×
                </button>
              ) : (
                <kbd className="ss-kbd" aria-hidden="true">
                  /
                </kbd>
              )}
            </div>
          </form>
        </search>

        <div className="ss-toolbar" aria-live="polite">
          <span className="ss-count">{summary(term, showing, error, status)}</span>
          {term && !error ? (
            <fieldset className="ss-sort">
              <legend className="ss-visually-hidden">Sort results</legend>
              {(["newest", "relevance"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={sort === option}
                  onClick={() => update(value, option)}
                >
                  {option === "newest" ? "newest" : "best match"}
                </button>
              ))}
            </fieldset>
          ) : null}
        </div>

        {showing ? <ResultList results={showing} /> : null}

        {showing && loadMore ? (
          <button type="button" className="ss-more-results" onClick={() => void loadMore()}>
            Show more results
          </button>
        ) : null}
      </main>
    </div>
  );
}

function summary(
  term: string,
  results: Results | null,
  error: boolean,
  status: IndexStatus | null,
): string {
  if (error) return "The search index could not be loaded. Try again later.";
  if (!term) {
    if (!status) return "";
    const span =
      status.oldest && status.newest ? `, ${month(status.oldest)} – ${month(status.newest)}` : "";
    return `${status.entries} entries${span}. Indexed ${relativeTime(status.indexedAt)}.`;
  }
  if (!results) return "Searching…";
  if (results.total === 0) return `No entries match “${results.term}”.`;
  return `${results.total} ${results.total === 1 ? "entry" : "entries"}`;
}

function ResultList({ results }: { results: Results }) {
  if (results.sort === "relevance") {
    return (
      <ol className="ss-results">
        {results.items.map((item) => (
          <ResultItem key={item.url} item={item} />
        ))}
      </ol>
    );
  }

  const months: { key: string; items: ResultData[] }[] = [];
  for (const item of results.items) {
    const key = item.meta.date.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, items: [] });
    months.at(-1)!.items.push(item);
  }
  return (
    <div className="ss-results">
      {months.map(({ key, items }) => (
        <section key={key} className="ss-month">
          <h2>
            <a href={archiveUrl(items[0].meta.date)}>{month(`${key}-01`)}</a>
          </h2>
          <ol>
            {items.map((item) => (
              <ResultItem key={item.url} item={item} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ResultItem({ item }: { item: ResultData }) {
  const sections = item.sub_results.length
    ? item.sub_results
    : [{ title: "", url: item.url, excerpt: item.excerpt }];
  const shown = sections.slice(0, SECTIONS_PER_RESULT);
  const hidden = sections.length - shown.length;
  const dateAnchor = new URL(item.url).hash.slice(1);

  return (
    <li className="ss-result">
      <a className="ss-date" href={item.url}>
        <time dateTime={item.meta.date}>{item.meta.date}</time>
        <span>{weekday(item.meta.date)}</span>
      </a>
      <div className="ss-sections">
        {shown.map((section) => (
          <Section
            key={section.url}
            section={section}
            href={sectionHref(item, section)}
            untitled={!section.anchor || section.anchor.id === dateAnchor}
          />
        ))}
        {hidden > 0 ? (
          <a className="ss-more" href={item.url}>
            +{hidden} more {hidden === 1 ? "match" : "matches"} in this entry
          </a>
        ) : null}
      </div>
    </li>
  );
}

function Section({
  section,
  href,
  untitled,
}: {
  section: SubResult;
  href: string;
  untitled: boolean;
}) {
  return (
    <a className="ss-section" href={href}>
      {untitled ? null : <span className="ss-section-title">{section.title}</span>}
      <span className="ss-excerpt" dangerouslySetInnerHTML={{ __html: section.excerpt }} />
    </a>
  );
}

function sectionHref(item: ResultData, section: SubResult): string {
  return sectionUrl(item.meta.date, item.url, section.anchor?.id);
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function month(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
