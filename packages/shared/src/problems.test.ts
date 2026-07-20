import { describe, expect, it } from 'vitest';

import { parseProblem, solve } from './problems.js';

describe('parseProblem', () => {
  it.each([
    ['34 + 66 = ', { left: 34, op: '+', right: 66 }],
    ['91 – 4 =', { left: 91, op: '-', right: 4 }],
    ['91 − 4', { left: 91, op: '-', right: 4 }],
    ['7 × 12 = ', { left: 7, op: '*', right: 12 }],
    ['96 ÷ 12 = ', { left: 96, op: '/', right: 12 }],
    ['3*4', { left: 3, op: '*', right: 4 }],
  ])('parses %j', (text, expected) => {
    expect(parseProblem(text)).toEqual({ ok: true, value: expected });
  });

  it.each(['', 'hello', '3 +', '+ 4', '3 ? 4', '3 + 4 + 5'])('rejects %j as malformed', (text) => {
    expect(parseProblem(text)).toEqual({ ok: false, error: { reason: 'malformed', text } });
  });
});

describe('solve', () => {
  it.each([
    [{ left: 34, op: '+', right: 66 }, 100],
    [{ left: 91, op: '-', right: 4 }, 87],
    [{ left: 7, op: '*', right: 12 }, 84],
    [{ left: 96, op: '/', right: 12 }, 8],
  ] as const)('solves %j to %d', (problem, answer) => {
    expect(solve(problem)).toBe(answer);
  });
});
