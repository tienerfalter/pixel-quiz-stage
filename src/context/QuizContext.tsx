import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { LoadedQuizPackage, RoundStatus, Team } from "@/types/quiz";
import { revokeQuizPackage } from "@/utils/quizPackageLoader";

interface SyncState {
  quiz: LoadedQuizPackage | null;
  currentQuestionIndex: number;
  roundStatus: RoundStatus;
  teams: Team[];
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
}

const QuizContext = createContext<QuizContextValue | null>(null);

const DEFAULT_TEAMS: Team[] = [
  { id: "t1", name: "Team Rot", score: 0 },
  { id: "t2", name: "Team Blau", score: 0 },
];

const CHANNEL = "quiz-sync";

/**
 * Global quiz state. Synced between tabs (admin / display / play) of the same
 * browser via BroadcastChannel. Blob URLs stay valid as long as the admin tab
 * that loaded the package is open.
 */
export function QuizProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SyncState>({
    quiz: null,
    currentQuestionIndex: 0,
    roundStatus: "idle",
    teams: DEFAULT_TEAMS,
  });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fromRemote = useRef(false);

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

  const stateRef = useRef(state);
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
      return { ...s, quiz, currentQuestionIndex: 0, roundStatus: "idle" };
    });
  }, []);

  const goToQuestion = useCallback((i: number) => {
    setState((s) => {
      const max = (s.quiz?.questions.length ?? 1) - 1;
      return { ...s, currentQuestionIndex: Math.max(0, Math.min(max, i)), roundStatus: "idle" };
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
  };

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz() {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error("useQuiz must be used inside QuizProvider");
  return ctx;
}
