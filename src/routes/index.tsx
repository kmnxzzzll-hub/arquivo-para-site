import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bac Bo Live — Plataforma de análise estatística" },
      { name: "description", content: "Aceda à plataforma privada Bac Bo Live de análise estatística." },
      { property: "og:title", content: "Bac Bo Live" },
      { property: "og:description", content: "Plataforma privada de análise estatística de rodadas Bac Bo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
});
