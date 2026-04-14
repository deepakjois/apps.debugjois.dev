import { mkdir, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const outputDir = path.join(appDir, ".output");
const artifactsDir = path.join(appDir, "artifacts");
const zipPath = path.join(artifactsDir, "lambda-package.zip");

await stat(path.join(outputDir, "server", "index.mjs"));
await mkdir(artifactsDir, { recursive: true });
await rm(zipPath, { force: true });

await run("zip", ["-r", zipPath, "."], outputDir);

console.log(`Created ${path.relative(appDir, zipPath)}`);

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}
