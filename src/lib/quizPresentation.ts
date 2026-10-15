import type { QuizQuestion, QuizTheme } from "@/types/quiz";

/** New dual-media packages and legacy audio-only packages share one source. */
export function questionAudioSource(question?: QuizQuestion): string | undefined {
  return question?.audio || (question?.mediaType === "audio" ? question.media : undefined);
}

export function resolveQuizTheme(theme: unknown): QuizTheme {
  return theme === "light" || theme === "high-contrast" || theme === "neon" ? theme : "dark";
}