import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appIconLinks, type AppBrand } from "#/core/appBrand";

const appRoot = join(import.meta.dirname, "../..");
const apps = readdirSync(join(appRoot, "src/apps"));

describe.each(apps)("%s icon kit", (app) => {
  it("is generated for the current brand", async () => {
    const { brand } = (await import(`../apps/${app}/brand.ts`)) as { brand: AppBrand };
    const iconDir = join(appRoot, "public/icons", brand.slug);
    const publicPath = (href: string) => join(appRoot, "public", href);

    for (const { href } of appIconLinks(brand))
      expect(existsSync(publicPath(href)), href).toBe(true);
    expect(readFileSync(join(iconDir, "favicon.svg"), "utf8")).toBe(
      readFileSync(join(appRoot, "src/apps", app, "icon.svg"), "utf8"),
    );
    const manifest = JSON.parse(readFileSync(join(iconDir, "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ start_url: brand.startUrl, theme_color: brand.themeColor });
    for (const { src } of manifest.icons) expect(existsSync(publicPath(src)), src).toBe(true);
    expect(existsSync(join(iconDir, "og-card.png"))).toBe(brand.card !== undefined);
  });
});
