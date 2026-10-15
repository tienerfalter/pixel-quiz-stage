import { useEffect } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { useQuiz, useTimerSeconds } from "@/context/QuizContext";
import type { QuizQuestion } from "@/types/quiz";
import { questionAudioSource } from "@/lib/quizPresentation";

const btn = "rounded-lg bg-secondary px-4 py-2 font-semibold hover:bg-muted disabled:opacity-40";

/** Type-specific host controls (audio, mosaic, clue ladder). */
export function QuestionControls({ question }: { question: QuizQuestion }) {
  const q = useQuiz();

  const isMosaic = question.type === "mosaic";
  const tiles = isMosaic ? (question.grid?.rows || 4) * (question.grid?.cols || 4) : 0;
  const secs = useTimerSeconds(q.timer);
  const isLadder = question.type === "clue_ladder";
  const clueCount = isLadder ? (question.clues?.length ?? 0) : 0;
  const totalSec = question.timing?.hasTimer ? question.timing.timeLimitSeconds || 0 : 0;

  // Clue ladder with timer: split time evenly across clues, auto-reveal on schedule.
  useEffect(() => {
    if (!isLadder || !totalSec || !clueCount || !q.timer.enabled || q.phase !== "guessing") return;
    const elapsed = totalSec - secs;
    const target = Math.min(clueCount, 1 + Math.floor(elapsed / (totalSec / clueCount)));
    if (target > q.revealedClues) q.revealNextClue(clueCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, isLadder, totalSec, clueCount, q.revealedClues, q.phase]);
  const interval = isMosaic ? (question.intervalSeconds ?? 3) : 0;

  // Auto-reveal timer runs in the admin tab only (single source of truth).
  useEffect(() => {
    if (!isMosaic || !q.mosaicAuto) return;
    const id = setInterval(() => q.revealRandomTile(tiles), interval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMosaic, q.mosaicAuto, tiles, interval]);

  return (
    <div className="mt-4 space-y-3">
      {questionAudioSource(question) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-3">
          <span className="text-sm font-semibold text-muted-foreground">Audio</span>
          <button className={btn} onClick={() => q.setAudio({ playing: true })}><Play className="inline h-4 w-4" /> Play</button>
          <button className={btn} onClick={() => q.setAudio({ playing: false })}><Pause className="inline h-4 w-4" /> Pause</button>
          <button className={btn} onClick={q.restartAudio}><RotateCcw className="inline h-4 w-4" /> Von vorn</button>
          <label className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            <input type="range" min={0} max={1} step={0.05} value={q.audio.volume}
              onChange={(e) => q.setAudio({ volume: Number(e.target.value) })} className="accent-primary" />
          </label>
          <span className="text-xs text-muted-foreground">{q.audio.playing ? "spielt" : "pausiert"}</span>
        </div>
      )}

      {isMosaic && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-3">
          <span className="text-sm font-semibold text-muted-foreground">Mosaik {q.revealedTiles.length}/{tiles}</span>
          {question.revealMode === "manual" ? (
            <button className={btn} disabled={q.revealedTiles.length >= tiles} onClick={() => q.revealRandomTile(tiles)}>+ Nächste Kachel aufdecken</button>
          ) : q.phase !== "guessing" ? null : (
            <button className={btn} disabled={q.revealedTiles.length >= tiles} onClick={() => q.setMosaicAuto(!q.mosaicAuto)}>
              {q.mosaicAuto ? "⏸ Auto-Aufdecken pausieren" : `▶ Auto-Aufdecken starten (${interval}s)`}
            </button>
          )}
          <button className={btn} onClick={() => q.revealAllTiles(tiles)}>Alles aufdecken</button>
        </div>
      )}

      {question.type === "clue_ladder" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 p-3">
          <span className="text-sm font-semibold text-muted-foreground">Hinweis {q.revealedClues}/{question.clues.length}</span>
          <button className={btn} disabled={q.revealedClues >= question.clues.length} onClick={() => q.revealNextClue(question.clues.length)}>Nächsten Hinweis aufdecken</button>
          <button className={btn} onClick={() => q.revealAllClues(question.clues.length)}>Alle aufdecken</button>
        </div>
      )}
    </div>
  );
}
