import { describe, expect, it } from "vitest";
import { podiumTeams, rankTeams } from "@/lib/teamRanking";

const teams = [
  { id: "a", name: "Rot", score: 20 },
  { id: "b", name: "Blau", score: 20 },
  { id: "c", name: "Grün", score: 10 },
  { id: "d", name: "Gelb", score: 10 },
  { id: "e", name: "Weiß", score: 0 },
];

describe("overall team competition ranking", () => {
  it("gives exactly equal scores the same rank, skipping occupied places", () => {
    const ranks = Object.fromEntries(rankTeams(teams).map((t) => [t.id, t.rank]));
    expect(ranks).toEqual({ a: 1, b: 1, c: 3, d: 3, e: 5 });
  });
  it("is identical on stage and phone regardless of incoming array order", () => {
    expect(rankTeams([...teams].reverse())).toEqual(rankTeams(teams));
    expect(teams.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("includes all teams tied for a podium place with the same overall ranks", () => {
    expect(podiumTeams(teams).map((t) => [t.id, t.rank])).toEqual([
      ["b", 1], ["a", 1], ["d", 3], ["c", 3],
    ]);
  });
  it("handles an all-team tie without excluding winners", () => {
    expect(podiumTeams(teams.map((t) => ({ ...t, score: 0 }))).map((t) => t.rank)).toEqual([1, 1, 1, 1, 1]);
  });
  it("handles empty lists and unequal or negative scores", () => {
    expect(rankTeams([])).toEqual([]);
    expect(rankTeams([{ id: "a", name: "A", score: -1 }, { id: "b", name: "B", score: 0 }]).map((t) => [t.id, t.rank])).toEqual([["b", 1], ["a", 2]]);
  });
});