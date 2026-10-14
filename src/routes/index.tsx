import { createFileRoute } from "@tanstack/react-router";
import { PlayerPad } from "@/components/quiz/PlayerPad";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Die Quiz-Show – Jetzt mitspielen" },
      { name: "description", content: "Raumcode eingeben und mit deinem Team live bei der Quiz-Show mitspielen." },
      { property: "og:title", content: "Die Quiz-Show – Jetzt mitspielen" },
      { property: "og:description", content: "Raumcode eingeben und mit deinem Team live bei der Quiz-Show mitspielen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <PlayerPad />,
});
