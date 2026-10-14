import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Upload, X } from "lucide-react";
import { useQuiz } from "@/context/QuizContext";
import { QuestionControls } from "@/components/quiz/QuestionControls";
import { loadQuizPackage } from "@/utils/quizPackageLoader";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Quizmaster Control – Quiz Show" },
      { name: "description", content: "Quiz-Paket laden, Fragen steuern und Antworten werten." },
      { property: "og:title", content: "Quizmaster Control – Quiz Show" },
      { property: "og:description", content: "Quiz-Paket laden, Fragen steuern und Antworten werten." },
    ],
  }),
  component: AdminPage,
});

const TYPE_LABEL: Record<string, string> = {
  buzzer: "Buzzer",
  choice: "Multiple Choice",
  slider: "Schätzfrage",
  clue_ladder: "Hinweis-Leiter",
  mosaic: "Mosaik",
  grid_coords: "Koordinaten",
};

function AdminPage() {
  const q = useQuiz();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    if (!/\.(quiz|zip)$/i.test(file.name)) return setError("Bitte eine .quiz- oder .zip-Datei wählen.");
    setError(null);
    setLoading(true);
    try {
      q.setQuiz(await loadQuizPackage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paket konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const question = q.quiz?.questions[q.currentQuestionIndex];
  const total = q.quiz?.questions.length ?? 0;

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Start</Link>
          <h1 className="text-2xl font-bold">Quizmaster Control</h1>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase">{q.roundStatus}</span>
        </header>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? "border-primary bg-primary/10" : "hover:border-primary/60"}`}
        >
          <input ref={inputRef} type="file" accept=".quiz,.zip" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          <Upload className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="font-semibold">{loading ? "Lade Paket…" : q.quiz ? `Geladen: ${q.quiz.sourceFileName} – neues Paket ablegen` : ".quiz- oder .zip-Datei hier ablegen oder klicken"}</p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>

        {q.quiz && question && (
          <>
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
              <div>
                <h2 className="text-xl font-bold">{q.quiz.meta.title}</h2>
                <p className="text-sm text-muted-foreground">von {q.quiz.meta.author}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={q.prevQuestion} disabled={q.currentQuestionIndex === 0} className="rounded-lg bg-secondary p-2 disabled:opacity-40"><ChevronLeft /></button>
                <span className="font-mono text-lg">{q.currentQuestionIndex + 1} / {total}</span>
                <button onClick={q.nextQuestion} disabled={q.currentQuestionIndex >= total - 1} className="rounded-lg bg-secondary p-2 disabled:opacity-40"><ChevronRight /></button>
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{TYPE_LABEL[question.type] ?? question.type}</span>
                <span className="text-sm text-muted-foreground">{question.points} Punkte</span>
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">{question.title}</h3>
              <p className="mt-1 text-2xl font-bold">{question.question}</p>
              {question.hostNotes && (
                <div className="mt-5 rounded-xl bg-secondary p-4 text-sm">
                  {question.hostNotes.solution && <p><span className="font-semibold text-primary">Lösung:</span> {question.hostNotes.solution}</p>}
                  {question.hostNotes.trivia && <p className="mt-1 text-muted-foreground"><span className="font-semibold">Trivia:</span> {question.hostNotes.trivia}</p>}
                </div>
              )}
              <QuestionControls key={question.id} question={question} />
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => q.setRoundStatus("running")} className="rounded-lg bg-secondary px-4 py-2 font-semibold">▶ Starten</button>
                <button onClick={() => q.setRoundStatus("locked")} className="rounded-lg bg-secondary px-4 py-2 font-semibold">⏸ Sperren</button>
                <button onClick={() => q.setRoundStatus("resolved")} className="flex items-center gap-1 rounded-lg bg-success px-4 py-2 font-semibold text-success-foreground"><Check className="h-4 w-4" /> Richtig</button>
                <button onClick={() => q.setRoundStatus("locked")} className="flex items-center gap-1 rounded-lg bg-destructive px-4 py-2 font-semibold text-destructive-foreground"><X className="h-4 w-4" /> Falsch</button>
              </div>
            </section>
          </>
        )}

        <section className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 font-bold">Teams</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {q.teams.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
                <span className="font-semibold">{t.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => q.adjustScore(t.id, -(question?.penaltyPoints ?? 1))} className="h-8 w-8 rounded-md bg-muted">−</button>
                  <span className="w-12 text-center font-mono text-lg">{t.score}</span>
                  <button onClick={() => q.adjustScore(t.id, question?.points ?? 1)} className="h-8 w-8 rounded-md bg-primary text-primary-foreground">+</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
