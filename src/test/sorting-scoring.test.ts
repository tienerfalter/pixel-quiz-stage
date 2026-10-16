import { describe, expect, it } from "vitest";
import { computeAwards } from "@/lib/scoring";
import type { QuizQuestion } from "@/types/quiz";

const base = { id: "s", title: "S", question: "Sortiere", points: 2, timing: { hasTimer: false, timeLimitSeconds: 0, onTimeUpAction: "lock_and_wait" as const },
  options: [{ id: "A", text: "Mittelalter" }, { id: "B", text: "Neuzeit" }, { id: "C", text: "Antike" }], correctOrder: ["C", "A", "B"] };
const answers = [
  { team_id: "late", answer: { order: ["C", "A", "B"] }, created_at: "2026-01-01T00:00:03Z" },
  { team_id: "partial", answer: { order: ["C", "B", "A"] }, created_at: "2026-01-01T00:00:01Z" },
  { team_id: "first", answer: { order: ["C", "A", "B"] }, created_at: "2026-01-01T00:00:02Z" },
];

describe("Sortieraufgabe", () => {
  it("rank_bonus: schnellste richtige Reihenfolge bekommt am meisten, teilweise richtig 0", () => {
    const q = { ...base, type: "sorting", scoring: { mode: "rank_bonus", pointsByRank: [5, 4, 3] } } as QuizQuestion;
    expect(computeAwards(q, answers)).toEqual({ first: 5, late: 4 });
  });
  it("fixed: feste Punkte für exakt richtige Reihenfolge", () => {
    const q = { ...base, type: "sorting", scoring: { mode: "fixed", points: 3 } } as QuizQuestion;
    expect(computeAwards(q, answers)).toEqual({ first: 3, late: 3 });
  });
});
