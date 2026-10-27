import { createFileRoute } from "@tanstack/react-router";
import { brand } from "#/apps/tv-show-memes/brand";
import { ContactSheet } from "#/apps/tv-show-memes/ContactSheet";
import tvShowMemesStylesHref from "#/apps/tv-show-memes/styles.css?url";
import { appCardMeta, appIconLinks, appThemeMeta, SITE_ORIGIN } from "#/core/appBrand";

const description = "Stack TV show screenshots into a meme grid and export it as one PNG.";

export const Route = createFileRoute("/tv-show-memes")({
  head: () => ({
    meta: [
      { title: brand.name },
      appThemeMeta(brand),
      { name: "description", content: description },
      { property: "og:site_name", content: brand.name },
      { property: "og:type", content: "website" },
      { property: "og:title", content: brand.name },
      { property: "og:description", content: description },
      { property: "og:url", content: `${SITE_ORIGIN}${brand.startUrl}` },
      ...appCardMeta(brand),
    ],
    links: [{ rel: "stylesheet", href: tvShowMemesStylesHref }, ...appIconLinks(brand)],
  }),
  component: ContactSheet,
});
