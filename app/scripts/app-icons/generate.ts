// Renders each app's icon kit and link-preview card from src/apps/<app>/icon.svg
// and src/apps/<app>/brand.ts into public/icons/<slug>/. Run `npm run icons`.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AppBrand } from "../../src/core/appBrand.ts";

const appRoot = join(import.meta.dirname, "../..");
const appsDir = join(appRoot, "src/apps");
const publicDir = join(appRoot, "public");
const fontsDir = join(import.meta.dirname, "fonts");
const fontFiles = readdirSync(fontsDir)
  .filter((file) => file.endsWith(".ttf"))
  .map((file) => join(fontsDir, file));

// Browsers request /favicon.ico and /apple-touch-icon.png on their own for
// pages that link no icons, such as 404s. Use the app that `/` redirects to.
const ROOT_FALLBACK_APP = "transcript-reader";

function render(svg: string, width: number) {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "DM Sans" },
  })
    .render()
    .asPng();
}

function embed(iconSvg: string, x: number, y: number, size: number) {
  const href = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString("base64")}`;
  return `<image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

function tile(iconSvg: string, background: string, size: number, inset: number) {
  return render(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${background}"/>
      ${embed(iconSvg, inset, inset, size - 2 * inset)}
    </svg>`,
    size,
  );
}

// ICO files may hold PNG images directly; every browser that reads ICO accepts them.
function ico(pngs: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map(({ data }) => data)]);
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function card(iconSvg: string, brand: AppBrand, content: NonNullable<AppBrand["card"]>) {
  const titleTop = 255;
  const titleLeading = 100;
  const taglineTop = titleTop + titleLeading * (content.title.length - 1) + 102;
  const lines = (texts: string[], top: number, leading: number) =>
    texts
      .map((text, i) => `<tspan x="88" y="${top + i * leading}">${escapeXml(text)}</tspan>`)
      .join("");
  return render(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs>
        <radialGradient id="glow" cx="0.72" cy="0.45" r="0.6">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.07"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="bar">
          <stop offset="0" stop-color="${content.accent}"/>
          <stop offset="1" stop-color="${content.highlight}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="${brand.themeColor}"/>
      <rect width="1200" height="630" fill="url(#glow)"/>
      <text x="88" y="152" font-family="DM Sans" font-weight="600" font-size="20" letter-spacing="5.6" fill="${content.accent}">${escapeXml(content.eyebrow.toUpperCase())}</text>
      <text font-family="Newsreader 72pt" font-size="100" fill="#efeef8">${lines(content.title, titleTop, titleLeading)}</text>
      <text font-family="Newsreader 72pt" font-size="36" fill="#c9c6e6" fill-opacity="0.85">${lines(content.tagline, taglineTop, 46)}</text>
      <text x="88" y="568" font-family="DM Sans" font-weight="500" font-size="24" fill="${content.highlight}">apps.debugjois.dev</text>
      ${embed(iconSvg, 576, 27, 576)}
      <rect y="618" width="1200" height="12" fill="url(#bar)"/>
    </svg>`,
    1200,
  );
}

function manifest(brand: AppBrand) {
  const base = `/icons/${brand.slug}`;
  return `${JSON.stringify(
    {
      id: brand.startUrl,
      name: `${brand.name} · apps.debugjois.dev`,
      short_name: brand.shortName,
      start_url: brand.startUrl,
      scope: brand.startUrl,
      display: "standalone",
      background_color: brand.themeColor,
      theme_color: brand.themeColor,
      icons: [
        { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: `${base}/icon-maskable-512.png`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

for (const app of readdirSync(appsDir).sort()) {
  const brandFile = join(appsDir, app, "brand.ts");
  const { brand } = (await import(pathToFileURL(brandFile).href)) as { brand: AppBrand };
  const iconSvg = readFileSync(join(appsDir, app, "icon.svg"), "utf8");
  const outDir = join(publicDir, "icons", brand.slug);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const favicon = ico(
    [16, 32, 48].map((size) => ({
      size,
      data: render(iconSvg.replace("<svg ", `<svg width="${size}" height="${size}" `), size),
    })),
  );
  const appleTouchIcon = tile(iconSvg, brand.themeColor, 180, 0);
  const outputs: Record<string, string | Buffer> = {
    "favicon.svg": iconSvg,
    "favicon.ico": favicon,
    "apple-touch-icon.png": appleTouchIcon,
    "icon-192.png": tile(iconSvg, brand.themeColor, 192, 0),
    "icon-512.png": tile(iconSvg, brand.themeColor, 512, 0),
    "icon-maskable-512.png": tile(iconSvg, brand.themeColor, 512, 64),
    "manifest.webmanifest": manifest(brand),
  };
  if (brand.card) outputs["og-card.png"] = card(iconSvg, brand, brand.card);
  for (const [file, data] of Object.entries(outputs)) writeFileSync(join(outDir, file), data);

  if (app === ROOT_FALLBACK_APP) {
    writeFileSync(join(publicDir, "favicon.ico"), favicon);
    writeFileSync(join(publicDir, "apple-touch-icon.png"), appleTouchIcon);
  }
  console.log(`${app}: ${Object.keys(outputs).join(", ")}`);
}
