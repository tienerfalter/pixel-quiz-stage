import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allActiveTeamsAnswered, correctChoiceLetter, pauseTitle, questionAudioSource, questionImageSource, resolveQuizTheme, sortingMixedOrder } from "@/lib/quizPresentation";
import { needsInput } from "@/components/quiz/AnswerPad";
import { computeAwards } from "@/lib/scoring";
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
  it("only replaces the question image at resolved and falls back to media", () => {
    const q = { ...question, resolutionMedia: "assets/solution.png" };
    for (const phase of ["ready", "guessing", "locked"] as const) expect(questionImageSource(q, phase)).toBe("assets/image.png");
    expect(questionImageSource(q, "resolved")).toBe("assets/solution.png");
    expect(questionImageSource(question, "resolved")).toBe("assets/image.png");
  });

  it("routes choice mosaics to answers while legacy mosaics remain buzzers", () => {
    const q: QuizQuestion = { ...question, type: "mosaic", media: "image.png", grid: { rows: 2, cols: 2 }, revealMode: "auto", pointsPerTier: [{ maxRevealedPercent: 50, points: 5 }, { maxRevealedPercent: 100, points: 2 }], inputMode: "choice", options: options.slice(0, 4), correctOption: "B" };
    expect(needsInput(q)).toBe(true);
    expect(correctChoiceLetter(q)).toBe("B");
    expect(correctChoiceLetter({ ...q, correctOption: "b" })).toBe("B");
    expect(needsInput({ ...q, inputMode: "buzzer" })).toBe(false);
    expect(needsInput({ ...q, inputMode: undefined })).toBe(false);
    const answers = [{ team_id: "right", answer: { option: "B" }, created_at: "2026-10-18T00:00:01Z" }, { team_id: "wrong", answer: { option: "A" }, created_at: "2026-10-18T00:00:02Z" }];
    expect(computeAwards(q, answers, 1, 3)).toEqual({ right: 2 });
  });

  it("requires every active team, ignoring removed teams and duplicate answers", () => {
    expect(allActiveTeamsAnswered(["a", "b"], [{ team_id: "a" }, { team_id: "removed" }])).toBe(false);
    expect(allActiveTeamsAnswered(["a", "b"], [{ team_id: "a" }, { team_id: "a" }])).toBe(false);
    expect(allActiveTeamsAnswered(["a", "b"], [{ team_id: "a" }, { team_id: "b" }])).toBe(true);
    expect(allActiveTeamsAnswered([], [])).toBe(false);
  });

  it("loads resolution and pause images from the ZIP", async () => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:asset") });
    const zip = new JSZip();
    zip.file("quiz.json", JSON.stringify({ meta: { title: "Images" }, pause: { title: "Pause", image: "assets/pause.png" }, questions: [{ ...question, resolutionMedia: "assets/solution.png" }] }));
    zip.file("assets/solution.png", "solution");
    zip.file("assets/pause.png", "pause");
    const pkg = await loadQuizPackage(await zip.generateAsync({ type: "uint8array" }) as unknown as File);
    expect(pkg.questions[0]?.resolutionMedia).toBe("blob:asset");
    expect(pkg.pause?.image).toBe("blob:asset");
  });

  it("keeps legacy audio when a resolution image exists", () => {
    const q = { ...question, audio: undefined, mediaType: "audio" as const, media: "legacy.mp3", resolutionMedia: "solution.png" };
    expect(questionAudioSource(q)).toBe("legacy.mp3");
    expect(questionImageSource(q, "guessing")).toBeUndefined();
    expect(questionImageSource(q, "resolved")).toBe("solution.png");
  });
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

  it("mixes even two options and tolerates a mismatched correctOrder", () => {
    const two = options.slice(0, 2);
    expect(sortingMixedOrder(two, two.map((o) => o.id), "s")).toEqual(["b", "a"]);
    // Uneinheitliche Metadaten: Mischung fällt auf die Optionen zurück statt zu crashen.
    expect(sortingMixedOrder(two, ["x", "y", "z"], "s").sort()).toEqual(["a", "b"]);
  });
});