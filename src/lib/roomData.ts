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
export function subscribeRoom(code: string, onChange: (table?: string) => void, pollMs = 3000) {
  const ch = supabase
    .channel(`room:${code}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "change" }, (p) => onChange((p.payload as { table?: string } | undefined)?.table))
    .subscribe();
  const id = setInterval(() => onChange(), pollMs);
  return () => { clearInterval(id); supabase.removeChannel(ch); };
}
