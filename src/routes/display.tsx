import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { StageQuestion } from "@/components/quiz/StageQuestion";
import { StageTimer } from "@/components/quiz/TimerDisplay";
import { playCorrectSound, playWrongSound, startDrumRoll, playFanfare } from "@/utils/soundEffects";
import { useQuiz } from "@/context/QuizContext";
import type { Team } from "@/types/quiz";
import { QuestionErrorBoundary } from "@/components/quiz/QuestionErrorBoundary";

export const Route = createFileRoute("/display")({
  validateSearch: (s: Record<string, unknown>) => ({ room: typeof s["room"] === "string" ? s["room"].toUpperCase() : undefined }),
  head: () => ({
    meta: [
      { title: "Bühnenanzeige – Quiz Show" },
      { name: "description", content: "Vollbild-Bühnenansicht des Quiz für Beamer und TV." },
      { property: "og:title", content: "Bühnenanzeige – Quiz Show" },
      { property: "og:description", content: "Vollbild-Bühnenansicht des Quiz für Beamer und TV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DisplayPage,
});

function DisplayPage() {
  const { quiz, theme, currentQuestionIndex, teams, sfx, nextQuestion, phase, status, showScores, room, setRoom, buzzerWinner, isPaused } = useQuiz();
  const { room: roomParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [codeInput, setCodeInput] = useState("");
  const [askCode, setAskCode] = useState(false);
  useEffect(() => {
    if (roomParam) setRoom({ code: roomParam, role: "viewer" });
    return () => { if (roomParam) setRoom(null); };
  }, [roomParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const roomCode = roomParam ?? room?.code;
  const buzzTeam = teams.find((t) => t.id === buzzerWinner);
  const joinUrl = roomCode && typeof window !== "undefined" ? `${window.location.origin}/play?room=${roomCode}` : "";
  useEffect(() => {
    if (sfx.seq === 0) return;
    if (sfx.kind === "correct") playCorrectSound();
    else playWrongSound();
  }, [sfx.seq, sfx.kind]);
  useEffect(() => {
    if (status === "intermission") return startDrumRoll();
    if (status === "podium") playFanfare();
    return undefined;
  }, [status]);
  const question = status === "running" ? quiz?.questions[currentQuestionIndex] : undefined;
  // Info-Folien haben keine Vorlese-Phase und erscheinen sofort.
  const waiting = !!question && phase === "ready" && question.type !== "info";
  const bg = quiz?.branding?.backgroundImage;
  const compactResolution = phase === "resolved" && question && ["mosaic", "grid_coords", "clue_ladder"].includes(question.type);

  return (
    <main
      data-quiz-theme={theme}
      className="quiz-themed bg-stage relative flex h-screen w-screen flex-col overflow-hidden bg-cover bg-center text-foreground"
      style={bg ? { backgroundImage: `linear-gradient(var(--stage-image-overlay), var(--stage-image-overlay)), url(${bg})` } : undefined}
    >
      {question && !waiting && <StageTimer />}
      {quiz?.branding?.cornerLogo && (
        <img src={quiz.branding.cornerLogo} alt="Logo" className="absolute right-8 top-8 h-20 w-auto object-contain" />
      )}

      <div className={`flex min-h-0 flex-1 flex-col items-center justify-center text-center ${compactResolution ? "stage-resolved-content px-8 pb-4 pt-28" : "px-16"}`}>
        {isPaused ? (
          <div className="relative z-30 flex flex-col items-center animate-in fade-in duration-700">
            {quiz?.pause?.image && (
              <img src={quiz.pause.image} alt="" className="mb-8 max-h-[40vh] w-auto rounded-2xl object-contain shadow-glow" />
            )}
            <h1 className="text-6xl font-extrabold">{quiz?.pause?.title || "⏸ Kurze Pause"}</h1>
            <p className="mt-6 text-2xl uppercase tracking-[0.3em] text-primary">{quiz?.pause?.subtitle || "Gleich geht es weiter…"}</p>
          </div>
        ) : quiz && status === "intermission" ? (
          <div className="relative z-30 flex flex-col items-center animate-in fade-in duration-1000">
            {quiz.outro?.intermission?.image && (
              <img src={quiz.outro.intermission.image} alt="" className="mb-8 max-h-[40vh] w-auto rounded-2xl object-contain shadow-glow" />
            )}
            <h1 className="animate-pulse text-6xl font-extrabold">{quiz.outro?.intermission?.title || "Die Würfel sind gefallen – Die Punkte werden gezählt!"}</h1>
            <p className="mt-6 text-2xl uppercase tracking-[0.3em] text-primary">{quiz.outro?.intermission?.subtitle || "Gleich folgt die Siegerehrung..."}</p>
          </div>
        ) : quiz && status === "podium" ? (
          <Podium teams={teams} title={quiz.outro?.title} />
        ) : quiz && status === "farewell" ? (
          <Farewell quiz={quiz} />        ) : !quiz || !question ? (
          <div className="relative z-30 flex max-h-full flex-col items-center">
            {quiz?.intro?.image && (
              <img src={quiz.intro.image} alt="" className="mb-8 max-h-[45vh] w-auto max-w-4xl rounded-2xl object-contain shadow-glow" />
            )}
            <h1 className="text-7xl font-extrabold">{quiz?.intro?.title || quiz?.meta.title || "Die Quiz-Show"}</h1>
            <p className="mt-6 text-2xl uppercase tracking-[0.4em] text-primary">
              {quiz?.intro?.subtitle || "Willkommen zum Quiz"}
            </p>
            {roomCode && (
              <div className="mt-10 flex items-center gap-8 rounded-3xl bg-card/85 px-10 py-6 backdrop-blur">
                <div className="rounded-xl bg-foreground p-3"><QRCodeSVG value={joinUrl} size={160} /></div>
                <div className="text-left">
                  <p className="text-lg uppercase tracking-[0.3em] text-muted-foreground">Jetzt beitreten</p>
                  <p className="font-mono text-7xl font-extrabold tracking-[0.2em] text-accent">{roomCode}</p>
                  <p className="mt-1 text-lg text-muted-foreground">{joinUrl.replace(/^https?:\/\//, "")}</p>
                </div>
              </div>
            )}
            {!roomCode && !quiz && (
              askCode ? (
                <form onSubmit={(e) => { e.preventDefault(); if (codeInput.length >= 4) navigate({ search: { room: codeInput } }); }} className="mt-10 flex gap-3">
                  <input autoFocus value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="RAUMCODE" className="rounded-xl border bg-input px-4 py-3 text-center font-mono text-3xl tracking-[0.3em] outline-none focus:border-primary" />
                  <button className="rounded-xl bg-primary px-6 text-xl font-bold text-primary-foreground">Verbinden</button>
                </form>
              ) : (
                <button onClick={() => setAskCode(true)} className="mt-10 rounded-xl bg-secondary px-6 py-3 text-lg font-semibold">Mit Live-Raum verbinden</button>
              )
            )}
          </div>
        ) : waiting ? (
          null
        ) : (
          <>
            <p className="text-xl font-semibold uppercase tracking-[0.3em] text-primary">
              Frage {currentQuestionIndex + 1} · {question.title}
            </p>
            <h1 className={`max-w-6xl font-extrabold leading-tight ${compactResolution ? "mt-3 text-4xl" : "mt-6 text-6xl"}`}>{question.question}</h1>
            <QuestionErrorBoundary resetKey={question.id} onSkip={nextQuestion}><StageQuestion key={question.id} question={question} /></QuestionErrorBoundary>
          </>
        )}
      </div>

      {question && phase === "guessing" && buzzTeam && (
        <div className="absolute inset-x-0 top-8 z-40 flex justify-center">
          <div className="shadow-glow animate-in zoom-in rounded-2xl bg-accent px-10 py-4 text-4xl font-extrabold text-accent-foreground">🔔 {buzzTeam.name} ist dran!</div>
        </div>
      )}
      {status === "podium" && <Confetti gold />}
      {quiz && showScores && (status === "intro" || status === "running") && (
        <footer className="relative z-10 flex justify-center gap-6 pb-8">
          {teams.map((t) => (
            <div key={t.id} className="rounded-xl bg-card/80 px-6 py-3 text-center backdrop-blur">
              <p className="text-sm text-muted-foreground">{t.name}</p>
              <p className="font-mono text-3xl font-bold text-primary">{t.score}</p>
            </div>
          ))}
        </footer>
      )}
    </main>
  );
}

const CONFETTI_COLORS = ["var(--primary)", "var(--success)", "var(--destructive)", "var(--accent)"];
const GOLD_COLORS = ["oklch(0.85 0.17 90)", "oklch(0.75 0.15 75)", "oklch(0.95 0.08 95)"];

function Podium({ teams, title }: { teams: Team[]; title?: string | undefined }) {
  const ranked = [...teams].sort((a, b) => b.score - a.score).slice(0, 3);
  const order = [ranked[1], ranked[0], ranked[2]];
  // Säulenhöhe proportional zum Punktestand: Gleichstand = exakt gleiche Höhe.
  const maxScore = Math.max(1, ...ranked.map((t) => t?.score ?? 0));
  const heightVh = (t: Team) => 12 + (Math.max(0, t.score) / maxScore) * 20;
  const cfg = [
    { delay: "1200ms" },
    { delay: "2400ms" },
    { delay: "0ms" },
  ];
  return (
    <div className="relative z-30 flex w-full flex-col items-center">
      <h1 className="mb-10 text-5xl font-extrabold">{title || "🏆 Siegerehrung"}</h1>
      <div className="flex items-end justify-center gap-6">
        {order.map((t, i) => { const c = cfg[i]!; const first = t === ranked[0]; return t ? (
          <div key={t.id} className="flex w-64 flex-col items-center animate-in fade-in slide-in-from-bottom-16 fill-mode-both duration-1000" style={{ animationDelay: c.delay }}>
            <p className={`font-extrabold ${first ? "text-5xl text-primary" : "text-3xl"}`}>{t.name}</p>
            <p className="mb-3 mt-1 font-mono text-2xl text-muted-foreground">{t.score} Punkte</p>
            <div className={`flex w-full items-start justify-center rounded-t-2xl bg-card/85 pt-4 backdrop-blur ${first ? "shadow-glow border-2 border-primary" : ""}`} style={{ height: `${heightVh(t)}vh` }}>
              <span className="text-6xl font-extrabold text-primary">{first ? 1 : i === 0 ? 2 : 3}</span>
            </div>
          </div>
        ) : null; })}
      </div>
    </div>
  );
}

function Farewell({ quiz }: { quiz: NonNullable<ReturnType<typeof useQuiz>["quiz"]> }) {
  const f = quiz.outro?.farewell;
  const obj = typeof f === "object" ? f : undefined;
  const title = (typeof f === "string" ? f : obj?.title) || "Vielen Dank fürs Mitspielen & Gute Heimreise!";
  const logo = obj?.logo || quiz.branding?.cornerLogo;
  return (
    <div className="relative z-30 flex flex-col items-center rounded-3xl bg-card/70 px-16 py-12 backdrop-blur animate-in fade-in duration-[2000ms]">
      {obj?.image && <img src={obj.image} alt="" className="mb-8 max-h-[35vh] rounded-2xl object-contain" />}
      <h1 className="max-w-5xl text-6xl font-extrabold leading-tight">{title}</h1>
      {obj?.message && <p className="mt-6 text-2xl text-muted-foreground">{obj.message}</p>}
      {logo && <img src={logo} alt="Logo" className="mt-10 h-24 w-auto object-contain opacity-90" />}
    </div>
  );
}

function Confetti({ gold }: { gold?: boolean }) {
  const colors = gold ? GOLD_COLORS : CONFETTI_COLORS;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {Array.from({ length: 60 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 12) * 0.4}s`,
            animationDuration: `${4 + (i % 5)}s`,
          }}
        />
      ))}
    </div>
  );
}
