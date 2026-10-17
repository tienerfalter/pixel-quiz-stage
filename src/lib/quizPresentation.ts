import type { QuizOption, QuizQuestion, QuizTheme } from "@/types/quiz";

/** New dual-media packages and legacy audio-only packages share one source. */
export function questionAudioSource(question?: QuizQuestion): string | undefined {
  return question?.audio || (question?.mediaType === "audio" ? question.media : undefined);
}

export function resolveQuizTheme(theme: unknown): QuizTheme {
  return theme === "light" || theme === "high-contrast" || theme === "neon" ? theme : "dark";
}

/**
 * Deterministic mixed order for sorting questions, derived from the question id:
 * stage and every phone render the same mixed order, never the solution order.
 */
export function sortingMixedOrder(options: QuizOption[], correctOrder: string[], seedKey: string): string[] {
  const ids = options.map((o) => o.id);
  if (ids.length < 2) return ids;
  const solution = correctOrder.length === ids.length ? correctOrder : ids;
  let seed = 2166136261;
  for (const ch of seedKey) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const shuffled = [...ids];
    let rng = (seed + Math.imul(attempt + 1, 2654435761)) >>> 0;
    for (let i = shuffled.length - 1; i > 0; i--) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const j = rng % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (!shuffled.every((id, i) => id === solution[i])) return shuffled;
  }
  const first = ids[0];
  return first ? [...ids.slice(1), first] : ids;
}