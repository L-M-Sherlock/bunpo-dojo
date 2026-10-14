export type Option = {
  id: string;
  text: string;
  reading: string;
  verdict: "correct" | "meaning-mismatch" | "ungrammatical";
  explanation: string;
};
export type Part = { text: string; reading?: string };
export type Card = {
  id: string;
  module: string;
  courseId: string;
  skillId: string;
  familyId: string;
  lexicalKey: string;
  scene: string;
  exerciseType?: "verb-role";
  focusVerb?: { text: string; reading: string };
  before: Part[];
  after: Part[];
  options: Option[];
  answerIds: string[];
  translation: string;
  explanation: string;
  hint: string;
  sourceIds: string[];
  review: string;
};
export type Mode = "practice" | "challenge";
export type AnswerMode = "choice" | "input";
export type SelectionReason =
  | "retest"
  | "spacing"
  | "unmastered"
  | "consolidation"
  | "continuation";
export type SkillStats = {
  attempts: number;
  correct: number;
  accuracy: number | null;
  confidence: number;
  scenes: string[];
  coverage: string[];
  lexical: string[];
};
export type Pending = {
  key: string;
  skillId: string;
  trackedSkillId: string;
  familyId: string;
  queue: Mode;
  failures: number;
  lastExposureOrdinal: number;
  lastCardId: string;
  lastLexicalKey: string;
};
export type Result = {
  correct: boolean;
  kind: string;
  optionId: string | null;
  independent: boolean;
  retest: boolean;
};
export type Session = {
  mode: Mode;
  courses: string[];
  answerMode: AnswerMode;
  cardId: string;
  questionId: string;
  index: number;
  answered: number;
  correct: number;
  recent: string[];
  answer: string;
  hint: boolean;
  result: Result | null;
  finished: boolean;
  selectionReason: SelectionReason;
  learningRound: boolean;
};
export type Event = {
  id: string;
  questionId: string;
  at: string;
  cardId: string;
  skillId: string;
  trackedSkillId: string;
  courseId: string;
  mode: Mode;
  answerMode: AnswerMode;
  answer: string;
  correct: boolean;
  kind: string;
  independent: boolean;
  retest: boolean;
  hintUsed: boolean;
  revealed: boolean;
};
export type Counters = Record<string, number>;
export type Statistics = {
  questions: number;
  correct: number;
  independent: number;
  independentCorrect: number;
  assisted: number;
  retests: number;
  retestCorrect: number;
  activeMs: number;
  days: Record<string, Counters>;
  courses: Record<string, Counters>;
  errors: Record<string, number>;
  input: number;
  choice: number;
};
export type Profile = {
  version: number;
  catalogVersion: number;
  bySkill: Record<string, SkillStats>;
  assisted: Record<string, { attempts: number; correct: number }>;
  pending: Record<string, Pending>;
  suspended: Record<string, Pending>;
  originalCount: number;
  events: Event[];
  statistics: Statistics;
  session: Session | null;
  preferences: { reading: boolean; answerMode: AnswerMode };
  rotation: number;
  recentCardIds: string[];
  recentLexicalKeys: string[];
};
