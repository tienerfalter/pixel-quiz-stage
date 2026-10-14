import type { QuizQuestion } from "@/types/quiz";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type ScoredAnswer = { team_id: string; answer: { option?: string; value?: number; cell?: string }; created_at: string };

/** Points the current round is worth right now (mosaic/clue ladder depend on reveal progress). */
export function roundPoints(q: QuizQuestion, revealedTiles = 0, revealedClues = 1): number {
  if (q.type === "mosaic") {
    const total = (q.grid?.rows || 4) * (q.grid?.cols || 4);
    const pct = total ? (revealedTiles / total) * 100 : 0;
    const tiers = [...(q.pointsPerTier ?? [])].sort((a, b) => a.maxRevealedPercent - b.maxRevealedPercent);
    return tiers.find((t) => pct <= t.maxRevealedPercent)?.points ?? tiers.at(-1)?.points ?? q.points ?? 0;
  }
  if (q.type === "clue_ladder" && q.pointsPerLevel?.length) {
    return q.pointsPerLevel[Math.min(q.pointsPerLevel.length, Math.max(1, revealedClues)) - 1] ?? q.points ?? 0;
  }
  return q.points ?? 0;
}

/** Computes point awards per team for answer-based questions at resolution time. */
export function computeAwards(q: QuizQuestion, answers: ScoredAnswer[], revealedClues = 1): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = [...answers].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const opts = q.type === "choice" || (q.type === "clue_ladder" && q.inputMode === "choice") ? q.options ?? [] : null;
  if (opts) {
    const idx = opts.findIndex((o) => o.isCorrect);
    const correct = sorted.filter((a) => idx >= 0 && a.answer.option === LETTERS[idx]);
    const pts = roundPoints(q, 0, revealedClues);
    correct.forEach((a, rank) => {
      // Speed bonus: each later correct team adds one bonus point to the faster ones.
      const bonus = q.type === "choice" && q.scoringMode === "speed_bonus" ? correct.length - rank - 1 : 0;
      out[a.team_id] = pts + bonus;
    });
  } else if (q.type === "grid_coords") {
    const cells = (q.correctCells ?? []).map((c) => c.toUpperCase());
    sorted.forEach((a) => { if (cells.includes((a.answer.cell ?? "").toUpperCase())) out[a.team_id] = q.points ?? 0; });
  } else if (q.type === "slider") {
    const withDiff = sorted.filter((a) => typeof a.answer.value === "number").map((a) => ({ id: a.team_id, d: Math.abs(a.answer.value! - q.correctValue) }));
    if (q.scoring?.mode === "tolerance_tiers" && q.scoring.tiers?.length) {
      const tiers = [...q.scoring.tiers].sort((a, b) => a.tolerance - b.tolerance);
      withDiff.forEach(({ id, d }) => { const t = tiers.find((t) => d <= t.tolerance); if (t) out[id] = t.points; });
    } else if (withDiff.length) {
      const best = Math.min(...withDiff.map((x) => x.d));
      withDiff.filter((x) => x.d === best).forEach(({ id }) => { out[id] = q.scoring?.points ?? q.points ?? 0; });
    }
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
