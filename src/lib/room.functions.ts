import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";

type HostSession = { host?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "quiz-host",
    maxAge: 60 * 60 * 24,
    cookie: { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" },
  };
}

async function digest(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function keyMatches(input: string, expected: string) {
  const [a, b] = await Promise.all([digest(input), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function requireHost() {
  const session = await useSession<HostSession>(sessionConfig());
  if (!session.data.host) throw new Error("Nicht freigeschaltet");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const codeSchema = z.string().regex(/^[A-Z0-9]{4,6}$/);

export const unlockHost = createServerFn({ method: "POST" })
  .inputValidator((d: { key: string }) => z.object({ key: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const expected = process.env["HOST_KEY"];
    if (!expected || !(await keyMatches(data.key, expected))) return { ok: false as const };
    const session = await useSession<HostSession>(sessionConfig());
    await session.update({ host: true });
    return { ok: true as const };
  });

export const hostStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<HostSession>(sessionConfig());
  return { unlocked: !!session.data.host };
});

export const lockHost = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<HostSession>(sessionConfig());
  await session.clear();
  return { ok: true };
});

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const openRoom = createServerFn({ method: "POST" }).handler(async () => {
  await requireHost();
  const db = await admin();
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
    const { error } = await db.from("quiz_rooms").insert({ room_code: code });
    if (!error) return { code };
  }
  throw new Error("Kein freier Raumcode gefunden");
});

export const signAssetUploads = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; paths: string[] }) =>
    z.object({ code: codeSchema, paths: z.array(z.string().max(300)).max(500) }).parse(d))
  .handler(async ({ data }) => {
    await requireHost();
    const db = await admin();
    return Promise.all(
      data.paths.map(async (p) => {
        const path = `${data.code}/${p.replace(/[^\w./-]/g, "_")}`;
        const { data: s, error } = await db.storage.from("quiz-assets").createSignedUploadUrl(path, { upsert: true });
        if (error || !s) throw new Error(error?.message ?? "Upload-URL fehlgeschlagen");
        return { original: p, path, token: s.token };
      }),
    );
  });

export const signAssetReads = createServerFn({ method: "POST" })
  .inputValidator((d: { paths: string[] }) => z.object({ paths: z.array(z.string().max(320)).max(500) }).parse(d))
  .handler(async ({ data }) => {
    await requireHost();
    const db = await admin();
    if (!data.paths.length) return [];
    const { data: urls, error } = await db.storage.from("quiz-assets").createSignedUrls(data.paths, 60 * 60 * 24);
    if (error || !urls) throw new Error(error?.message ?? "Lese-URLs fehlgeschlagen");
    return urls.map((u) => ({ path: u.path ?? "", url: u.signedUrl }));
  });

export const pushRoom = createServerFn({ method: "POST" })
  .inputValidator((d: {
    code: string;
    state?: unknown;
    quiz?: unknown;
    resetBuzzer?: boolean;
    phase?: string;
    currentQuestionIndex?: number;
    timerSecondsLeft?: number;
    scores?: Record<string, number>;
  }) =>
    z.object({
      code: codeSchema,
      state: z.any().optional(),
      quiz: z.any().optional(),
      resetBuzzer: z.boolean().optional(),
      phase: z.string().max(20).optional(),
      currentQuestionIndex: z.number().int().optional(),
      timerSecondsLeft: z.number().int().optional(),
      scores: z.record(z.string(), z.number()).optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    await requireHost();
    const db = await admin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.state !== undefined) patch["state"] = data.state;
    if (data.quiz !== undefined) patch["quiz"] = data.quiz;
    if (data.phase) patch["phase"] = data.phase;
    if (data.currentQuestionIndex !== undefined) patch["current_question_index"] = data.currentQuestionIndex;
    if (data.timerSecondsLeft !== undefined) patch["timer_seconds_left"] = data.timerSecondsLeft;
    if (data.scores) patch["scores"] = data.scores;
    if (data.resetBuzzer) patch["buzzer_winner"] = null;
    const { error } = await db.from("quiz_rooms").update(patch as never).eq("room_code", data.code);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const kickTeam = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; id: string }) => z.object({ code: codeSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireHost();
    const db = await admin();
    await db.from("room_teams").delete().eq("id", data.id).eq("room_code", data.code);
    return { ok: true };
  });

export const renameRoomTeam = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; id: string; name: string }) =>
    z.object({ code: codeSchema, id: z.string().uuid(), name: z.string().trim().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    await requireHost();
    const db = await admin();
    await db.from("room_teams").update({ name: data.name }).eq("id", data.id).eq("room_code", data.code);
    return { ok: true };
  });
