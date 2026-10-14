import { createFileRoute, Link } from "@tanstack/react-router";
import { MonitorPlay, Settings2, Smartphone } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quiz Show – Startseite" },
      { name: "description", content: "Interaktive Quiz-Plattform mit Quizmaster, Bühnenanzeige und Spieler-Pad." },
      { property: "og:title", content: "Quiz Show – Startseite" },
      { property: "og:description", content: "Interaktive Quiz-Plattform mit Quizmaster, Bühnenanzeige und Spieler-Pad." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const cards = [
  { to: "/admin", title: "Quizmaster", desc: "Quiz laden & Runde steuern", Icon: Settings2 },
  { to: "/display", title: "Bühne", desc: "Vollbild für den Beamer", Icon: MonitorPlay },
  { to: "/play", title: "Spieler", desc: "Pad für Mitspieler", Icon: Smartphone },
] as const;

function Index() {
  return (
    <main className="bg-stage flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-primary">Live Quiz</p>
      <h1 className="mb-12 text-center text-5xl font-extrabold md:text-7xl">Die Quiz-Show</h1>
      <div className="grid w-full max-w-4xl gap-5 md:grid-cols-3">
        {cards.map(({ to, title, desc, Icon }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-2xl border bg-card/70 p-7 backdrop-blur transition hover:-translate-y-1 hover:border-primary hover:shadow-glow"
          >
            <Icon className="mb-5 h-9 w-9 text-primary" />
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-1 text-muted-foreground">{desc}</p>
            <p className="mt-4 font-mono text-sm text-primary/80">{to}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
