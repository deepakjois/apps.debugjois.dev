import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteSearch } from "#/apps/site-search";
import { brand } from "#/apps/site-search/brand";
import type { Sort } from "#/apps/site-search/pagefind";
import siteSearchStylesHref from "#/apps/site-search/styles.css?url";
import { appCardMeta, appIconLinks, appThemeMeta, SITE_ORIGIN } from "#/core/appBrand";

const description = "Search every entry of Deepak Jois's daily log on debugjois.dev.";

type SiteSearchParams = { q?: string; sort?: "relevance" };

export const Route = createFileRoute("/site-search")({
  validateSearch: (search: Record<string, unknown>): SiteSearchParams => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    sort: search.sort === "relevance" ? "relevance" : undefined,
  }),
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
    links: [
      { rel: "stylesheet", href: siteSearchStylesHref },
      ...appIconLinks(brand),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap",
      },
    ],
  }),
  component: SiteSearchPage,
});

function SiteSearchPage() {
  const { q = "", sort = "newest" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <SiteSearch
      query={q}
      sort={sort as Sort}
      onChange={(next) =>
        void navigate({
          search: {
            q: next.query.trim() ? next.query : undefined,
            sort: next.sort === "relevance" ? "relevance" : undefined,
          },
          replace: true,
        })
      }
    />
  );
}
