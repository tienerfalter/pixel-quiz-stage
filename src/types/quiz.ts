export type QuestionType = "buzzer" | "choice" | "slider" | "clue_ladder" | "mosaic" | "grid_coords";

export interface QuizOption {
  id: string;
  text: string;
  isCorrect?: boolean;
}

export interface QuestionTiming {
  hasTimer: boolean;
  timeLimitSeconds: number;
  onTimeUpAction: "lock_and_wait" | "auto_reveal" | "show_branding_pause";
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  title: string;
  question: string;
  timing: QuestionTiming;
  points: number;
  penaltyPoints?: number;
  media?: string;
  mediaType?: "image" | "audio";
  hostNotes?: { solution?: string; trivia?: string };
}

export interface BuzzerQuestion extends BaseQuestion {
  type: "buzzer";
  onWrongAnswer: "allow_others" | "end_question";
}

export interface ChoiceQuestion extends BaseQuestion {
  type: "choice";
  options: QuizOption[];
  scoringMode?: "fixed_points" | "speed_bonus";
}

export interface SliderQuestion extends BaseQuestion {
  type: "slider";
  sliderConfig: { min: number; max: number; step?: number; unit?: string };
  correctValue: number;
  scoring?: {
    mode: "closest_wins" | "tolerance_tiers";
    points?: number;
    tiers?: { tolerance: number; points: number }[];
  };
}

export interface ClueLadderQuestion extends BaseQuestion {
  type: "clue_ladder";
  inputMode: "buzzer" | "choice";
  pointsPerLevel: number[];
  clues: string[];
  options?: QuizOption[];
}

export interface MosaicQuestion extends BaseQuestion {
  type: "mosaic";
  media: string;
  grid: { rows: number; cols: number };
  revealMode: "auto" | "manual";
  intervalSeconds?: number;
  pointsPerTier: { maxRevealedPercent: number; points: number }[];
}

export interface GridCoordsQuestion extends BaseQuestion {
  type: "grid_coords";
  media: string;
  grid: { rows: number; cols: number };
  correctCells: string[];
  points: number;
}

export type QuizQuestion =
  | BuzzerQuestion
  | ChoiceQuestion
  | SliderQuestion
  | ClueLadderQuestion
  | MosaicQuestion
  | GridCoordsQuestion;

export interface QuizMeta {
  title: string;
  author: string;
  themeId: string;
  targetScore: number;
  hideScoresLive: boolean;
}

export interface QuizBranding {
  backgroundImage?: string;
  cornerLogo?: string;
  mobileBanner?: string;
}

export interface QuizPackage {
  meta: QuizMeta;
  branding?: QuizBranding;
  questions: QuizQuestion[];
}

export interface LoadedQuizPackage extends QuizPackage {
  /** Map of relative asset path (e.g. "assets/img.png") -> blob URL */
  assetUrls: Record<string, string>;
  sourceFileName: string;
}

export type RoundStatus = "idle" | "running" | "locked" | "resolved";

export interface Team {
  id: string;
  name: string;
  score: number;
}
