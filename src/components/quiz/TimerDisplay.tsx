import { useEffect, useRef } from "react";
import { useQuiz, useTimerSeconds } from "@/context/QuizContext";
import { playTick } from "@/utils/soundEffects";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Stage timer: large countdown + bar, red pulse & ticking in the last 5 s. */
export function StageTimer() {
  const { timer, quiz, currentQuestionIndex } = useQuiz();
  const secs = useTimerSeconds(timer);
  const total = quiz?.questions[currentQuestionIndex]?.timing.timeLimitSeconds ?? 1;
  const last = useRef(secs);
  const warn = timer.enabled && secs <= 5 && secs > 0;

  useEffect(() => {
    if (timer.running && warn && secs !== last.current) playTick();
    last.current = secs;
  }, [secs, warn, timer.running]);

  if (!timer.enabled) return null;
  return (
    <div className="absolute left-8 top-8 w-56">
      <p className={`font-mono text-6xl font-extrabold tabular-nums ${warn ? "animate-pulse text-destructive" : secs === 0 ? "text-muted-foreground" : "text-foreground"}`}>
        {fmt(secs)}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full transition-all duration-200 ${warn ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, (secs / total) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Admin timer controls; also auto-locks the round when time is up. */
export function AdminTimer() {
  const q = useQuiz();
  const secs = useTimerSeconds(q.timer);

  useEffect(() => {
    if (q.timer.running && secs === 0 && q.phase === "guessing") q.setPhase("locked");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, q.timer.running, q.phase]);

  if (!q.timer.enabled) return <span className="text-sm text-muted-foreground">Kein Timer</span>;
  const btn = "rounded-lg bg-secondary px-3 py-2 font-semibold hover:bg-muted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`w-20 font-mono text-2xl font-bold tabular-nums ${secs <= 5 ? "text-destructive" : ""}`}>{fmt(secs)}</span>
      <button className={btn} onClick={q.toggleTimer}>{q.timer.running ? "⏸ Pause" : "▶ Start"}</button>
      <button className={btn} onClick={q.resetTimer}>↺ Reset</button>
      <button className={btn} onClick={() => q.addTime(10)}>+10s</button>
    </div>
  );
}
