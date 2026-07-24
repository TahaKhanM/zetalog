import { parseProblem, solve } from './problems';
import type { GameEvent } from './schemas';

/** One problem the player advanced past, with timing and verification. */
export interface ProblemOutcome {
  readonly text: string;
  readonly shownAt: number;
  readonly acceptedAt: number;
  readonly solveMs: number;
  /** True iff the final input value equals the true answer, and the reported answer agrees. */
  readonly verified: boolean;
}

/** An event-stream irregularity. Any anomaly is a consistency violation downstream. */
export interface ScoreAnomaly {
  readonly kind: 'accepted-without-problem' | 'unparseable-problem' | 'answer-mismatch';
  readonly at: number;
}

/** The server-side truth recomputed from raw events. */
export interface RecomputedScore {
  /** Count of verified outcomes — the only score that ranks. */
  readonly score: number;
  readonly outcomes: readonly ProblemOutcome[];
  readonly anomalies: readonly ScoreAnomaly[];
  /** Gaps between consecutive input events across the whole game, for cadence analysis. */
  readonly inputIntervalsMs: readonly number[];
  /** Input events whose value grew by more than one character — paste-like entry. */
  readonly entryBursts: number;
}

/**
 * Replay an event stream and recompute the score from first principles.
 * Total function: malformed streams produce anomalies, never throws.
 */
export function recomputeScore(events: readonly GameEvent[]): RecomputedScore {
  let current: { readonly text: string; readonly at: number } | null = null;
  let lastValue = '';
  let lastInputAt: number | null = null;
  let entryBursts = 0;
  const outcomes: ProblemOutcome[] = [];
  const anomalies: ScoreAnomaly[] = [];
  const inputIntervalsMs: number[] = [];

  for (const event of events) {
    switch (event.kind) {
      case 'problem': {
        current = { text: event.text, at: event.at };
        lastValue = '';
        break;
      }
      case 'input': {
        if (lastInputAt !== null) inputIntervalsMs.push(event.at - lastInputAt);
        lastInputAt = event.at;
        if (event.value.length - lastValue.length > 1) entryBursts += 1;
        lastValue = event.value;
        break;
      }
      case 'accepted': {
        if (current === null) {
          anomalies.push({ kind: 'accepted-without-problem', at: event.at });
          break;
        }
        const parsed = parseProblem(current.text);
        if (!parsed.ok) {
          anomalies.push({ kind: 'unparseable-problem', at: event.at });
        } else {
          const answer = solve(parsed.value);
          const verified = lastValue.trim() === String(answer) && event.answer === answer;
          if (!verified) anomalies.push({ kind: 'answer-mismatch', at: event.at });
          outcomes.push({
            text: current.text,
            shownAt: current.at,
            acceptedAt: event.at,
            solveMs: event.at - current.at,
            verified,
          });
        }
        current = null;
        lastValue = '';
        break;
      }
    }
  }

  return {
    score: outcomes.filter((outcome) => outcome.verified).length,
    outcomes,
    anomalies,
    inputIntervalsMs,
    entryBursts,
  };
}
