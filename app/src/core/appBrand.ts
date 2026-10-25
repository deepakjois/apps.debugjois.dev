export const SITE_ORIGIN = "https://apps.debugjois.dev";

export type AppBrand = {
  /** Folder under `public/icons/` that holds the generated icon kit. */
  slug: string;
  name: string;
  shortName: string;
  startUrl: string;
  themeColor: string;
  card?: {
    eyebrow: string;
    title: string[];
    tagline: string[];
    accent: string;
    highlight: string;
  };
};

export function appIconLinks(brand: AppBrand) {
  const base = `/icons/${brand.slug}`;
  return [
    { rel: "icon", href: `${base}/favicon.ico`, sizes: "32x32" },
    { rel: "icon", href: `${base}/favicon.svg`, type: "image/svg+xml" },
    { rel: "apple-touch-icon", href: `${base}/apple-touch-icon.png` },
    { rel: "manifest", href: `${base}/manifest.webmanifest` },
  ];
}

export function appThemeMeta(brand: AppBrand) {
  return { name: "theme-color", content: brand.themeColor };
}

export function appCardMeta(brand: AppBrand) {
  return [
    { property: "og:image", content: `${SITE_ORIGIN}/icons/${brand.slug}/og-card.png` },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: `${brand.name} pixel-art logo` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}
