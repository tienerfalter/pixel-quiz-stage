import { useEffect, useRef } from "react";
import { Lock, Volume2 } from "lucide-react";
import { useQuiz } from "@/context/QuizContext";
import type { QuizQuestion } from "@/types/quiz";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Years (unit "Jahr" or 1000–2100) are never formatted with thousands separators. */
function fmtNum(v: number, unit?: string) {
  const isYear = /^jahr/i.test(unit ?? "") || (Number.isInteger(v) && v >= 1000 && v <= 2100);
  return isYear ? String(v) : v.toLocaleString("de-DE");
}

function SolutionBox({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <div className="shadow-glow relative z-30 mt-10 rounded-3xl border-4 border-success bg-success/20 px-12 py-8 animate-in fade-in zoom-in duration-700">
      <p className="text-6xl font-extrabold">{text}</p>
    </div>
  );
}

function SolutionBanner({ notes }: { notes?: QuizQuestion["hostNotes"] }) {
  return (
    <div className="stage-solution-banner relative z-30 w-full rounded-xl border-2 border-success bg-success/20 px-6 py-3 text-center motion-safe:animate-in motion-safe:fade-in duration-500">
      <p className="text-3xl font-extrabold leading-tight">{notes?.solution || ""}</p>
      {notes?.trivia && <p className="mt-2 text-lg leading-snug text-muted-foreground">{notes.trivia}</p>}
    </div>
  );
}

export function StageQuestion({ question }: { question: QuizQuestion }) {
  const { phase } = useQuiz();
  const resolved = phase === "resolved";
  switch (question.type) {
    case "choice":
      return (
        <div className="mt-10 grid w-full max-w-6xl grid-cols-2 gap-6">
          {question.options.map((o, i) => (
            <div key={o.id} className={`flex items-center gap-5 rounded-2xl border-2 px-8 py-6 text-left backdrop-blur transition-all duration-700 ${
              !resolved ? "border-primary/40 bg-card/80" : o.isCorrect ? "animate-pulse border-success bg-success/30 scale-105" : "border-border bg-card/40 opacity-30"}`}>
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-extrabold text-primary-foreground">{LETTERS[i]}</span>
              <span className="text-4xl font-bold">{o.text}</span>
            </div>
          ))}
        </div>
      );
    case "slider": {
      const { min, max, unit } = question.sliderConfig;
      return (
        <div className="mt-14 w-full max-w-5xl">
          <div className="relative h-4 rounded-full bg-gradient-to-r from-secondary via-primary/70 to-primary">
            {resolved && (
              <div className="absolute -top-16 flex -translate-x-1/2 flex-col items-center animate-in fade-in zoom-in duration-700"
                style={{ left: `${Math.max(0, Math.min(100, ((question.correctValue - min) / (max - min)) * 100))}%` }}>
                <span className="rounded-lg bg-success px-3 py-1 font-mono text-2xl font-bold text-success-foreground">{fmtNum(question.correctValue, unit)} {unit}</span>
                <span className="h-14 w-1.5 rounded-full bg-success" />
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-between font-mono text-4xl font-bold">
            <span>{fmtNum(min, unit)} {unit}</span>
            <span className="text-2xl text-muted-foreground self-center">Schätzt!</span>
            <span>{fmtNum(max, unit)} {unit}</span>
          </div>
        </div>
      );
    }
    case "clue_ladder":
      return <ClueLadder question={question} />;
    case "mosaic":
      return <Mosaic question={question} />;
    case "grid_coords":
      return <GridCoords question={question} />;
    default:
      return (
        <>
          <DefaultMedia question={question} />
          {resolved && <SolutionBox text={question.hostNotes?.solution} />}
        </>
      );
  }
}

function DefaultMedia({ question }: { question: QuizQuestion }) {
  if (question.mediaType === "audio" && question.media) return <AudioStage src={question.media} />;
  if (!question.media) return null;
  return (
    <img src={question.media} alt="" className="mt-10 max-h-[55vh] w-auto max-w-3xl rounded-2xl object-contain" />
  );
}

function AudioStage({ src }: { src: string }) {
  const { audio } = useQuiz();
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (audio.playing) el.play().catch(() => {});
    else el.pause();
  }, [audio.playing]);
  useEffect(() => { if (ref.current) ref.current.volume = audio.volume; }, [audio.volume]);
  useEffect(() => {
    if (!ref.current || audio.restartSeq === 0) return;
    ref.current.currentTime = 0;
    ref.current.play().catch(() => {});
  }, [audio.restartSeq]);

  return (
    <div className="mt-12 flex flex-col items-center gap-8">
      <audio ref={ref} src={src} preload="auto" />
      <div className={`relative flex h-40 w-40 items-center justify-center rounded-full bg-primary/15 ${audio.playing ? "shadow-glow" : ""}`}>
        {audio.playing && <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />}
        <Volume2 className="h-20 w-20 text-primary" />
      </div>
      <div className="flex h-24 items-end gap-2">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="w-3 rounded-full bg-primary/80 transition-all"
            style={{
              height: audio.playing ? `${30 + ((i * 37) % 70)}%` : "12%",
              animation: audio.playing ? `pulse ${0.6 + (i % 5) * 0.15}s ease-in-out infinite alternate` : undefined,
            }} />
        ))}
      </div>
    </div>
  );
}

function ClueLadder({ question }: { question: Extract<QuizQuestion, { type: "clue_ladder" }> }) {
  const { revealedClues: rc, phase } = useQuiz();
  const clues = question.clues ?? [];
  const ppl = question.pointsPerLevel ?? [];
  const revealedClues = phase === "resolved" ? clues.length : rc;
  const pts = ppl[Math.min(revealedClues, ppl.length) - 1] ?? question.points;
  return (
    <div className={`w-full max-w-5xl ${phase === "resolved" ? "mt-4" : "mt-8"}`}>
      {phase === "resolved" ? <div className="mb-3"><SolutionBanner notes={{ solution: question.hostNotes?.solution ?? "" }} /></div>
        : <p className="mb-6 text-3xl font-bold">Aktuelle Stufe: <span className="text-primary">{pts} Punkte</span></p>}
      <div className={phase === "resolved" ? "space-y-2" : "space-y-3"}>
        {clues.map((c, i) => {
          const open = i < revealedClues;
          return (
            <div key={i} className={`flex items-center gap-5 rounded-2xl border px-6 text-left transition-all duration-500 ${phase === "resolved" ? "stage-resolved-clue py-2" : "py-4"} ${open ? "border-primary/50 bg-card/90" : "bg-card/30"}`}>
              <span className={`font-mono font-bold text-primary ${phase === "resolved" ? "text-xl" : "text-2xl"}`}>{i + 1}</span>
              {open ? <span className={`font-semibold animate-in fade-in slide-in-from-left-4 ${phase === "resolved" ? "text-xl leading-snug" : "text-2xl"}`}>{c}</span>
                : <span className="flex items-center gap-2 text-xl text-muted-foreground"><Lock className="h-5 w-5" /> ???</span>}
              <span className="ml-auto shrink-0 font-mono text-muted-foreground">{ppl[i] ?? "–"} P</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Mosaic({ question }: { question: Extract<QuizQuestion, { type: "mosaic" }> }) {
  const { revealedTiles: rt, phase } = useQuiz();
  const rows = question.grid?.rows || 4;
  const cols = question.grid?.cols || 4;
  const total = rows * cols;
  const revealedTiles = phase === "resolved" ? Array.from({ length: total }, (_, i) => i) : rt;
  const percent = Math.round((revealedTiles.length / total) * 100);
  const tier = [...(question.pointsPerTier ?? [])].sort((a, b) => a.maxRevealedPercent - b.maxRevealedPercent)
    .find((t) => percent <= t.maxRevealedPercent);
  return (
    <div className={`relative w-full max-w-5xl ${phase === "resolved" ? "mt-4" : "mt-8"}`}>
      <div className="relative overflow-hidden rounded-2xl">
        <img src={question.media} alt="" className={`block w-full object-contain ${phase === "resolved" ? "stage-resolved-media" : "max-h-[60vh]"}`} />
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: total }).map((_, i) => {
            const open = revealedTiles.includes(i);
            return (
              <div key={i} className={`flex items-center justify-center border border-border bg-secondary font-mono text-muted-foreground transition-all duration-700 ${open ? "scale-125 opacity-0" : "opacity-100"}`}>
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>
      {phase === "resolved" ? <div className="mt-3"><SolutionBanner notes={question.hostNotes} /></div> : <div className="mt-3 flex justify-between text-lg text-muted-foreground">
        <span>{percent}% sichtbar</span>
        <span>Noch erreichbar: <span className="font-bold text-primary">{tier?.points ?? 0} Punkte</span></span>
      </div>}
    </div>
  );
}

function GridCoords({ question }: { question: Extract<QuizQuestion, { type: "grid_coords" }> }) {
  const { phase } = useQuiz();
  const resolved = phase === "resolved";
  const rows = question.grid?.rows || 6;
  const cols = question.grid?.cols || 6;
  const correctCells = new Set((question.correctCells ?? []).map((cell) => cell.trim().toUpperCase()));
  return (
    <div className={`flex max-w-5xl flex-col items-center ${resolved ? "mt-4 gap-3" : "mt-8"}`}>
    <div className="inline-grid max-w-full" style={{ gridTemplateColumns: `2rem minmax(0, auto)` }}>
      <span />
      <div className="grid text-center font-mono text-xl text-primary" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, c) => <span key={c}>{LETTERS[c]}</span>)}
      </div>
      <div className="grid font-mono text-xl text-primary" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {Array.from({ length: rows }).map((_, r) => <span key={r} className="flex items-center">{r + 1}</span>)}
      </div>
      <div className="relative">
        <img src={question.media} alt="" className={`block max-w-full rounded-xl object-contain ${resolved ? "stage-resolved-media" : "max-h-[60vh]"}`} />
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
          {Array.from({ length: rows * cols }).map((_, i) => {
            const cell = `${LETTERS[i % cols]}${Math.floor(i / cols) + 1}`;
            const correct = resolved && correctCells.has(cell);
            return <div key={i} aria-label={correct ? `Zielzone ${cell}` : undefined} className={`flex items-center justify-center transition-colors duration-500 ${correct ? "border-4 border-success bg-success/35" : "border border-foreground/20"}`}>
              {correct && <span className="rounded bg-success px-1 font-mono text-lg font-bold text-success-foreground">{cell}</span>}
            </div>;
          })}
        </div>
      </div>
    </div>
    {resolved && <SolutionBanner notes={{ solution: question.hostNotes?.solution ?? "" }} />}
    </div>
  );
}
