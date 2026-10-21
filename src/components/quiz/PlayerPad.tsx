import { fetchRoom, fetchTeams, subscribeRoom } from "@/lib/roomData";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { QuizBranding, QuizPause, QuizQuestion, Team } from "@/types/quiz";
import { pauseTitle, resolveQuizTheme } from "@/lib/quizPresentation";
import { AnswerPad, needsInput } from "./AnswerPad";
import { applyPartySolution, type PartySolution } from "@/lib/partyModes";
import { rankTeams } from "@/lib/teamRanking";

interface RoomRow {
  phase: string;
  current_question_index: number;
  buzzer_winner: string | null;
  state: { teams?: Team[]; buzzerLocked?: string[]; autoScoring?: boolean; lockReason?: string | null; showScoreOnMobile?: boolean; isPaused?: boolean; partySolution?: PartySolution | null } | null;
  quiz: { meta?: { title?: string }; questions?: QuizQuestion[]; branding?: QuizBranding; pause?: QuizPause } | null;
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
      const team = (await fetchTeams(c)).find((t) => t.id === teamId);
      if (team) setTeamName(team.name);
      else setKicked(true);
    };
    const loadRoom = () => fetchRoom(c).then((data) => data && setRow(data as unknown as RoomRow));
    loadTeam();
    loadRoom();
    return subscribeRoom(c, (table) => {
      if (!table || table === "quiz_rooms") loadRoom();
      if (!table || table === "room_teams") loadTeam();
    }, 2000);
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
    <main data-quiz-theme={resolveQuizTheme(row?.quiz?.branding?.theme)} className="quiz-themed bg-stage flex min-h-screen flex-col items-center px-6 py-10 text-foreground">
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
  const rawQuestion = row?.quiz?.questions?.[row.current_question_index];
  const question = rawQuestion && applyPartySolution(rawQuestion, row?.state?.partySolution, row!.current_question_index);
  const winner = row?.buzzer_winner;
  const winnerName = row?.state?.teams?.find((t) => t.id === winner)?.name ?? "Ein anderes Team";
  const ownStanding = rankTeams(row?.state?.teams ?? []).find((t) => t.id === teamId);
  const isFinale = phase === "intermission" || phase === "podium" || phase === "farewell";

  async function buzz() {
    if (pressing || winner || row?.state?.buzzerLocked?.includes(teamId)) return;
    setPressing(true);
    navigator.vibrate?.(80);
    await supabase.rpc("press_buzzer", { _room: code, _team: teamId });
    setPressing(false);
  }

  let body;
  const lockedOut = !!row?.state?.buzzerLocked?.includes(teamId);
  if (row?.state?.isPaused) {
    const p = row.quiz?.pause;
    body = (
      <div className="rounded-3xl border bg-card/80 p-10 backdrop-blur">
        {p?.image && <img src={p.image} alt="" className="mx-auto mb-6 max-h-48 rounded-xl object-contain" />}
        <p className="text-3xl font-extrabold">{pauseTitle(p?.title)}</p>
        <p className="mt-3 text-muted-foreground">{p?.subtitle || "Gleich geht es weiter…"}</p>
      </div>
    );
  } else if (question?.type === "info" && !isFinale) {
    body = (
      <div className="rounded-3xl border bg-card/80 p-8 text-left backdrop-blur">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">{question.title}</p>
        <p className="mt-3 text-2xl font-bold">{question.question}</p>
        {question.media && question.mediaType !== "audio" && <img src={question.media} alt="" className="mt-4 w-full rounded-xl object-contain" />}
      </div>
    );
  } else if (phase === "ready" && question) {
    body = <Info title="Bereithalten… Gleich geht's los!" text="Frage wird vorgelesen… Bereithalten!" />;
  } else if (phase === "guessing" && question && !needsInput(question) && lockedOut) {
    body = (
      <div className="space-y-4">
        <button disabled className="aspect-square w-full cursor-not-allowed rounded-full bg-muted p-6 text-2xl font-extrabold text-muted-foreground opacity-80">Bereits geantwortet – gesperrt für diese Frage</button>
        <p className="rounded-2xl bg-destructive/20 p-4 text-lg font-bold">Du bist für diese Frage ausgeschieden</p>
      </div>
    );
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
    body = <AnswerPad key={`${row!.current_question_index}`} question={question} qIndex={row!.current_question_index} phase={phase} code={code} teamId={teamId} autoScoring={row?.state?.autoScoring !== false} lockReason={row?.state?.lockReason ?? null} />;
  } else if (phase === "guessing") {
    body = <Info title="Frage läuft" text="Schau auf den Beamer und beratet euch im Team." />;
  } else if (phase === "locked" || phase === "resolved") {
    body = <Info title={row?.state?.lockReason === "timeout" && phase === "locked" ? "Die Zeit ist abgelaufen!" : "Runde beendet!"} text="Schau auf den Beamer." />;
  } else if (phase === "podium" && ownStanding) {
    body = <Info title={`${ownStanding.rank}. Platz`} text="Eure Platzierung bei der Siegerehrung" />;
  } else if (isFinale) {
    body = <Info title="Das Quiz ist vorbei" text="Schau auf den Beamer für die Siegerehrung!" />;
  } else {
    body = <Info title="Gleich geht's los!" text={`Verbunden mit Raum ${code} – warte auf Start…`} />;
  }

  return (
    <div className="space-y-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">Du spielst als</p>
        <p className="text-3xl font-bold text-primary">{teamName || "…"}</p>
        {row?.state?.showScoreOnMobile && (
          <div className="mt-1 font-mono text-lg font-bold text-muted-foreground">
            <p>Punkte: {ownStanding?.score ?? 0}</p>
            {ownStanding && <p>{ownStanding.rank}. Platz</p>}
          </div>
        )}
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
