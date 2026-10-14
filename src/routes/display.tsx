import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { StageQuestion } from "@/components/quiz/StageQuestion";
import { StageTimer } from "@/components/quiz/TimerDisplay";
import { playCorrectSound, playWrongSound } from "@/utils/soundEffects";
import { useQuiz } from "@/context/QuizContext";
import { QuestionErrorBoundary } from "@/components/quiz/QuestionErrorBoundary";

export const Route = createFileRoute("/display")({
  head: () => ({
    meta: [
      { title: "Bühnenanzeige – Quiz Show" },
      { name: "description", content: "Vollbild-Bühnenansicht des Quiz für Beamer und TV." },
      { property: "og:title", content: "Bühnenanzeige – Quiz Show" },
      { property: "og:description", content: "Vollbild-Bühnenansicht des Quiz für Beamer und TV." },
    ],
  }),
  component: DisplayPage,
});

function DisplayPage() {
  const { quiz, currentQuestionIndex, teams, sfx, nextQuestion } = useQuiz();
  useEffect(() => {
    if (sfx.seq === 0) return;
    if (sfx.kind === "correct") playCorrectSound();
    else playWrongSound();
  }, [sfx.seq, sfx.kind]);
  const question = quiz?.questions[currentQuestionIndex];
  const bg = quiz?.branding?.backgroundImage;

  return (
    <main
      className="bg-stage relative flex h-screen w-screen flex-col overflow-hidden bg-cover bg-center"
      style={bg ? { backgroundImage: `url(${bg})` } : undefined}
    >
      {question && <StageTimer />}
      {quiz?.branding?.cornerLogo && (
        <img src={quiz.branding.cornerLogo} alt="Logo" className="absolute right-8 top-8 h-20 w-auto object-contain" />
      )}

      <div className="flex flex-1 flex-col items-center justify-center px-16 text-center">
        {!quiz || !question ? (
          <>
            <p className="text-lg uppercase tracking-[0.4em] text-primary">Gleich geht's los</p>
            <h1 className="mt-4 text-7xl font-extrabold">{quiz?.meta.title ?? "Die Quiz-Show"}</h1>
          </>
        ) : (
          <>
            <p className="text-xl font-semibold uppercase tracking-[0.3em] text-primary">
              Frage {currentQuestionIndex + 1} · {question.title}
            </p>
            <h1 className="mt-6 max-w-6xl text-6xl font-extrabold leading-tight">{question.question}</h1>
            <QuestionErrorBoundary resetKey={question.id} onSkip={nextQuestion}><StageQuestion key={question.id} question={question} /></QuestionErrorBoundary>
          </>
        )}
      </div>

      {quiz && !quiz.meta.hideScoresLive && (
        <footer className="flex justify-center gap-6 pb-8">
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
