import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { LoadedQuizPackage, Phase, QuizQuestion, Team } from "@/types/quiz";
import { revokeQuizPackage } from "@/utils/quizPackageLoader";

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
  teams: Team[];
  revealedTiles: number[];
  revealedClues: number;
  mosaicAuto: boolean;
  audio: AudioState;
  timer: TimerState;
  sfx: SfxEvent;
}

interface QuizContextValue extends SyncState {
  setQuiz: (q: LoadedQuizPackage | null) => void;
  goToQuestion: (i: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  setPhase: (p: Phase) => void;
  addTeam: (name: string) => void;
  removeTeam: (id: string) => void;
  adjustScore: (id: string, delta: number) => void;
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
}

const QuizContext = createContext<QuizContextValue | null>(null);

const DEFAULT_TEAMS: Team[] = [
  { id: "t1", name: "Team Rot", score: 0 },
  { id: "t2", name: "Team Blau", score: 0 },
];

const CHANNEL = "quiz-sync";

function initialTimer(question?: QuizQuestion): TimerState {
  const t = question?.timing;
  if (!t?.hasTimer) return { enabled: false, running: false, endsAt: null, remainingMs: 0 };
  const ms = t.timeLimitSeconds * 1000;
  return { enabled: true, running: true, endsAt: Date.now() + ms, remainingMs: ms };
}

const freshQuestionState = (audio: AudioState, question?: QuizQuestion) => ({
  phase: "guessing" as Phase,
  revealedTiles: [] as number[],
  revealedClues: 1,
  mosaicAuto: false,
  audio: { ...audio, playing: false },
  timer: initialTimer(question),
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
    teams: DEFAULT_TEAMS,
    sfx: { kind: "correct", seq: 0 },
    ...freshQuestionState({ playing: false, volume: 0.8, restartSeq: 0 }),
  });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fromRemote = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.type === "state") {
        fromRemote.current = true;
        setState(e.data.state);
      } else if (e.data?.type === "hello") {
        ch.postMessage({ type: "state-reply", state: stateRef.current });
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
    channelRef.current?.postMessage({ type: "state", state });
  }, [state]);

  const setQuiz = useCallback((quiz: LoadedQuizPackage | null) => {
    setState((s) => {
      if (s.quiz && s.quiz !== quiz) revokeQuizPackage(s.quiz);
      return { ...s, quiz, currentQuestionIndex: 0, ...freshQuestionState(s.audio, quiz?.questions[0]) };
    });
  }, []);

  const goToQuestion = useCallback((i: number) => {
    setState((s) => {
      const max = (s.quiz?.questions.length ?? 1) - 1;
      const idx = Math.max(0, Math.min(max, i));
      return { ...s, currentQuestionIndex: idx, ...freshQuestionState(s.audio, s.quiz?.questions[idx]) };
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

  const setPhase = useCallback((phase: Phase) => {
    setState((s) => {
      const timer = phase !== "guessing" && s.timer.running
        ? { ...s.timer, running: false, remainingMs: timerRemainingMs(s.timer), endsAt: null }
        : s.timer;
      return { ...s, phase, timer, mosaicAuto: phase === "guessing" ? s.mosaicAuto : false };
    });
  }, []);

  const value: QuizContextValue = {
    ...state,
    setQuiz,
    goToQuestion,
    nextQuestion: () => goToQuestion(state.currentQuestionIndex + 1),
    prevQuestion: () => goToQuestion(state.currentQuestionIndex - 1),
    setPhase,
    addTeam: (name) =>
      setState((s) => ({ ...s, teams: [...s.teams, { id: crypto.randomUUID(), name, score: 0 }] })),
    removeTeam: (id) => setState((s) => ({ ...s, teams: s.teams.filter((t) => t.id !== id) })),
    adjustScore: (id, delta) =>
      setState((s) => ({
        ...s,
        teams: s.teams.map((t) => (t.id === id ? { ...t, score: t.score + delta } : t)),
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
    toggleTimer: () =>
      setState((s) => {
        if (!s.timer.enabled) return s;
        if (s.timer.running) {
          return { ...s, timer: { ...s.timer, running: false, endsAt: null, remainingMs: timerRemainingMs(s.timer) } };
        }
        if (s.timer.remainingMs <= 0) return s;
        return { ...s, phase: "guessing", timer: { ...s.timer, running: true, endsAt: Date.now() + s.timer.remainingMs } };
      }),
    resetTimer: () =>
      setState((s) => {
        const q = s.quiz?.questions[s.currentQuestionIndex];
        const t = initialTimer(q);
        return { ...s, timer: { ...t, running: false, endsAt: null } };
      }),
    addTime: (sec) =>
      setState((s) => {
        if (!s.timer.enabled) return s;
        const add = sec * 1000;
        return {
          ...s,
          timer: s.timer.running && s.timer.endsAt
            ? { ...s.timer, endsAt: s.timer.endsAt + add }
            : { ...s.timer, remainingMs: s.timer.remainingMs + add },
        };
      }),
    playSfx: (kind) => setState((s) => ({ ...s, sfx: { kind, seq: s.sfx.seq + 1 } })),
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error("useQuiz must be used inside QuizProvider");
  return ctx;
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
