import type { Phase, QuizOption, QuizQuestion, QuizTheme } from "@/types/quiz";

export function questionImageSource(question: QuizQuestion, phase: Phase): string | undefined {
  if (phase === "resolved" && question.resolutionMedia) return question.resolutionMedia;
  return question.mediaType !== "audio" ? question.media : undefined;
}

export function choiceOptions(q: QuizQuestion): QuizOption[] | null {
  if (q.type === "choice" || ((q.type === "clue_ladder" || q.type === "mosaic") && q.inputMode === "choice")) return q.options ?? [];
  return null;
}

export function correctChoiceLetter(q: QuizQuestion): string | undefined {
  const options = choiceOptions(q);
  if (!options) return undefined;
  if (q.type === "mosaic" && q.correctOption) {
    const idIndex = options.findIndex((o) => o.id === q.correctOption);
    if (idIndex >= 0) return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[idIndex];
    const letter = q.correctOption.toUpperCase();
    if (/^[A-D]$/.test(letter) && options[letter.charCodeAt(0) - 65]) return letter;
    return undefined;
  }
  const index = options.findIndex((o) => o.isCorrect);
  return index >= 0 ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[index] : undefined;
}

/** All correct letters (party modes may have several winning options). */
export function correctChoiceLetters(q: QuizQuestion): string[] {
  const options = choiceOptions(q);
  if (!options) return [];
  if (q.type === "mosaic") { const l = correctChoiceLetter(q); return l ? [l] : []; }
  return options.flatMap((o, i) => (o.isCorrect ? ["ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i]!] : []));
}

export function allActiveTeamsAnswered(teamIds: string[], answers: { team_id: string }[]): boolean {
  const submitted = new Set(answers.map((a) => a.team_id));
  return teamIds.length > 0 && teamIds.every((id) => submitted.has(id));
}

export function pauseTitle(title?: string): string {
  return title?.replace(/^\s*⏸\uFE0F?\s*/, "").trim() || "Kurze Pause";
}

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
      const a = shuffled[i];
      const b = shuffled[j];
      if (a === undefined || b === undefined) continue;
      shuffled[i] = b;
      shuffled[j] = a;
    }
    if (!shuffled.every((id, i) => id === solution[i])) return shuffled;
  }
  const first = ids[0];
  return first ? [...ids.slice(1), first] : ids;
}