import { describe, expect, it } from "vitest";
import { applyPartySolution, partySolutionFromAnswers } from "@/lib/partyModes";
import { computeAwards } from "@/lib/scoring";
import type { QuizQuestion } from "@/types/quiz";

const t = { hasTimer: false, timeLimitSeconds: 0, onTimeUpAction: "lock_and_wait" as const };
const ans = (team: string, answer: object) => ({ team_id: team, answer, created_at: `2026-01-01T00:00:0${team.length}Z` });
const choice = (mode: string): QuizQuestion => ({ id: "c", type: "choice", title: "", question: "", timing: t, points: 0,
  options: ["a", "b", "c", "d"].map((id) => ({ id, text: id })), scoring: { mode, points: 3 } as never });
const award = (q: QuizQuestion, a: ReturnType<typeof ans>[]) =>
  computeAwards(applyPartySolution(q, partySolutionFromAnswers(q, 0, a), 0), a);

describe("Party-Modi", () => {
  const votes = [ans("t1", { option: "A" }), ans("t2", { option: "A" }), ans("t3", { option: "B" }), ans("t4", { option: "B" }), ans("t5", { option: "C" })];
  it("majority_wins: Gleichstand an der Spitze – beide Optionen gewinnen", () => {
    expect(award(choice("majority_wins"), votes)).toEqual({ t1: 3, t2: 3, t3: 3, t4: 3 });
  });
  it("minority_wins: seltenste gewählte Option gewinnt", () => {
    expect(award(choice("minority_wins"), votes)).toEqual({ t5: 3 });
  });
  it("host_decides: Host-Wahl setzt die Lösung", () => {
    const q = choice("host_decides");
    expect(computeAwards(applyPartySolution(q, { qIndex: 0, options: ["B"] }, 0), votes)).toEqual({ t3: 3, t4: 3 });
  });
  const grid: QuizQuestion = { id: "g", type: "grid_coords", title: "", question: "", timing: t, points: 2, media: "", grid: { rows: 2, cols: 2 }, correctCells: [], scoring: { mode: "minority_wins", points: 2 } };
  it("grid minority_wins: seltenstes Feld gewinnt (inklusiv)", () => {
    const a = [ans("t1", { cell: "A1" }), ans("t2", { cell: "A1" }), ans("t3", { cell: "B2" }), ans("t4", { cell: "B1" })];
    expect(award(grid, a)).toEqual({ t3: 2, t4: 2 });
  });
  const slider = (mode: string): QuizQuestion => ({ id: "s", type: "slider", title: "", question: "", timing: t, points: 0, sliderConfig: { min: 0, max: 100 }, correctValue: 0, scoring: { mode, points: 4 } as never });
  it("average_closest_wins: am nächsten am Durchschnitt", () => {
    const a = [ans("t1", { value: 10 }), ans("t2", { value: 20 }), ans("t3", { value: 60 })]; // Ø 30
    expect(award(slider("average_closest_wins"), a)).toEqual({ t2: 4 });
  });
  it("slider host_decides: am nächsten an der Host-Zahl", () => {
    const a = [ans("t1", { value: 10 }), ans("t2", { value: 50 })];
    expect(computeAwards(applyPartySolution(slider("host_decides"), { qIndex: 0, value: 45 }, 0), a)).toEqual({ t2: 4 });
  });
});
