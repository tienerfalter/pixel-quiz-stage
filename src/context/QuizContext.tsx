import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { LoadedQuizPackage, RoundStatus, Team } from "@/types/quiz";
import { revokeQuizPackage } from "@/utils/quizPackageLoader";

export interface AudioState {
  playing: boolean;
  volume: number;
  /** Incremented to trigger "restart from beginning" */
  restartSeq: number;
}

interface SyncState {
  quiz: LoadedQuizPackage | null;
  currentQuestionIndex: number;
  roundStatus: RoundStatus;
  teams: Team[];
  revealedTiles: number[];
  revealedClues: number;
  mosaicAuto: boolean;
  audio: AudioState;
}

interface QuizContextValue extends SyncState {
  setQuiz: (q: LoadedQuizPackage | null) => void;
  goToQuestion: (i: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  setRoundStatus: (s: RoundStatus) => void;
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
}

const QuizContext = createContext<QuizContextValue | null>(null);

const DEFAULT_TEAMS: Team[] = [
  { id: "t1", name: "Team Rot", score: 0 },
  { id: "t2", name: "Team Blau", score: 0 },
];

const CHANNEL = "quiz-sync";

const freshQuestionState = (audio: AudioState) => ({
  roundStatus: "idle" as RoundStatus,
  revealedTiles: [] as number[],
  revealedClues: 1,
  mosaicAuto: false,
  audio: { ...audio, playing: false },
});

/**
 * Global quiz state. Synced between tabs (admin / display / play) of the same
 * browser via BroadcastChannel.
 */
export function QuizProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SyncState>({
    quiz: null,
    currentQuestionIndex: 0,
    teams: DEFAULT_TEAMS,
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
      return { ...s, quiz, currentQuestionIndex: 0, ...freshQuestionState(s.audio) };
    });
  }, []);

  const goToQuestion = useCallback((i: number) => {
    setState((s) => {
      const max = (s.quiz?.questions.length ?? 1) - 1;
      return { ...s, currentQuestionIndex: Math.max(0, Math.min(max, i)), ...freshQuestionState(s.audio) };
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

  const value: QuizContextValue = {
    ...state,
    setQuiz,
    goToQuestion,
    nextQuestion: () => goToQuestion(state.currentQuestionIndex + 1),
    prevQuestion: () => goToQuestion(state.currentQuestionIndex - 1),
    setRoundStatus: (roundStatus) => setState((s) => ({ ...s, roundStatus })),
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
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error("useQuiz must be used inside QuizProvider");
  return ctx;
}
