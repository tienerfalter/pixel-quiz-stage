import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { questionAudioSource, resolveQuizTheme, sortingMixedOrder } from "@/lib/quizPresentation";
import { loadQuizPackage } from "@/utils/quizPackageLoader";
import type { QuizOption, QuizQuestion } from "@/types/quiz";

const options: QuizOption[] = [
  { id: "a", text: "Erster" },
  { id: "b", text: "Zweiter" },
  { id: "c", text: "Dritter" },
  { id: "d", text: "Vierter" },
  { id: "e", text: "Fünfter" },
];

const question: QuizQuestion = {
  id: "dual", type: "buzzer", title: "Bild und Ton", question: "Was ist zu hören?",
  points: 3, onWrongAnswer: "allow_others",
  timing: { hasTimer: true, timeLimitSeconds: 30, onTimeUpAction: "lock_and_wait" },
  media: "assets/image.png", audio: "assets/sound.mp3",
};

afterEach(() => vi.unstubAllGlobals());

describe("Quiz package presentation", () => {
  it("supports simultaneous image and sound and legacy audio sources", () => {
    expect(questionAudioSource(question)).toBe("assets/sound.mp3");
    const { audio: _audio, ...imageQuestion } = question;
    expect(questionAudioSource({ ...imageQuestion, mediaType: "audio", media: "old.mp3" })).toBe("old.mp3");
    expect(questionAudioSource(imageQuestion)).toBeUndefined();
  });

  it.each(["dark", "light", "high-contrast", "neon"])("accepts the %s theme", (theme) => {
    expect(resolveQuizTheme(theme)).toBe(theme);
  });

  it("defaults unknown and missing themes to dark", () => {
    expect(resolveQuizTheme(undefined)).toBe("dark");
    expect(resolveQuizTheme("unknown")).toBe("dark");
  });

  it("resolves both assets from the ZIP and preserves branding.theme", async () => {
    const createObjectURL = vi.fn().mockReturnValueOnce("blob:image").mockReturnValueOnce("blob:sound");
    vi.stubGlobal("URL", { createObjectURL });
    const zip = new JSZip();
    zip.file("quiz.json", JSON.stringify({ meta: { title: "Dual media" }, branding: { theme: "neon" }, questions: [question] }));
    zip.file("assets/image.png", "image");
    zip.file("assets/sound.mp3", "sound");
    const data = await zip.generateAsync({ type: "uint8array" });
    const pkg = await loadQuizPackage(data as unknown as File);
    expect(pkg.questions[0]?.media).toBe("blob:image");
    expect(pkg.questions[0]?.audio).toBe("blob:sound");
    expect(pkg.branding?.theme).toBe("neon");
    expect(Object.keys(pkg.assetUrls)).toHaveLength(2);
  });

  it("mixes sorting options deterministically and never shows the solution order", () => {
    const correctOrder = options.map((o) => o.id);
    const mixed = sortingMixedOrder(options, correctOrder, "q-42");
    expect(mixed).not.toEqual(correctOrder);
    expect([...mixed].sort()).toEqual(correctOrder.sort());
    expect(sortingMixedOrder(options, correctOrder, "q-42")).toEqual(mixed);
    expect(sortingMixedOrder(options, correctOrder, "q-43")).not.toEqual(correctOrder);
  });

  it("falls back to a rotation when the seeded shuffle equals the solution", () => {
    const correctOrder = options.map((o) => o.id);
    let mixed = correctOrder;
    for (let i = 0; i < 500 && mixed === undefined; i++) mixed = sortingMixedOrder(options, correctOrder, `seed-${i}`);
    expect(sortingMixedOrder(options, correctOrder, "any-seed")).not.toEqual(correctOrder);
  });
});