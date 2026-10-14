import { supabase } from "@/integrations/supabase/client";
import { signAssetReads, signAssetUploads } from "@/lib/room.functions";
import type { LoadedQuizPackage } from "@/types/quiz";

function replaceStrings<T>(value: T, map: Record<string, string>): T {
  if (typeof value === "string") return (map[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => replaceStrings(v, map)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replaceStrings(v, map);
    return out as T;
  }
  return value;
}

/** Uploads all package media to the cloud and returns a copy of the quiz using shareable URLs. */
export async function publishQuizAssets(code: string, quiz: LoadedQuizPackage): Promise<LoadedQuizPackage> {
  const rels = Object.keys(quiz.assetUrls);
  if (!rels.length) return quiz;
  const uploads = await signAssetUploads({ data: { code, paths: rels } });
  await Promise.all(
    uploads.map(async (u) => {
      const blob = await (await fetch(quiz.assetUrls[u.original]!)).blob();
      const { error } = await supabase.storage.from("quiz-assets").uploadToSignedUrl(u.path, u.token, blob, { contentType: blob.type });
      if (error) throw new Error(`Upload fehlgeschlagen: ${u.original}`);
    }),
  );
  const reads = await signAssetReads({ data: { paths: uploads.map((u) => u.path) } });
  const byPath = Object.fromEntries(reads.map((r) => [r.path, r.url]));
  const blobToRemote: Record<string, string> = {};
  const assetUrls: Record<string, string> = {};
  for (const u of uploads) {
    const remote = byPath[u.path];
    if (!remote) continue;
    blobToRemote[quiz.assetUrls[u.original]!] = remote;
    assetUrls[u.original] = remote;
  }
  return { ...replaceStrings(quiz, blobToRemote), assetUrls };
}
