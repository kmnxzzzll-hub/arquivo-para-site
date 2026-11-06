import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bac Bo Live — Live Bac Bo signals" },
      { name: "description", content: "Access the private Bac Bo Live signals platform." },
      { property: "og:title", content: "Bac Bo Live" },
      { property: "og:description", content: "Private platform with live Bac Bo signals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
});
