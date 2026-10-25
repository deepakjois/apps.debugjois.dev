import { createFileRoute } from "@tanstack/react-router";
import { brand } from "#/apps/logger/brand";
import { Logger } from "#/apps/logger/Logger";
import loggerStylesHref from "#/apps/logger/styles.css?url";
import { appIconLinks, appThemeMeta } from "#/core/appBrand";

export const Route = createFileRoute("/admin/logger")({
  head: () => ({
    meta: [{ title: brand.name }, appThemeMeta(brand)],
    links: [{ rel: "stylesheet", href: loggerStylesHref }, ...appIconLinks(brand)],
  }),
  component: Logger,
});
