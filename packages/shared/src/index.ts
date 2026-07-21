export { palette, color, typography, type PaletteColor } from './tokens';
export {
  gameEventSchema,
  gameRecordSchema,
  operandRangeSchema,
  zetamacSettingsSchema,
  type GameEvent,
  type GameRecord,
  type OperandRange,
  type ZetamacSettings,
} from './schemas';
export {
  RANKABLE_DURATIONS,
  ZETAMAC_DEFAULT_SETTINGS,
  fingerprint,
  rankableDuration,
  type RankableDuration,
} from './zetamac';
export { err, ok, type Result } from './result';
export {
  factStats,
  operationStats,
  skillBuckets,
  slowestSolves,
  solvedProblems,
  weakestBuckets,
  type FactStat,
  type OperationStat,
  type SkillBucket,
  type SlowestSolve,
  type SolvedProblem,
} from './analysis';
export {
  recomputeScore,
  type ProblemOutcome,
  type RecomputedScore,
  type ScoreAnomaly,
} from './score';
export {
  OUTLIER_MEDIAN_FRACTION,
  OUTLIER_MIN_HISTORY,
  OUTLIER_WINDOW,
  RESTART_PLAYED_FRACTION,
  evaluateQuarantine,
  type QuarantineInput,
  type QuarantineReason,
} from './quarantine';
export {
  FAST_SOLVE_FLAG_FRACTION,
  MIN_CADENCE_VARIATION,
  MIN_HUMAN_SOLVE_MS,
  MIN_INPUTS_FOR_CADENCE,
  type PhysiologyFlag,
} from './validation/physiology';
export { DURATION_TOLERANCE_MS, type ConsistencyViolation } from './validation/consistency';
export {
  ENTROPY_FALSE_POSITIVE_RATE,
  ENTROPY_MIN_PROBLEMS,
  MARGINAL_FALSE_POSITIVE_RATE,
  MARGINAL_MIN_PROBLEMS,
  MIX_FALSE_POSITIVE_RATE,
  MIX_MIN_PROBLEMS,
  checkProblems,
  producibleUnderSettings,
  type ProblemConformity,
  type ProblemFlag,
  type ProblemViolation,
} from './validation/problems';
export {
  PB_JUMP_ABSOLUTE_MARGIN,
  PB_JUMP_MIN_HISTORY,
  PB_JUMP_RELATIVE_MARGIN,
  type HistoryContext,
} from './validation/history';
export { judge, type ValidationOutcome, type Verdict } from './validation/verdict';
