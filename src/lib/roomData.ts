import { supabase } from "@/integrations/supabase/client";

/** Room rows are only readable through code-scoped DB functions (no public table reads). */
export async function fetchRoom(code: string) {
  const { data } = await supabase.rpc("get_room", { _room: code });
  return (data?.[0] ?? null) as {
    room_code: string; phase: string; current_question_index: number;
    buzzer_winner: string | null; state: unknown; quiz: unknown;
  } | null;
}

export async function fetchTeams(code: string) {
  const { data } = await supabase.rpc("get_room_teams", { _room: code });
  return (data ?? []) as { id: string; name: string }[];
}

export async function fetchAnswers(code: string, question: number) {
  const { data } = await supabase.rpc("get_room_answers", { _room: code, _question: question });
  return (data ?? []) as { team_id: string; answer: unknown; created_at: string }[];
}

/**
 * Calls `onChange` whenever something in the room changes (DB trigger broadcasts on
 * topic room:<CODE>), plus a slow polling fallback. Returns an unsubscribe fn.
 */
type Listener = (table?: string) => void;
const shared = new Map<string, { ch: ReturnType<typeof supabase.channel>; listeners: Set<Listener> }>();

export function subscribeRoom(code: string, onChange: Listener, pollMs = 3000) {
  let entry = shared.get(code);
  if (!entry) {
    const listeners = new Set<Listener>();
    const ch = supabase
      .channel(`room:${code}`)
      .on("broadcast", { event: "change" }, (p) => {
        const table = (p.payload as { table?: string } | undefined)?.table;
        listeners.forEach((l) => l(table));
      })
      .subscribe();
    entry = { ch, listeners };
    shared.set(code, entry);
  }
  entry.listeners.add(onChange);
  const id = setInterval(() => onChange(), pollMs);
  return () => {
    clearInterval(id);
    const e = shared.get(code);
    if (!e) return;
    e.listeners.delete(onChange);
    if (!e.listeners.size) { supabase.removeChannel(e.ch); shared.delete(code); }
  };
}
