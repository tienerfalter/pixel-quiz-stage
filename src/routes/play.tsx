import { createFileRoute } from "@tanstack/react-router";
import { PlayerPad } from "@/components/quiz/PlayerPad";

export const Route = createFileRoute("/play")({
  validateSearch: (s: Record<string, unknown>) => ({ room: typeof s["room"] === "string" ? s["room"] : undefined }),
  head: () => ({
    meta: [
      { title: "Mitspielen – Quiz Show" },
      { name: "description", content: "Raumcode eingeben, Team benennen und live mitspielen." },
      { property: "og:title", content: "Mitspielen – Quiz Show" },
      { property: "og:description", content: "Raumcode eingeben, Team benennen und live mitspielen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { room } = Route.useSearch();
  return <PlayerPad key={room ?? ""} initialRoom={room} />;
}
