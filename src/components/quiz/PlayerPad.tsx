import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { QuizQuestion, Team } from "@/types/quiz";
import { AnswerPad, needsInput } from "./AnswerPad";

interface RoomRow {
  phase: string;
  current_question_index: number;
  buzzer_winner: string | null;
  state: { teams?: Team[]; buzzerLocked?: string[] } | null;
  quiz: { meta?: { title?: string }; questions?: QuizQuestion[]; branding?: { mobileBanner?: string } } | null;
}

const storeKey = (code: string) => `quiz-team-${code}`;

export function PlayerPad({ initialRoom }: { initialRoom?: string | undefined }) {
  const [code, setCode] = useState((initialRoom ?? "").toUpperCase());
  const [name, setName] = useState("");
  const [joined, setJoined] = useState<{ code: string; teamId: string } | null>(null);
  const [row, setRow] = useState<RoomRow | null>(null);
  const [teamName, setTeamName] = useState("");
  const [kicked, setKicked] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Restore earlier join for this room
  useEffect(() => {
    if (!initialRoom) return;
    const c = initialRoom.toUpperCase();
    const id = localStorage.getItem(storeKey(c));
    if (id) setJoined({ code: c, teamId: id });
  }, [initialRoom]);

  useEffect(() => {
    if (!joined) return;
    const { code: c, teamId } = joined;
    const loadTeam = async () => {
      const { data } = await supabase.from("room_teams").select("name").eq("id", teamId).maybeSingle();
      if (data) setTeamName(data.name);
      else setKicked(true);
    };
    loadTeam();
    supabase.from("quiz_rooms").select("phase,current_question_index,buzzer_winner,state,quiz").eq("room_code", c).maybeSingle()
      .then(({ data }) => data && setRow(data as RoomRow));
    const ch = supabase
      .channel(`play-${c}-${teamId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quiz_rooms", filter: `room_code=eq.${c}` },
        (p) => setRow(p.new as RoomRow))
      .on("postgres_changes", { event: "*", schema: "public", table: "room_teams" }, () => loadTeam())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [joined]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const c = code.trim().toUpperCase();
    const { data, error } = await supabase.rpc("join_room", { _room: c, _name: name.trim() });
    setBusy(false);
    if (error || !data) return setErr(error?.message.includes("nicht gefunden") ? "Diesen Raum gibt es nicht." : "Beitritt fehlgeschlagen.");
    localStorage.setItem(storeKey(c), data);
    setKicked(false);
    setJoined({ code: c, teamId: data });
  }

  function leave() {
    if (joined) localStorage.removeItem(storeKey(joined.code));
    setJoined(null);
    setRow(null);
    setKicked(false);
  }

  const banner = row?.quiz?.branding?.mobileBanner;

  return (
    <main className="bg-stage flex min-h-screen flex-col items-center px-6 py-10">
      {banner && <img src={banner} alt="" className="mb-6 w-full max-w-sm rounded-xl" />}
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">Live Quiz</p>
      <h1 className="mt-2 text-4xl font-extrabold">Mitspielen</h1>
      <div className="mt-8 w-full max-w-sm flex-1">
        {!joined || kicked ? (
          <form onSubmit={join} className="space-y-4">
            {kicked && <p className="rounded-xl bg-destructive/20 p-3 text-center text-sm">Dein Team wurde aus dem Raum entfernt.</p>}
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-muted-foreground">Raum-Code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABCD" autoCapitalize="characters" className="w-full rounded-xl border bg-input px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] outline-none focus:border-primary" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-muted-foreground">Teamname</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="z. B. Die Besserwisser" className="w-full rounded-xl border bg-input px-4 py-4 text-lg outline-none focus:border-primary" />
            </label>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <button disabled={busy || code.length < 4 || !name.trim()} className="shadow-glow w-full rounded-xl bg-primary py-4 text-xl font-extrabold text-primary-foreground disabled:opacity-50">
              {busy ? "Verbinde…" : "Beitreten"}
            </button>
          </form>
        ) : (
          <PadState row={row} code={joined.code} teamId={joined.teamId} teamName={teamName} onLeave={leave} />
        )}
      </div>
      <Link to="/admin" className="mt-10 text-xs text-muted-foreground/60 hover:text-muted-foreground">Quiz leiten</Link>
    </main>
  );
}

function PadState({ row, code, teamId, teamName, onLeave }: { row: RoomRow | null; code: string; teamId: string; teamName: string; onLeave: () => void }) {
  const [pressing, setPressing] = useState(false);
  const phase = row?.phase ?? "intro";
  const question = row?.quiz?.questions?.[row.current_question_index];
  const winner = row?.buzzer_winner;
  const winnerName = row?.state?.teams?.find((t) => t.id === winner)?.name ?? "Ein anderes Team";

  async function buzz() {
    if (pressing || winner || row?.state?.buzzerLocked?.includes(teamId)) return;
    setPressing(true);
    navigator.vibrate?.(80);
    await supabase.rpc("press_buzzer", { _room: code, _team: teamId });
    setPressing(false);
  }

  let body;
  const lockedOut = !!row?.state?.buzzerLocked?.includes(teamId);
  if (phase === "guessing" && question && !needsInput(question) && lockedOut) {
    body = <div className="rounded-3xl bg-destructive p-10 text-center text-destructive-foreground"><p className="text-5xl font-extrabold">Leider falsch!</p><p className="mt-3">Die anderen Teams dürfen jetzt buzzern.</p></div>;
  } else if (phase === "guessing" && question && !needsInput(question)) {
    body = winner ? (
      winner === teamId ? (
        <div className="rounded-3xl bg-success p-10 text-center text-success-foreground"><p className="text-5xl font-extrabold">Du bist dran!</p></div>
      ) : (
        <div className="rounded-3xl bg-card p-10 text-center"><p className="text-3xl font-extrabold">{winnerName} war schneller!</p></div>
      )
    ) : (
      <button onPointerDown={buzz} disabled={pressing} className="shadow-glow aspect-square w-full touch-manipulation select-none rounded-full bg-accent text-5xl font-extrabold text-accent-foreground transition active:scale-95">
        BUZZ!
      </button>
    );
  } else if (question && needsInput(question) && (phase === "guessing" || phase === "locked" || phase === "resolved")) {
    body = <AnswerPad key={`${row!.current_question_index}`} question={question} qIndex={row!.current_question_index} phase={phase} code={code} teamId={teamId} />;
  } else if (phase === "guessing") {
    body = <Info title="Frage läuft" text="Schau auf den Beamer und beratet euch im Team." />;
  } else if (phase === "locked" || phase === "resolved") {
    body = <Info title="Zeit ist um!" text="Schau auf den Beamer." />;
  } else if (phase === "intermission" || phase === "podium" || phase === "farewell") {
    body = <Info title="Das Quiz ist vorbei" text="Schau auf den Beamer für die Siegerehrung!" />;
  } else {
    body = <Info title="Gleich geht's los!" text={`Verbunden mit Raum ${code} – warte auf Start…`} />;
  }

  return (
    <div className="space-y-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">Du spielst als</p>
        <p className="text-3xl font-bold text-primary">{teamName || "…"}</p>
      </div>
      {body}
      <button onClick={onLeave} className="text-sm text-muted-foreground underline">Raum verlassen</button>
    </div>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border bg-card/80 p-10 backdrop-blur">
      <p className="text-3xl font-extrabold">{title}</p>
      <p className="mt-3 text-muted-foreground">{text}</p>
    </div>
  );
}
