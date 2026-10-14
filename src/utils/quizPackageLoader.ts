import JSZip from "jszip";
import type { LoadedQuizPackage, QuizPackage } from "@/types/quiz";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
};

function normalize(p: string) {
  return p.replace(/^\.?\//, "");
}

/** Recursively replace every string starting with "assets/" by its blob URL. */
function replaceAssetPaths<T>(value: T, urls: Record<string, string>): T {
  if (typeof value === "string") {
    const key = normalize(value);
    return (key.startsWith("assets/") && urls[key] ? urls[key] : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => replaceAssetPaths(v, urls)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceAssetPaths(v, urls);
    return out as T;
  }
  return value;
}

export async function loadQuizPackage(file: File): Promise<LoadedQuizPackage> {
  const zip = await JSZip.loadAsync(file);

  // quiz.json may sit at root or inside a single top folder
  const jsonEntry = Object.values(zip.files).find(
    (f) => !f.dir && /(^|\/)quiz\.json$/i.test(f.name),
  );
  if (!jsonEntry) throw new Error("quiz.json wurde im Paket nicht gefunden.");
  const prefix = jsonEntry.name.slice(0, -"quiz.json".length);

  let pkg: QuizPackage;
  try {
    pkg = JSON.parse(await jsonEntry.async("string"));
  } catch {
    throw new Error("quiz.json ist kein gültiges JSON.");
  }
  if (!pkg?.meta || !Array.isArray(pkg.questions)) {
    throw new Error("quiz.json fehlt 'meta' oder 'questions'.");
  }

  const assetUrls: Record<string, string> = {};
  const assetEntries = Object.values(zip.files).filter(
    (f) => !f.dir && f.name.startsWith(prefix + "assets/"),
  );
  await Promise.all(
    assetEntries.map(async (entry) => {
      const rel = entry.name.slice(prefix.length);
      const ext = rel.split(".").pop()?.toLowerCase() ?? "";
      const data = await entry.async("arraybuffer");
      const blob = new Blob([data], { type: MIME[ext] ?? "application/octet-stream" });
      assetUrls[rel] = URL.createObjectURL(blob);
    }),
  );

  return {
    meta: pkg.meta,
    ...(pkg.branding ? { branding: replaceAssetPaths(pkg.branding, assetUrls) } : {}),
    ...(pkg.outro ? { outro: replaceAssetPaths(pkg.outro, assetUrls) } : {}),
    ...(pkg.intro ? { intro: replaceAssetPaths(pkg.intro, assetUrls) } : {}),
    questions: replaceAssetPaths(pkg.questions, assetUrls),
    assetUrls,
    sourceFileName: file.name,
  };
}

export function revokeQuizPackage(pkg: LoadedQuizPackage | null) {
  if (!pkg) return;
  Object.values(pkg.assetUrls).forEach((u) => URL.revokeObjectURL(u));
}
