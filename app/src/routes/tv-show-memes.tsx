import { createFileRoute } from "@tanstack/react-router";
import { ContactSheet } from "#/apps/tv-show-memes/ContactSheet";
import tvShowMemesStylesHref from "#/apps/tv-show-memes/styles.css?url";

export const Route = createFileRoute("/tv-show-memes")({
  head: () => ({
    meta: [{ title: "TV Show Memes" }, { name: "theme-color", content: "#141318" }],
    links: [{ rel: "stylesheet", href: tvShowMemesStylesHref }],
  }),
  component: ContactSheet,
});
