import { fetchAnswers, subscribeRoom } from "@/lib/roomData";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hostStatus, kickTeam, openRoom, pushRoom, renameRoomTeam, unlockHost } from "@/lib/room.functions";
import { publishQuizAssets } from "@/utils/roomAssets";
import { Check, ChevronLeft, ChevronRight, KeyRound, Plus, Trash2, Upload, X } from "lucide-react";
import { useQuiz } from "@/context/QuizContext";
import { needsInput } from "@/components/quiz/AnswerPad";
import { QuestionControls } from "@/components/quiz/QuestionControls";
import { QuestionErrorBoundary } from "@/components/quiz/QuestionErrorBoundary";
import { AdminTimer } from "@/components/quiz/TimerDisplay";
import { computeAwards, roundPoints, type ScoredAnswer } from "@/lib/scoring";

const PHASE_LABEL = { ready: "Vorlesen", guessing: "Raten", locked: "Gesperrt", resolved: "Aufgelöst" } as const;
import { loadQuizPackage } from "@/utils/quizPackageLoader";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Quizmaster Control – Quiz Show" },
      { name: "description", content: "Quiz-Paket laden, Fragen steuern und Antworten werten." },
      { property: "og:title", content: "Quizmaster Control – Quiz Show" },
      { property: "og:description", content: "Quiz-Paket laden, Fragen steuern und Antworten werten." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const status = useServerFn(hostStatus);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  useEffect(() => { status().then((r) => setUnlocked(r.unlocked)).catch(() => setUnlocked(false)); }, [status]);
  if (unlocked === null) return <main className="flex min-h-screen items-center justify-center text-muted-foreground">Lade…</main>;
  if (!unlocked) return <HostUnlock onUnlocked={() => setUnlocked(true)} />;
  return <AdminControl />;
}

function HostUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const unlock = useServerFn(unlockHost);
  const [key, setKey] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="bg-stage flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await unlock({ data: { key } }).catch(() => ({ ok: false }));
          setBusy(false);
          if (r.ok) onUnlocked(); else setErr(true);
        }}
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-8"
      >
        <KeyRound className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold">Quiz leiten</h1>
        <p className="text-sm text-muted-foreground">Gib deinen Host-Schlüssel ein, um die Regie freizuschalten.</p>
        <input type="password" value={key} onChange={(e) => { setKey(e.target.value); setErr(false); }} placeholder="Host-Schlüssel" autoComplete="current-password" className="w-full rounded-xl border bg-input px-4 py-3 outline-none focus:border-primary" />
        {err && <p className="text-sm text-destructive">Schlüssel ist nicht korrekt.</p>}
        <button disabled={busy || !key} className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{busy ? "Prüfe…" : "Freischalten"}</button>
      </form>
    </main>
  );
}

function RoomPanel() {
  const q = useQuiz();
  const open = useServerFn(openRoom);
  const push = useServerFn(pushRoom);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const winner = q.teams.find((t) => t.id === q.buzzerWinner);

  async function openLive() {
    if (!q.quiz) return;
    setErr(null);
    try {
      setBusy("Raum wird eröffnet…");
      const { code } = await open();
      setBusy("Medien werden hochgeladen…");
      const remote = await publishQuizAssets(code, q.quiz);
      await push({ data: { code, quiz: remote } });
      q.setRoom({ code, role: "host" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Raum konnte nicht eröffnet werden.");
    } finally {
      setBusy(null);
    }
  }

  if (!q.quiz) return null;
  if (!q.room) {
    return (
      <section className="rounded-2xl border bg-card p-5">
        <button onClick={openLive} disabled={!!busy} className="w-full rounded-xl bg-accent py-4 text-lg font-extrabold text-accent-foreground disabled:opacity-60">
          {busy ?? "Live-Raum eröffnen 📡"}
        </button>
        {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      </section>
    );
  }
  return (
    <section className="space-y-3 rounded-2xl border-2 border-accent/50 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Live-Raum</p>
          <p className="font-mono text-4xl font-extrabold tracking-[0.2em] text-accent">{q.room.code}</p>
        </div>
        <div className="space-y-1 text-right text-sm">
          <a href={`/display?room=${q.room.code}`} target="_blank" rel="noreferrer" className="block text-primary underline">Bühne öffnen: {origin}/display?room={q.room.code}</a>
          <p className="text-muted-foreground">Mitspieler: {origin}/play?room={q.room.code}</p>
        </div>
      </div>
      <AnswerCount code={q.room.code} />
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${winner ? "bg-accent text-accent-foreground" : "bg-secondary"}`}>
        <span className="text-lg font-bold">
          {winner ? `🔔 ${winner.name} hat gebuzzert!` : "Buzzer frei"}
          {q.buzzerLocked.length > 0 && <span className="block text-sm font-normal opacity-80">Gesperrt: {q.teams.filter((t) => q.buzzerLocked.includes(t.id)).map((t) => t.name).join(", ")}</span>}
        </span>
        {q.buzzerWinner && (
          <button onClick={() => q.buzzerWinner && q.lockOutBuzzer(q.buzzerWinner)} className="rounded-lg bg-background px-3 py-2 text-sm font-bold text-foreground">Buzzer für andere Teams freigeben</button>
        )}
      </div>
    </section>
  );
}

function AnswerCount({ code }: { code: string }) {
  const q = useQuiz();
  const idx = q.currentQuestionIndex;
  const question = q.quiz?.questions[idx];
  const [count, setCount] = useState(0);
  const relevant = !!question && q.status === "running" && needsInput(question);
  const autoLock = !!question && (["choice", "slider", "grid_coords"].includes(question.type) || (question.type === "clue_ladder" && question.inputMode === "choice"));
  const total = q.teams.length;
  const allIn = total > 0 && count >= total;
  const { phase, setPhase } = q;
  useEffect(() => {
    if (relevant && autoLock && allIn && phase === "guessing") setPhase("locked");
  }, [relevant, autoLock, allIn, phase, setPhase]);
  useEffect(() => {
    setCount(0);
    if (!relevant) return;
    const load = () => fetchAnswers(code, idx).then((rows) => setCount(rows.length));
    load();
    return subscribeRoom(code, (table) => { if (!table || table === "room_answers") load(); });
  }, [code, idx, relevant]);
  if (!relevant) return null;
  return (
    <div className={`rounded-xl px-4 py-3 text-lg font-bold ${total && count >= total ? "bg-success text-success-foreground" : "bg-secondary"}`}>
      📝 {count}/{total} Teams fertig{allIn ? " – Alle Antworten abgegeben!" : ""}
    </div>
  );
}

function AdminControl() {
  const q = useQuiz();
  const kick = useServerFn(kickTeam);
  const rename = useServerFn(renameRoomTeam);
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
      q.setRoom(null);
      q.setQuiz(await loadQuizPackage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Paket konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  const question = q.quiz?.questions[q.currentQuestionIndex];
  const total = q.quiz?.questions.length ?? 0;
  const pts = question ? roundPoints(question, q.revealedTiles.length, q.revealedClues) : 0;
  const isBuzzerRound = !!question && !needsInput(question);
  const booked = useRef(new Set<string>());
  const bookOnce = (key: string, fn: () => void) => { if (booked.current.has(key)) return; booked.current.add(key); fn(); };
  const qKey = `${q.quiz?.sourceFileName}-${q.currentQuestionIndex}`;

  async function resolve() {
    q.setPhase("resolved");
    if (!q.autoScoring || !q.room || !question || !needsInput(question)) return;
    const data = await fetchAnswers(q.room.code, q.currentQuestionIndex);
    const awards = computeAwards(question, data as ScoredAnswer[], q.revealedClues);
    bookOnce(`${qKey}-resolve`, () => Object.entries(awards).forEach(([id, p]) => q.adjustScore(id, p)));
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Start</Link>
          <h1 className="text-2xl font-bold">Quizmaster Control</h1>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={q.autoScoring} onChange={(e) => q.setAutoScoring(e.target.checked)} className="h-4 w-4 accent-primary" />
              Punkte automatisch verbuchen (Auto-Scoring)
            </label>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase">{PHASE_LABEL[q.phase]}</span>
          </div>
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

        <RoomPanel />

        {q.quiz && q.status === "intro" && (
          <section className="space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-8 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Bereit · {total} Fragen</p>
            <h2 className="text-3xl font-extrabold">{q.quiz.meta.title}</h2>
            <p className="text-muted-foreground">Der Beamer zeigt den Willkommensbildschirm.</p>
            <button onClick={q.startQuiz} className="shadow-glow w-full rounded-xl bg-primary py-5 text-xl font-extrabold text-primary-foreground">Quiz jetzt starten ▶</button>
          </section>
        )}

        {q.quiz && (q.status === "intermission" || q.status === "podium" || q.status === "farewell") && (
          <section className="space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-8 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Finale · {q.status === "intermission" ? "Stufe A: Auswertung" : q.status === "podium" ? "Stufe B: Siegerehrung" : "Stufe C: Verabschiedung"}
            </p>
            {q.status === "intermission" && (
              <button onClick={() => q.setStatus("podium")} className="shadow-glow w-full animate-pulse rounded-xl bg-primary py-5 text-xl font-extrabold text-primary-foreground">Siegerehrung starten 🏆</button>
            )}
            {q.status === "podium" && (
              <button onClick={() => q.setStatus("farewell")} className="shadow-glow w-full rounded-xl bg-primary py-5 text-xl font-extrabold text-primary-foreground">Verabschiedung / Abspann ▶</button>
            )}
            {q.status === "farewell" && <p className="text-muted-foreground">Der Beamer zeigt den Abschiedsbildschirm.</p>}
            <button
              onClick={() => (q.status === "intermission" ? q.goToQuestion(total - 1) : q.setStatus(q.status === "farewell" ? "podium" : "intermission"))}
              className="rounded-xl bg-secondary px-5 py-3 font-bold"
            >← Zurück</button>
          </section>
        )}

        {q.quiz && question && q.status === "running" && (
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
                <span className="text-sm font-bold text-accent">Mögliche Punkte dieser Runde: {pts} Punkte</span>
                {question.penaltyPoints ? <span className="text-sm text-muted-foreground">· Abzug bei Fehler: {question.penaltyPoints}</span> : null}
                <span className="text-xs text-muted-foreground">· {q.autoScoring ? "Auto-Scoring an" : "Manuelle Vergabe"}</span>
              </div>
              <h3 className="text-lg font-semibold text-muted-foreground">{question.title}</h3>
              <p className="mt-1 text-2xl font-bold">{question.question}</p>
              {question.hostNotes && (
                <div className="mt-5 rounded-xl bg-secondary p-4 text-sm">
                  {question.hostNotes.solution && <p><span className="font-semibold text-primary">Lösung:</span> {question.hostNotes.solution}</p>}
                  {question.hostNotes.trivia && <p className="mt-1 text-muted-foreground"><span className="font-semibold">Trivia:</span> {question.hostNotes.trivia}</p>}
                </div>
              )}
              <QuestionErrorBoundary resetKey={question.id} onSkip={q.nextQuestion}><QuestionControls key={question.id} question={question} /></QuestionErrorBoundary>
            </section>

            <section className="space-y-4 rounded-2xl border-2 border-primary/40 bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <AdminTimer />
                <div className="flex gap-3">
                  <button onClick={() => {
                    q.playSfx("correct");
                    q.setAudio({ playing: false });
                    const w = q.buzzerWinner;
                    if (q.autoScoring && isBuzzerRound && w && pts > 0) bookOnce(`${qKey}-ok-${w}`, () => q.adjustScore(w, pts));
                  }} className="flex items-center gap-1 rounded-lg bg-success px-5 py-3 text-lg font-bold text-success-foreground"><Check className="h-5 w-5" /> Richtig</button>
                  <button onClick={() => {
                    q.playSfx("wrong");
                    const w = q.buzzerWinner;
                    if (q.autoScoring && isBuzzerRound && w && question.penaltyPoints) bookOnce(`${qKey}-bad-${w}`, () => q.adjustScore(w, -question.penaltyPoints!));
                    if (q.room && question.type === "buzzer" && q.buzzerWinner && q.phase === "guessing") {
                      if (question.onWrongAnswer === "end_question") q.setPhase("locked");
                      else q.lockOutBuzzer(q.buzzerWinner);
                    }
                  }} className="flex items-center gap-1 rounded-lg bg-destructive px-5 py-3 text-lg font-bold text-destructive-foreground"><X className="h-5 w-5" /> Falsch</button>
                </div>
              </div>
              {q.phase === "ready" && (
                <button onClick={q.toggleTimer} className="shadow-glow w-full rounded-xl bg-primary py-5 text-xl font-extrabold text-primary-foreground">▶ Timer starten & Eingaben freigeben</button>
              )}
              {q.phase === "guessing" && (
                <button onClick={() => q.setPhase("locked")} className="w-full rounded-xl bg-secondary py-4 text-lg font-bold hover:bg-muted">⏸ Eingaben sperren</button>
              )}
              {q.phase === "locked" && (
                <button onClick={resolve} className="shadow-glow w-full rounded-xl bg-primary py-5 text-xl font-extrabold text-primary-foreground">Lösung auf Beamer enthüllen ▶</button>
              )}
              {q.phase === "resolved" && (
                <button onClick={q.currentQuestionIndex >= total - 1 ? q.endQuiz : q.nextQuestion} className="w-full rounded-xl bg-primary py-5 text-xl font-extrabold text-primary-foreground">
                  {q.currentQuestionIndex >= total - 1 ? "Zur Auswertung / Zwischenbildschirm ▶" : "Nächste Frage ▶"}
                </button>
              )}
            </section>
          </>
        )}

        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">Teams</h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <span>Punktestand auf Beamer anzeigen:</span>
              <button onClick={() => q.setShowScores(!q.showScores)} className={`rounded-full px-3 py-1 font-bold ${q.showScores ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{q.showScores ? "An" : "Aus"}</button>
            </label>
          </div>
          <div className="space-y-2">
            {q.teams.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary px-3 py-2">
                <input value={t.name} onChange={(e) => q.renameTeam(t.id, e.target.value)} onBlur={(e) => q.room && e.target.value.trim() && rename({ data: { code: q.room.code, id: t.id, name: e.target.value.trim() } })} aria-label="Teamname" className="min-w-0 flex-1 rounded-md bg-background px-2 py-1 font-semibold" />
                <span className="w-12 text-center font-mono text-lg">{t.score}</span>
                {t.lastDelta ? (<>
                  <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${t.lastDelta > 0 ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>{t.lastDelta > 0 ? `+${t.lastDelta}` : t.lastDelta}</span>
                  <button onClick={() => q.undoScore(t.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted">↩ Rückgängig</button>
                </>) : null}
                {[-1, 1, 2, 5].map((d) => (
                  <button key={d} onClick={() => q.adjustScore(t.id, d)} className={`h-8 w-10 rounded-md text-sm font-bold ${d < 0 ? "bg-muted" : "bg-primary text-primary-foreground"}`}>{d > 0 ? `+${d}` : d}</button>
                ))}
                {question && q.status === "running" && pts > 0 && (
                  <button onClick={() => q.adjustScore(t.id, pts)} className="h-8 rounded-md bg-accent px-3 text-sm font-extrabold text-accent-foreground shadow-glow">+{pts} Pkt</button>
                )}
                <button onClick={() => { q.removeTeam(t.id); if (q.room) kick({ data: { code: q.room.code, id: t.id } }); }} aria-label="Team entfernen" className="rounded-md p-2 text-destructive hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {q.room && q.teams.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Teams beigetreten – die Teams erscheinen hier live.</p>}
          {!q.room && <button onClick={() => q.addTeam(`Team ${q.teams.length + 1}`)} className="mt-3 flex items-center gap-1 rounded-lg bg-secondary px-4 py-2 font-semibold hover:bg-muted"><Plus className="h-4 w-4" /> Neues Team</button>}
        </section>
      </div>
    </main>
  );
}
