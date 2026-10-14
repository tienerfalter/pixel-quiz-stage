import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deviationText, fmtValue } from "@/lib/units";
import { choiceRanking, isRankBonus, roundPoints, type ChoiceRank, type ScoredAnswer } from "@/lib/scoring";
import type { QuizOption, QuizQuestion } from "@/types/quiz";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type PadAnswer = { option?: string; value?: number; cell?: string };

/** Options shown as tiles for a question, or null when it isn't a tile question. */
export function choiceOptions(q: QuizQuestion): QuizOption[] | null {
  if (q.type === "choice") return q.options ?? [];
  if (q.type === "clue_ladder" && q.inputMode === "choice") return q.options ?? [];
  return null;
}

/** True when the phone shows an input form instead of the buzzer. */
export function needsInput(q: QuizQuestion) {
  return !!choiceOptions(q) || q.type === "slider" || q.type === "grid_coords";
}


function feedback(q: QuizQuestion, a: PadAnswer, auto: boolean, mine?: ChoiceRank | null): { ok: boolean | null; text: string } {
  const pts = roundPoints(q, 0, q.type === "clue_ladder" ? 99 : 1);
  const win = (head: string) => (auto && pts > 0 ? `${head} +${pts} Punkte` : "Richtig gelöst! Der Quizmaster vergibt die Punkte.");
  const opts = choiceOptions(q);
  if (opts) {
    const idx = opts.findIndex((o) => o.isCorrect);
    const ok = idx >= 0 && a.option === LETTERS[idx];
    if (ok && auto && q.type === "choice" && q.scoring && mine) {
      return { ok, text: isRankBonus(q) ? `Richtig! Platz ${mine.rank} – du erhältst ${mine.points} Punkte!` : `Richtig! +${mine.points} Punkte!` };
    }
    return { ok, text: ok ? win("Richtig!") : idx >= 0 ? `Leider falsch – richtig war ${LETTERS[idx]}` : "Ausgewertet" };
  }
  if (q.type === "grid_coords") {
    const ok = (q.correctCells ?? []).map((c) => c.toUpperCase()).includes(a.cell ?? "");
    if (ok && auto && q.scoring && mine) return { ok, text: isRankBonus(q) ? `Volltreffer! Platz ${mine.rank} – du erhältst ${mine.points} Punkte!` : `Volltreffer! +${mine.points} Punkte!` };
    return { ok, text: ok ? win("Volltreffer!") : `Daneben – Ziel: ${(q.correctCells ?? []).join(", ")}` };
  }
  if (q.type === "slider" && a.value !== undefined) {
    const diff = Math.abs(a.value - q.correctValue);
    return { ok: diff === 0, text: diff === 0 ? `Punktlandung! Lösung: ${fmtValue(q.correctValue, q.sliderConfig?.unit)}` : `Lösung: ${fmtValue(q.correctValue, q.sliderConfig?.unit)} · ${deviationText(diff, q.sliderConfig?.unit, q.sliderConfig?.unitPlural)}` };
  }
  return { ok: null, text: "" };
}

export function AnswerPad({ question, qIndex, phase, code, teamId, autoScoring = true }: {
  question: QuizQuestion; qIndex: number; phase: string; code: string; teamId: string; autoScoring?: boolean;
}) {
  const [saved, setSaved] = useState<PadAnswer | null>(null);
  const [draft, setDraft] = useState<PadAnswer>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("room_answers").select("answer").eq("team_id", teamId).eq("question_index", qIndex).maybeSingle()
      .then(({ data }) => data && setSaved(data.answer as PadAnswer));
  }, [teamId, qIndex]);

  const [mine, setMine] = useState<ChoiceRank | null>(null);
  useEffect(() => {
    if (phase !== "resolved" || question.type !== "choice" && question.type !== "grid_coords") return;
    supabase.from("room_answers").select("team_id,answer,created_at").eq("room_code", code).eq("question_index", qIndex)
      .then(({ data }) => setMine(choiceRanking(question, (data ?? []) as ScoredAnswer[]).find((r) => r.team_id === teamId) ?? null));
  }, [phase, question, code, qIndex, teamId]);

  const active = phase === "guessing" && !saved;
  const shown = saved ?? draft;

  async function submit(a: PadAnswer) {
    if (!active || busy) return;
    setBusy(true);
    setErr(null);
    navigator.vibrate?.(50);
    const { error } = await supabase.rpc("submit_answer", { _room: code, _team: teamId, _question: qIndex, _answer: a });
    setBusy(false);
    if (error) setErr(error.message.includes("gesperrt") ? "Zeit ist um!" : "Senden fehlgeschlagen.");
    else setSaved(a);
  }

  const opts = choiceOptions(question);
  let input;
  if (opts) {
    input = (
      <div className="space-y-3">
        {opts.slice(0, 4).map((o, i) => {
          const l = LETTERS[i]!;
          const picked = shown.option === l;
          const dim = (saved || !active) && !picked;
          return (
            <button key={o.id ?? l} disabled={!active || busy} onClick={() => submit({ option: l })}
              className={`flex w-full touch-manipulation items-center gap-4 rounded-2xl border-2 p-5 text-left text-xl font-bold transition active:scale-[0.98] ${picked ? "border-primary bg-primary text-primary-foreground shadow-glow" : "bg-card"} ${dim ? "opacity-35" : ""}`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-foreground">{l}</span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>
    );
  } else if (question.type === "slider") {
    const { min = 0, max = 100, step = 1, unit } = question.sliderConfig ?? {};
    const v = shown.value ?? Math.round((min + max) / 2 / step) * step;
    input = (
      <div className="space-y-6 rounded-3xl border bg-card/80 p-6">
        <p className="font-mono text-5xl font-extrabold text-primary">{fmtValue(v, unit)}</p>
        <input type="range" min={min} max={max} step={step} value={v} disabled={!active}
          onChange={(e) => setDraft({ value: Number(e.target.value) })}
          className="h-10 w-full touch-manipulation accent-primary" aria-label="Schätzwert" />
        <div className="flex justify-between text-sm text-muted-foreground"><span>{fmtValue(min, unit)}</span><span>{fmtValue(max, unit)}</span></div>
        {!saved && <button disabled={!active || busy} onClick={() => submit({ value: v })} className="w-full rounded-xl bg-primary py-4 text-xl font-extrabold text-primary-foreground disabled:opacity-40">Schätzung einloggen</button>}
      </div>
    );
  } else if (question.type === "grid_coords") {
    const rows = question.grid?.rows || 6;
    const cols = question.grid?.cols || 6;
    input = (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-xl">
          {question.media && <img src={question.media} alt="" className="block w-full" />}
          <div className={`grid ${question.media ? "absolute inset-0" : "aspect-square"}`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {Array.from({ length: rows * cols }).map((_, i) => {
              const cell = `${LETTERS[i % cols]}${Math.floor(i / cols) + 1}`;
              const picked = shown.cell === cell;
              return (
                <button key={cell} disabled={!active} onClick={() => setDraft({ cell })} aria-label={cell}
                  className={`flex touch-manipulation items-center justify-center border border-foreground/25 text-xs font-bold ${picked ? "bg-accent/70 text-accent-foreground" : ""}`}>
                  {picked ? `📍${cell}` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <p className="font-mono text-3xl font-extrabold text-primary">{shown.cell ?? "Tippe auf eine Zelle"}</p>
        {!saved && <button disabled={!active || busy || !draft.cell} onClick={() => submit({ cell: draft.cell! })} className="w-full rounded-xl bg-primary py-4 text-xl font-extrabold text-primary-foreground disabled:opacity-40">Koordinate absenden</button>}
      </div>
    );
  }

  let status: React.ReactNode = null;
  if (phase === "resolved") {
    if (saved) {
      const f = feedback(question, saved, autoScoring, mine);
      status = <div className={`rounded-2xl p-4 text-lg font-bold ${f.ok === true ? "bg-success text-success-foreground" : f.ok === false ? "bg-destructive text-destructive-foreground" : "bg-card"}`}>{f.text}</div>;
    } else status = <div className="rounded-2xl bg-card p-4 font-bold">Keine Antwort abgegeben</div>;
  } else if (phase === "locked") {
    status = <div className="rounded-2xl bg-destructive/20 p-4 text-lg font-bold">Die Zeit ist um! Schau auf den Beamer.</div>;
  } else if (saved) {
    status = <div className="rounded-2xl bg-success/20 p-4 text-lg font-bold">Eingabe gespeichert! Warten auf Auswertung…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-lg font-semibold">{question.question}</p>
      {status}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {input}
    </div>
  );
}
