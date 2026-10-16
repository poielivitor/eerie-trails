import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/game/Game";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "O Trilho — Horror na floresta em pixel art" },
      { name: "description", content: "Segue o trilho de 250 metros pela floresta escura até à cabana, antes que o candeeiro se apague." },
      { property: "og:title", content: "O Trilho — Horror na floresta em pixel art" },
      { property: "og:description", content: "Segue o trilho pela floresta escura até à cabana, antes que o candeeiro se apague." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});
