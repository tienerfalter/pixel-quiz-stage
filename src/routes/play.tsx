import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuiz } from "@/context/QuizContext";

export const Route = createFileRoute("/play")({
  head: () => ({
    meta: [
      { title: "Mitspielen – Quiz Show" },
      { name: "description", content: "Raumcode eingeben, Team wählen und mitspielen." },
      { property: "og:title", content: "Mitspielen – Quiz Show" },
      { property: "og:description", content: "Raumcode eingeben, Team wählen und mitspielen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { quiz, teams } = useQuiz();
  const [code, setCode] = useState("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const team = teams.find((t) => t.id === teamId);

  return (
    <main className="bg-stage flex min-h-screen flex-col items-center px-6 py-10">
      {quiz?.branding?.mobileBanner && (
        <img src={quiz.branding.mobileBanner} alt="" className="mb-6 w-full max-w-sm rounded-xl" />
      )}
      <h1 className="text-4xl font-extrabold">Mitspielen</h1>
      <p className="mt-2 text-muted-foreground">{quiz?.meta.title ?? "Warte auf das Quiz…"}</p>

      <div className="mt-8 w-full max-w-sm space-y-6">
        {team ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Du spielst für</p>
            <p className="mt-1 text-3xl font-bold text-primary">{team.name}</p>
            <button className="mt-8 aspect-square w-full rounded-full bg-accent text-3xl font-extrabold text-accent-foreground shadow-glow active:scale-95">
              BUZZ!
            </button>
            <button onClick={() => setTeamId(null)} className="mt-6 text-sm text-muted-foreground underline">Team wechseln</button>
          </div>
        ) : (
          <>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="RAUMCODE"
              className="w-full rounded-xl border bg-input px-4 py-4 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-primary"
            />
            <div className="space-y-3">
              <p className="text-sm font-semibold text-muted-foreground">Team wählen</p>
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTeamId(t.id)}
                  className="w-full rounded-xl border bg-card px-4 py-4 text-left text-lg font-semibold transition hover:border-primary"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
