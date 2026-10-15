import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { GameStatus, LoadedQuizPackage, Phase, QuizQuestion, QuizTheme, Team } from "@/types/quiz";
import { questionAudioSource, resolveQuizTheme } from "@/lib/quizPresentation";
import { revokeQuizPackage } from "@/utils/quizPackageLoader";
import { fetchRoom, fetchTeams, subscribeRoom } from "@/lib/roomData";
import { pushRoom } from "@/lib/room.functions";

export interface RoomLink {
  code: string;
  role: "host" | "viewer";
}

export interface AudioState {
  playing: boolean;
  volume: number;
  /** Incremented to trigger "restart from beginning" */
  restartSeq: number;
}

/** Timer synced via absolute end timestamp so every tab computes the same value. */
export interface TimerState {
  enabled: boolean;
  running: boolean;
  /** epoch ms when the timer hits zero (only meaningful while running) */
  endsAt: number | null;
  /** remaining ms while paused */
  remainingMs: number;
}

export interface SfxEvent {
  kind: "correct" | "wrong";
  seq: number;
}

interface SyncState {
  quiz: LoadedQuizPackage | null;
  currentQuestionIndex: number;
  phase: Phase;
  status: GameStatus;
  showScores: boolean;
  teams: Team[];
  revealedTiles: number[];
  revealedClues: number;
  mosaicAuto: boolean;
  audio: AudioState;
  timer: TimerState;
  sfx: SfxEvent;
  /** Teams locked out of the buzzer for the current question */
  buzzerLocked: string[];
  /** Incremented to clear the cloud buzzer winner */
  buzzerResetSeq: number;
  /** Book points automatically on correct/wrong and on resolve */
  autoScoring: boolean;
  /** Why the round was locked: timer ran out vs. ended otherwise */
  lockReason: LockReason;
}

export type LockReason = "timeout" | "ended" | null;

interface QuizContextValue extends SyncState {
  theme: QuizTheme;
  setQuiz: (q: LoadedQuizPackage | null) => void;
  goToQuestion: (i: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  startQuestion: () => void;
  setPhase: (p: Phase, reason?: LockReason) => void;
  addTeam: (name: string) => void;
  removeTeam: (id: string) => void;
  renameTeam: (id: string, name: string) => void;
  startQuiz: () => void;
  endQuiz: () => void;
  setStatus: (status: GameStatus) => void;
  setShowScores: (on: boolean) => void;
  adjustScore: (id: string, delta: number) => void;
  undoScore: (id: string) => void;
  revealRandomTile: (total: number) => void;
  revealAllTiles: (total: number) => void;
  setMosaicAuto: (on: boolean) => void;
  revealNextClue: (total: number) => void;
  revealAllClues: (total: number) => void;
  setAudio: (patch: Partial<AudioState>) => void;
  restartAudio: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  addTime: (seconds: number) => void;
  playSfx: (kind: SfxEvent["kind"]) => void;
  /** Lock a team out after a wrong buzzer answer and free the buzzer for others */
  lockOutBuzzer: (teamId: string) => void;
  setAutoScoring: (on: boolean) => void;
  room: RoomLink | null;
  setRoom: (r: RoomLink | null) => void;
  buzzerWinner: string | null;
}

const QuizContext = createContext<QuizContextValue | null>(null);

/**
 * Fallback used when a stale hot-reloaded module reads a different context
 * instance than the mounted provider. No-op setters keep the UI alive until
 * the next full page load restores the real provider.
 */
const noop = () => {};
const FALLBACK_CONTEXT: QuizContextValue = {
  theme: "dark",
  quiz: null,
  currentQuestionIndex: 0,
  phase: "guessing",
  status: "intro",
  showScores: false,
  teams: [],
  revealedTiles: [],
  revealedClues: 1,
  mosaicAuto: false,
  audio: { playing: false, volume: 0.8, restartSeq: 0 },
  timer: { enabled: false, running: false, endsAt: null, remainingMs: 0 },
  sfx: { kind: "correct", seq: 0 },
  buzzerLocked: [],
  buzzerResetSeq: 0,
  autoScoring: true,
  lockReason: null,
  setAutoScoring: noop,
  lockOutBuzzer: noop,
  setQuiz: noop,
  goToQuestion: noop,
  nextQuestion: noop,
  prevQuestion: noop,
  setPhase: noop,
  addTeam: noop,
  removeTeam: noop,
  renameTeam: noop,
  startQuiz: noop,
  endQuiz: noop,
  setStatus: noop,
  setShowScores: noop,
  adjustScore: noop,
  undoScore: noop,
  revealRandomTile: noop,
  revealAllTiles: noop,
  setMosaicAuto: noop,
  revealNextClue: noop,
  revealAllClues: noop,
  setAudio: noop,
  restartAudio: noop,
  toggleTimer: noop,
  startQuestion: noop,
  resetTimer: noop,
  addTime: noop,
  playSfx: noop,
  room: null,
  setRoom: noop,
  buzzerWinner: null,
};

const DEFAULT_TEAMS: Team[] = [
  { id: "t1", name: "Team Rot", score: 0 },
  { id: "t2", name: "Team Blau", score: 0 },
];

const CHANNEL = "quiz-sync";

function initialTimer(question?: QuizQuestion): TimerState {
  const t = question?.timing;
  if (!t?.hasTimer || !t.timeLimitSeconds) return { enabled: false, running: false, endsAt: null, remainingMs: 0 };
  const ms = t.timeLimitSeconds * 1000;
  // Timer wartet, bis der Quizmaster startet (Vorlese-Phase "ready").
  return { enabled: true, running: false, endsAt: null, remainingMs: ms };
}

const freshQuestionState = (audio: AudioState, question?: QuizQuestion) => ({
  // Jede Frage startet in der Vorlese-Phase; erst "Frage einblenden / Start" zeigt sie.
  phase: "ready" as Phase,
  lockReason: null as LockReason,
  revealedTiles: [] as number[],
  revealedClues: 1,
  mosaicAuto: false,
  audio: { ...audio, playing: false },
  timer: initialTimer(question),
  buzzerLocked: [] as string[],
});

export function timerRemainingMs(t: TimerState, now = Date.now()) {
  if (!t.enabled) return 0;
  return t.running && t.endsAt ? Math.max(0, t.endsAt - now) : t.remainingMs;
}

/**
 * Global quiz state. Synced between tabs (admin / display / play) of the same
 * browser via BroadcastChannel.
 */
export function QuizProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SyncState>({
    quiz: null,
    currentQuestionIndex: 0,
    status: "intro",
    showScores: false,
    teams: DEFAULT_TEAMS,
    sfx: { kind: "correct", seq: 0 },
    buzzerResetSeq: 0,
    autoScoring: true,
    ...freshQuestionState({ playing: false, volume: 0.8, restartSeq: 0 }),
  });
  // Viewer-Rolle sofort aus der URL erkennen, damit der Beamer-Tab nie seinen
  // leeren Anfangszustand an andere Tabs sendet (würde das Pult zurücksetzen).
  const [room, setRoom] = useState<RoomLink | null>(() => {
    if (typeof window === "undefined") return null;
    const code = new URLSearchParams(window.location.search).get("room");
    return code && window.location.pathname.startsWith("/display")
      ? { code: code.toUpperCase(), role: "viewer" }
      : null;
  });
  const [buzzerWinner, setBuzzerWinner] = useState<string | null>(null);
  const roomRef = useRef<RoomLink | null>(room);
  roomRef.current = room;
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fromRemote = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e) => {
      if (roomRef.current?.role === "viewer") return;
      if (e.data?.type === "state") {
        fromRemote.current = true;
        setState(e.data.state);
      } else if (e.data?.type === "hello") {
        if (stateRef.current.quiz) ch.postMessage({ type: "state-reply", state: stateRef.current });
      } else if (e.data?.type === "state-reply" && !stateRef.current.quiz && e.data.state.quiz) {
        fromRemote.current = true;
        setState(e.data.state);
      }
    };
    ch.postMessage({ type: "hello" });
    return () => ch.close();
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (fromRemote.current) {
      fromRemote.current = false;
      return;
    }
    // Nur das Pult (/admin) darf Zustand an andere Tabs senden — Bühne und
    // Mitspieler-Tabs (auch mit leerem ?room=) dürfen das Pult nie überschreiben.
    const isAdminTab = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
    if (isAdminTab && roomRef.current?.role !== "viewer") channelRef.current?.postMessage({ type: "state", state });
  }, [state]);

  // Cloud room subscription (host: buzzer + teams, viewer: full state)
  useEffect(() => {
    if (!room) return;
    const { code, role } = room;
    const apply = (row: { buzzer_winner: string | null; state: unknown; quiz: unknown }) => {
      setBuzzerWinner(row.buzzer_winner);
      if (role === "viewer" && row.state) {
        fromRemote.current = true;
        setState({ ...(row.state as SyncState), quiz: (row.quiz as LoadedQuizPackage | null) ?? null });
      }
    };
    const refreshTeams = async () => {
      const data = await fetchTeams(code);
      setState((s) => ({
        ...s,
        teams: data.map((r) => s.teams.find((t) => t.id === r.id) ?? { id: r.id, name: r.name, score: 0 }),
      }));
    };
    const refreshRoom = () => fetchRoom(code).then((data) => data && apply(data));
    refreshRoom();
    if (role === "host") refreshTeams();
    return subscribeRoom(code, (table) => {
      if (!table || table === "quiz_rooms") refreshRoom();
      if (role === "host" && (!table || table === "room_teams")) refreshTeams();
    });
  }, [room]);

  // Audio-Frage: Buzzer-Druck pausiert die Wiedergabe sofort (Host ist Single-Writer).
  useEffect(() => {
    if (room?.role !== "host" || !buzzerWinner) return;
    setState((s) => (s.audio.playing ? { ...s, audio: { ...s.audio, playing: false } } : s));
  }, [buzzerWinner, room]);

  // Host pushes state to the cloud room (debounced)
  const lastKey = useRef("");
  const lastSeq = useRef(0);
  useEffect(() => {
    if (room?.role !== "host") return;
    const id = setTimeout(() => {
      const s = stateRef.current;
      const key = `${s.status}-${s.currentQuestionIndex}`;
      const resetBuzzer = key !== lastKey.current || s.buzzerResetSeq !== lastSeq.current;
      lastKey.current = key;
      lastSeq.current = s.buzzerResetSeq;
      pushRoom({
        data: {
          code: room.code,
          state: { ...s, quiz: null },
          resetBuzzer,
          phase: s.status === "running" ? s.phase : s.status,
          currentQuestionIndex: s.currentQuestionIndex,
          timerSecondsLeft: Math.ceil(timerRemainingMs(s.timer) / 1000),
          scores: Object.fromEntries(s.teams.map((t) => [t.id, t.score])),
        },
      }).catch((e) => console.error("Raum-Sync fehlgeschlagen", e));
    }, 150);
    return () => clearTimeout(id);
  }, [state, room]);

  const setQuiz = useCallback((quiz: LoadedQuizPackage | null) => {
    setState((s) => {
      if (s.quiz && s.quiz !== quiz) revokeQuizPackage(s.quiz);
      const fresh = freshQuestionState(s.audio);
      return { ...s, quiz, currentQuestionIndex: 0, status: "intro", showScores: false, ...fresh };
    });
  }, []);

  const goToQuestion = useCallback((i: number) => {
    setState((s) => {
      const max = (s.quiz?.questions.length ?? 1) - 1;
      const idx = Math.max(0, Math.min(max, i));
      return { ...s, status: "running", currentQuestionIndex: idx, ...freshQuestionState(s.audio, s.quiz?.questions[idx]) };
    });
  }, []);

  const revealRandomTile = useCallback((total: number) => {
    setState((s) => {
      const hidden = Array.from({ length: total }, (_, i) => i).filter((i) => !s.revealedTiles.includes(i));
      if (!hidden.length) return { ...s, mosaicAuto: false };
      const pick = hidden[Math.floor(Math.random() * hidden.length)]!;
      return { ...s, revealedTiles: [...s.revealedTiles, pick], mosaicAuto: hidden.length > 1 && s.mosaicAuto };
    });
  }, []);

  const setPhase = useCallback((phase: Phase, reason: LockReason = "ended") => {
    setState((s) => {
      const lockReason: LockReason = phase === "locked" ? reason : phase === "resolved" ? s.lockReason : null;
      const timer = phase !== "guessing" && s.timer.running
        ? { ...s.timer, running: false, remainingMs: timerRemainingMs(s.timer), endsAt: null }
        : s.timer;
      const audio = phase === "locked" || phase === "resolved" || phase === "ready"
        ? { ...s.audio, playing: false }
        : s.phase === "ready" && questionAudioSource(s.quiz?.questions[s.currentQuestionIndex])
          ? { ...s.audio, playing: true } : s.audio;
      return { ...s, phase, lockReason, timer, audio, mosaicAuto: phase === "guessing" ? s.mosaicAuto : false };
    });
  }, []);

  const value: QuizContextValue = {
    ...state,
    theme: resolveQuizTheme(state.quiz?.branding?.theme),
    room,
    setRoom,
    buzzerWinner,
    setQuiz,
    goToQuestion,
    nextQuestion: () => goToQuestion(state.currentQuestionIndex + 1),
    prevQuestion: () => goToQuestion(state.currentQuestionIndex - 1),
    setPhase,
    addTeam: (name) =>
      setState((s) => ({ ...s, teams: [...s.teams, { id: crypto.randomUUID(), name, score: 0 }] })),
    renameTeam: (id, name) => setState((s) => ({ ...s, teams: s.teams.map((t) => (t.id === id ? { ...t, name } : t)) })),
    startQuiz: () =>
      setState((s) => ({ ...s, status: "running", currentQuestionIndex: 0, ...freshQuestionState(s.audio, s.quiz?.questions[0]) })),
    endQuiz: () => setState((s) => ({ ...s, status: "intermission", ...freshQuestionState(s.audio) })),
    setStatus: (status) => setState((s) => ({ ...s, status })),
    setShowScores: (showScores) => setState((s) => ({ ...s, showScores })),
    removeTeam: (id) => setState((s) => ({ ...s, teams: s.teams.filter((t) => t.id !== id) })),
    adjustScore: (id, delta) =>
      setState((s) => ({
        ...s,
        teams: s.teams.map((t) => (t.id === id ? { ...t, score: t.score + delta, lastDelta: delta } : t)),
      })),
    undoScore: (id) =>
      setState((s) => ({
        ...s,
        teams: s.teams.map((t) => (t.id === id && t.lastDelta ? { ...t, score: t.score - t.lastDelta, lastDelta: 0 } : t)),
      })),
    revealRandomTile,
    revealAllTiles: (total) =>
      setState((s) => ({ ...s, mosaicAuto: false, revealedTiles: Array.from({ length: total }, (_, i) => i) })),
    setMosaicAuto: (mosaicAuto) => setState((s) => ({ ...s, mosaicAuto })),
    revealNextClue: (total) => setState((s) => ({ ...s, revealedClues: Math.min(total, s.revealedClues + 1) })),
    revealAllClues: (total) => setState((s) => ({ ...s, revealedClues: total })),
    setAudio: (patch) => setState((s) => ({ ...s, audio: { ...s.audio, ...patch } })),
    restartAudio: () =>
      setState((s) => ({ ...s, audio: { ...s.audio, playing: true, restartSeq: s.audio.restartSeq + 1 } })),
    startQuestion: () =>
      setState((s) => {
        if (s.phase !== "ready") return s;
        const q = s.quiz?.questions[s.currentQuestionIndex];
        const timer = s.timer.enabled && s.timer.remainingMs > 0
          ? { ...s.timer, running: true, endsAt: Date.now() + s.timer.remainingMs } : s.timer;
        const audio = questionAudioSource(q) ? { ...s.audio, playing: true } : s.audio;
        const mosaicAuto = q?.type === "mosaic" && q.revealMode !== "manual";
        return { ...s, phase: "guessing", lockReason: null, timer, audio, mosaicAuto };
      }),
    toggleTimer: () =>
      setState((s) => {
        if (!s.timer.enabled) return s;
        if (s.timer.running) {
          return { ...s, timer: { ...s.timer, running: false, endsAt: null, remainingMs: timerRemainingMs(s.timer) } };
        }
        if (s.timer.remainingMs <= 0) return s;
        if (s.phase === "ready") {
          const q = s.quiz?.questions[s.currentQuestionIndex];
          return { ...s, phase: "guessing", lockReason: null,
            audio: questionAudioSource(q) ? { ...s.audio, playing: true } : s.audio,
            mosaicAuto: q?.type === "mosaic" && q.revealMode !== "manual",
            timer: { ...s.timer, running: true, endsAt: Date.now() + s.timer.remainingMs } };
        }
        return { ...s, phase: "guessing", timer: { ...s.timer, running: true, endsAt: Date.now() + s.timer.remainingMs } };
      }),
    resetTimer: () =>
      setState((s) => {
        const q = s.quiz?.questions[s.currentQuestionIndex];
        const t = initialTimer(q);
        if (!t.enabled) return s;
        // Nach Ablauf: zurück in die Ratephase, Timer läuft sofort wieder.
        if (s.phase === "locked") return { ...s, phase: "guessing", lockReason: null, timer: { ...t, running: true, endsAt: Date.now() + t.remainingMs } };
        return { ...s, timer: t };
      }),
    addTime: (sec) =>
      setState((s) => {
        if (!s.timer.enabled) return s;
        const add = sec * 1000;
        if (s.phase === "locked") {
          const rem = timerRemainingMs(s.timer) + add;
          return { ...s, phase: "guessing", lockReason: null, timer: { ...s.timer, running: true, endsAt: Date.now() + rem, remainingMs: rem } };
        }
        return {
          ...s,
          timer: s.timer.running && s.timer.endsAt
            ? { ...s.timer, endsAt: s.timer.endsAt + add }
            : { ...s.timer, remainingMs: s.timer.remainingMs + add },
        };
      }),
    setAutoScoring: (autoScoring) => setState((s) => ({ ...s, autoScoring })),
    playSfx: (kind) => setState((s) => ({ ...s, sfx: { kind, seq: s.sfx.seq + 1 } })),
    lockOutBuzzer: (teamId) =>
      setState((s) => {
        const buzzerLocked = s.buzzerLocked.includes(teamId) ? s.buzzerLocked : [...s.buzzerLocked, teamId];
        const left = s.teams.some((t) => !buzzerLocked.includes(t.id));
        const timer = !left && s.timer.running
          ? { ...s.timer, running: false, remainingMs: timerRemainingMs(s.timer), endsAt: null }
          : s.timer;
        const isAudio = !!questionAudioSource(s.quiz?.questions[s.currentQuestionIndex]);
        // Frage-Audio pausiert bleiben, bis der Fehler-Sound verklungen ist (2,5 s).
        const audio = isAudio ? { ...s.audio, playing: false } : s.audio;
        if (isAudio && left && s.phase === "guessing") {
          const idx = s.currentQuestionIndex;
          setTimeout(() => setState((c) => c.phase === "guessing" && c.currentQuestionIndex === idx
            ? { ...c, audio: { ...c.audio, playing: true } } : c), 2500);
        }
        return { ...s, buzzerLocked, buzzerResetSeq: s.buzzerResetSeq + 1, phase: left ? s.phase : "locked", lockReason: left ? s.lockReason : "ended", timer, audio };
      }),
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  return useContext(QuizContext) ?? FALLBACK_CONTEXT;
}

/** Re-renders periodically and returns remaining seconds of the synced timer. */
export function useTimerSeconds(timer: TimerState) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!timer.running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [timer.running]);
  return Math.ceil(timerRemainingMs(timer, now) / 1000);
}
