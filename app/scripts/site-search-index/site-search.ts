import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { sectionUrl } from "../../src/apps/site-search/archive.ts";
import {
  PAGEFIND_OPTIONS,
  searchOptions,
  type ResultData,
  type Sort,
} from "../../src/apps/site-search/pagefind.ts";

const usage = `usage: npm run site-search -- [options] <query>

Searches a Pagefind index the way /site-search does and prints each matching
entry with its sections, excerpts, and archive links.

  --index <dir|url>  index to search (default: public/site-search/index)
                     e.g. https://apps.debugjois.dev/site-search/index
  --sort <order>     newest (default) or relevance
  --limit <n>        entries to print (default: 10, 0 for all)
  --json             print results as JSON`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    index: { type: "string", default: "public/site-search/index" },
    sort: { type: "string", default: "newest" },
    limit: { type: "string", default: "10" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const term = positionals.join(" ").trim();
const sort = values.sort as Sort;
const limit = Number(values.limit);
if (values.help || !term || !["newest", "relevance"].includes(sort) || !(limit >= 0)) {
  console.error(usage);
  process.exit(values.help ? 0 : 2);
}

// Pagefind fetches its index relative to pagefind.js. Node's fetch has no file: support.
const networkFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== "file:") return networkFetch(input, init);
  try {
    return new Response(await readFile(fileURLToPath(url)));
  } catch {
    return new Response(null, { status: 404 });
  }
};

type Pagefind = {
  options: (options: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void>;
  search: (
    term: string,
    options: ReturnType<typeof searchOptions>,
  ) => Promise<{ results: { data: () => Promise<ResultData> }[] }>;
};

async function loadPagefind(index: string): Promise<Pagefind> {
  if (!/^https?:\/\//.test(index)) {
    const entry = pathToFileURL(path.resolve(index, "pagefind.js")).href;
    const pagefind = (await import(entry)) as Pagefind;
    await pagefind.options(PAGEFIND_OPTIONS);
    return pagefind;
  }
  const basePath = `${index.replace(/\/+$/, "")}/`;
  const response = await networkFetch(`${basePath}pagefind.js`);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${basePath}pagefind.js`);
  const file = path.join(await mkdtemp(path.join(tmpdir(), "pagefind-")), "pagefind.js");
  await writeFile(file, await response.text());
  const pagefind = (await import(pathToFileURL(file).href)) as Pagefind;
  // Before init, options() replaces earlier options instead of merging them.
  await pagefind.options({ ...PAGEFIND_OPTIONS, basePath });
  return pagefind;
}

const pagefind = await loadPagefind(values.index);
await pagefind.init();

const started = performance.now();
const { results } = await pagefind.search(term, searchOptions(sort));
const shown = await Promise.all((limit ? results.slice(0, limit) : results).map((r) => r.data()));
const elapsed = Math.round(performance.now() - started);

const entries = shown.map((item) => ({
  date: item.meta.date,
  url: item.url,
  sections: (item.sub_results.length
    ? item.sub_results
    : [{ title: "", url: item.url, excerpt: item.excerpt }]
  ).map((s) => ({
    title: s.title,
    url: sectionUrl(item.meta.date, item.url, "anchor" in s ? s.anchor?.id : undefined),
    excerpt: s.excerpt,
  })),
}));

if (values.json) {
  console.log(JSON.stringify({ term, sort, total: results.length, entries }, null, 2));
} else {
  const tty = process.stdout.isTTY;
  const mark = (html: string) =>
    html
      .replace(/<mark>(.*?)<\/mark>/g, tty ? "\x1b[1;33m$1\x1b[0m" : "[$1]")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  console.log(`${results.length} entries for "${term}" (${sort}, ${elapsed} ms)`);
  for (const entry of entries) {
    console.log(`\n${entry.date}  ${entry.url}`);
    for (const section of entry.sections) {
      if (section.title) console.log(`  ${section.title}`);
      console.log(`    ${mark(section.excerpt)}`);
      console.log(`    ${section.url}`);
    }
  }
  if (shown.length < results.length) {
    console.log(`\n${results.length - shown.length} more; pass --limit 0 to print all`);
  }
}
