import type { QuizQuestion } from "@/types/quiz";
import { choiceOptions } from "@/lib/quizPresentation";

/** Live-determined solution for party modes (no predefined answer in the package). */
export type PartySolution = { qIndex: number; options?: string[]; cells?: string[]; value?: number };
type PartyAnswer = { team_id: string; answer: { option?: string; value?: number; cell?: string } };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function partyMode(q: QuizQuestion | undefined): string | null {
  if (!q) return null;
  const m = (q.type === "choice" || q.type === "grid_coords" || q.type === "slider") ? q.scoring?.mode : undefined;
  return m === "majority_wins" || m === "minority_wins" || m === "host_decides" || m === "average_closest_wins" ? m : null;
}
export const isHostDecides = (q: QuizQuestion | undefined) => partyMode(q) === "host_decides";

/** Values with the most (majority) or fewest-but-at-least-one (minority) votes; ties all win. */
export function voteWinners(values: string[], mode: "majority_wins" | "minority_wins"): string[] {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  if (!counts.size) return [];
  const target = mode === "majority_wins" ? Math.max(...counts.values()) : Math.min(...counts.values());
  return [...counts].filter(([, c]) => c === target).map(([v]) => v).sort();
}

/** Computes the automatic party solution from team answers (one answer per team). */
export function partySolutionFromAnswers(q: QuizQuestion, qIndex: number, answers: PartyAnswer[]): PartySolution | null {
  const mode = partyMode(q);
  const perTeam = new Map<string, PartyAnswer["answer"]>();
  answers.forEach((a) => { if (!perTeam.has(a.team_id)) perTeam.set(a.team_id, a.answer); });
  const list = [...perTeam.values()];
  if (q.type === "choice" && (mode === "majority_wins" || mode === "minority_wins")) {
    return { qIndex, options: voteWinners(list.map((a) => a.option).filter((o): o is string => !!o), mode) };
  }
  if (q.type === "grid_coords" && (mode === "majority_wins" || mode === "minority_wins")) {
    return { qIndex, cells: voteWinners(list.map((a) => a.cell?.toUpperCase()).filter((c): c is string => !!c), mode) };
  }
  if (q.type === "slider" && mode === "average_closest_wins") {
    const vals = list.map((a) => a.value).filter((v): v is number => typeof v === "number");
    if (!vals.length) return { qIndex };
    return { qIndex, value: vals.reduce((s, v) => s + v, 0) / vals.length };
  }
  return null;
}

/** Returns the question patched with the live solution so stage, phones and scoring agree. */
export function applyPartySolution(q: QuizQuestion, sol: PartySolution | null | undefined, qIndex: number): QuizQuestion {
  const mode = partyMode(q);
  if (!mode || !sol || sol.qIndex !== qIndex) return q;
  const points = (q.type === "choice" || q.type === "grid_coords" || q.type === "slider") ? (q.scoring as { points?: number } | undefined)?.points ?? q.points ?? 0 : 0;
  if (q.type === "choice") {
    const winners = new Set(sol.options ?? []);
    const opts = choiceOptions(q) ?? [];
    return { ...q, options: opts.map((o, i) => ({ ...o, isCorrect: winners.has(LETTERS[i]!) })), scoring: { mode: "fixed", points } };
  }
  if (q.type === "grid_coords") return { ...q, correctCells: sol.cells ?? [], scoring: { mode: "fixed", points } };
  if (q.type === "slider" && typeof sol.value === "number") {
    return { ...q, correctValue: Math.round(sol.value * 100) / 100, scoring: { mode: "closest_wins", points } };
  }
  return q;
}
