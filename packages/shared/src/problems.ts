import { err, ok, type Result } from './result.js';

/** A canonical arithmetic operation, normalised from whatever glyph Zetamac rendered. */
export type Operator = '+' | '-' | '*' | '/';

/** A parsed Zetamac problem, e.g. "34 + 66 = " → { left: 34, op: '+', right: 66 }. */
export interface Problem {
  readonly left: number;
  readonly op: Operator;
  readonly right: number;
}

/** The typed failure returned when scraped text does not look like a binary problem. */
export interface ProblemParseError {
  readonly reason: 'malformed';
  readonly text: string;
}

/**
 * Matches "<int> <op> <int>" with an optional trailing "= ". The operator is
 * captured loosely (any single non-space character) so unknown symbols fail
 * at the alias lookup below rather than silently not matching.
 */
const PROBLEM_PATTERN = /^\s*(\d+)\s*(\S)\s*(\d+)\s*=?\s*$/u;

/** Maps every glyph Zetamac may render to a canonical operator. */
const OPERATOR_ALIASES: Readonly<Record<string, Operator>> = {
  '+': '+',
  '-': '-',
  '−': '-', // minus sign
  '–': '-', // en dash
  '*': '*',
  x: '*',
  '×': '*', // multiplication sign
  '/': '/',
  '÷': '/', // division sign
};

/**
 * Parse a problem as displayed by Zetamac. Returns a typed error for any
 * text the recorder scraped that does not look like a binary problem — the
 * caller records it as an anomaly, never guesses.
 */
export function parseProblem(text: string): Result<Problem, ProblemParseError> {
  const match = PROBLEM_PATTERN.exec(text);
  const leftRaw = match?.[1];
  const opRaw = match?.[2];
  const rightRaw = match?.[3];
  if (leftRaw === undefined || opRaw === undefined || rightRaw === undefined) {
    return err({ reason: 'malformed', text });
  }
  const op = OPERATOR_ALIASES[opRaw];
  if (op === undefined) {
    return err({ reason: 'malformed', text });
  }
  return ok({ left: Number(leftRaw), op, right: Number(rightRaw) });
}

/** The unique correct answer to a problem. Division on Zetamac is always exact. */
export function solve(problem: Problem): number {
  switch (problem.op) {
    case '+':
      return problem.left + problem.right;
    case '-':
      return problem.left - problem.right;
    case '*':
      return problem.left * problem.right;
    case '/':
      return problem.left / problem.right;
  }
}
