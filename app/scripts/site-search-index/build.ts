import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import * as pagefind from "pagefind";
import { archiveUrl, type IndexStatus } from "../../src/apps/site-search/archive.ts";
import { renderNote, type Note } from "../../src/apps/site-search/render.ts";

const [notesDir, outDir = "public/site-search/index"] = process.argv.slice(2);
if (!notesDir) {
  console.error("usage: node scripts/site-search-index/build.ts <daily-notes-dir> [out-dir]");
  process.exit(2);
}

async function readNotes(dir: string): Promise<Note[]> {
  const files = (await readdir(dir))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  return Promise.all(
    files.map(async (f) => ({
      date: f.slice(0, 10),
      markdown: await readFile(path.join(dir, f), "utf8"),
    })),
  );
}

function sourceCommit(dir: string): string | undefined {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const notes = await readNotes(notesDir);
const { index, errors } = await pagefind.createIndex({ forceLanguage: "en" });
if (!index) throw new Error(errors.join("\n"));

const idsByMonth = new Map<string, Set<string>>();
for (const note of notes) {
  const month = note.date.slice(0, 7);
  const monthIds = idsByMonth.get(month) ?? new Set();
  idsByMonth.set(month, monthIds);
  const { html, anchor } = renderNote(note, monthIds);
  const result = await index.addHTMLFile({ url: archiveUrl(note.date, anchor), content: html });
  if (result.errors.length) throw new Error(`${note.date}: ${result.errors.join("\n")}`);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const written = await index.writeFiles({ outputPath: outDir });
if (written.errors.length) throw new Error(written.errors.join("\n"));
await pagefind.close();

const status: IndexStatus = {
  entries: notes.length,
  newest: notes[0]?.date,
  oldest: notes.at(-1)?.date,
  commit: sourceCommit(notesDir),
  indexedAt: new Date().toISOString(),
};
await writeFile(path.join(outDir, "status.json"), `${JSON.stringify(status, null, 2)}\n`);
console.log(`Indexed ${notes.length} notes into ${outDir}`);
