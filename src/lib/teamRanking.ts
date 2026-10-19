import type { Team } from "@/types/quiz";

export type RankedTeam = Team & { rank: number };

/** Standard competition ranking: 1, 1, 3; tied teams never depend on array order. */
export function rankTeams(teams: readonly Team[]): RankedTeam[] {
  const sorted = [...teams].sort((a, b) =>
    b.score - a.score || a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id),
  );
  let rank = 0;
  let previousScore: number | undefined;
  return sorted.map((team, index) => {
    if (index === 0 || team.score !== previousScore) rank = index + 1;
    previousScore = team.score;
    return { ...team, rank };
  });
}

/** Include every team sharing a podium place, not just the first three entries. */
export function podiumTeams(teams: readonly Team[]): RankedTeam[] {
  return rankTeams(teams).filter((team) => team.rank <= 3);
}