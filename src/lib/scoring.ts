import type { QuizQuestion } from "@/types/quiz";
import { choiceOptions, correctChoiceLetter } from "@/lib/quizPresentation";

export type ScoredAnswer = { team_id: string; answer: { option?: string; value?: number; cell?: string; order?: string[]; submittedAt?: string }; created_at: string };

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

export type ChoiceRank = { team_id: string; rank: number; points: number };

/** Correct choice answers ordered by submission time, with rank and integer points. */
export function choiceRanking(q: QuizQuestion, answers: ScoredAnswer[], revealedClues = 1, revealedTiles = 0): ChoiceRank[] {
  const sorted = [...answers].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let correct: ScoredAnswer[];
  if (q.type === "sorting") {
    const want = q.correctOrder.join("|");
    correct = sorted.filter((a) => (a.answer.order ?? []).join("|") === want);
  } else if (q.type === "grid_coords") {
    const cells = (q.correctCells ?? []).map((c) => c.toUpperCase());
    correct = sorted.filter((a) => cells.includes((a.answer.cell ?? "").toUpperCase()));
  } else {
    const letter = correctChoiceLetter(q);
    if (!letter) return [];
    correct = sorted.filter((a) => a.answer.option === letter);
  }
  const sc = q.type === "choice" || q.type === "grid_coords" || q.type === "sorting" ? q.scoring : undefined;
  return correct.map((a, i) => {
    let points: number;
    if (sc?.mode === "rank_bonus") points = sc.pointsByRank?.[i] ?? sc.fallbackPoints ?? 1;
    else if (sc?.mode === "fixed") points = sc.points;
    else if (q.type === "choice" && q.scoringMode === "speed_bonus") points = (q.points ?? 0) + correct.length - i - 1;
    else points = roundPoints(q, revealedTiles, revealedClues);
    return { team_id: a.team_id, rank: i + 1, points: Math.round(points) };
  });
}

export const isRankBonus = (q: QuizQuestion) => (q.type === "choice" || q.type === "grid_coords" || q.type === "sorting") && q.scoring?.mode === "rank_bonus";

/** Computes point awards per team for answer-based questions at resolution time. */
export function computeAwards(q: QuizQuestion, answers: ScoredAnswer[], revealedClues = 1, revealedTiles = 0): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = [...answers].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const opts = choiceOptions(q);
  if (opts) {
    choiceRanking(q, answers, revealedClues, revealedTiles).forEach((r) => { out[r.team_id] = r.points; });
  } else if (q.type === "grid_coords" || q.type === "sorting") {
    choiceRanking(q, answers).forEach((r) => { out[r.team_id] = r.points; });
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
