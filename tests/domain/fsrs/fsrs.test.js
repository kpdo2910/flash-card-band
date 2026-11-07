import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialStability,
  initialDifficulty,
  nextDifficulty,
  retrievability,
  stabilityAfterRecall,
  stabilityAfterForget,
  stabilityShortTerm,
  nextIntervalDays
} from '../../../src/domain/fsrs/fsrs.js';
import { DEFAULT_WEIGHTS, curveConstants } from '../../../src/domain/fsrs/parameters.js';
import { Grade } from '../../../src/domain/grading/grade.js';

const W = DEFAULT_WEIGHTS;

test('default weights are the 21 FSRS-6 parameters', () => {
  assert.equal(W.length, 21);
  assert.equal(W[0], 0.212);
  assert.equal(W[20], 0.1542);
});

test('initial stability equals w[G-1]', () => {
  assert.equal(initialStability(Grade.AGAIN), W[0]);
  assert.equal(initialStability(Grade.HARD), W[1]);
  assert.equal(initialStability(Grade.GOOD), W[2]);
  assert.equal(initialStability(Grade.EASY), W[3]);
});

test('initial difficulty decreases with grade and stays in [1,10]', () => {
  const d = [1, 2, 3, 4].map((g) => initialDifficulty(g));
  assert.ok(d[0] > d[1] && d[1] > d[2] && d[2] > d[3]);
  d.forEach((x) => assert.ok(x >= 1 && x <= 10));
  // D0(1) = w4 - e^0 + 1 = w4
  assert.ok(Math.abs(d[0] - W[4]) < 1e-12);
});

test('retrievability is 0.9 after exactly S days and 1 at t=0', () => {
  for (const s of [0.5, 3, 30, 400]) {
    assert.ok(Math.abs(retrievability(s, s) - 0.9) < 1e-9, `S=${s}`);
  }
  assert.equal(retrievability(0, 10), 1);
  assert.ok(retrievability(100, 10) < retrievability(10, 10));
});

test('next interval with retention 0.9 equals stability', () => {
  assert.equal(nextIntervalDays(10, 0.9, 365), 10);
  assert.equal(nextIntervalDays(37.4, 0.9, 365), 37);
});

test('higher desired retention gives shorter intervals', () => {
  assert.ok(nextIntervalDays(20, 0.95, 365) < nextIntervalDays(20, 0.9, 365));
  assert.ok(nextIntervalDays(20, 0.8, 365) > nextIntervalDays(20, 0.9, 365));
});

test('next interval is clamped to [1, maxInterval]', () => {
  assert.equal(nextIntervalDays(0.01, 0.9, 365), 1);
  assert.equal(nextIntervalDays(5000, 0.9, 365), 365);
  assert.equal(nextIntervalDays(Infinity, 0.9, 100), 100);
});

test('difficulty update: Again raises, Easy lowers, result clamped', () => {
  const d = 5;
  assert.ok(nextDifficulty(d, Grade.AGAIN) > d);
  assert.ok(nextDifficulty(d, Grade.EASY) < d);
  assert.ok(nextDifficulty(10, Grade.AGAIN) <= 10);
  assert.ok(nextDifficulty(1, Grade.EASY) >= 1);
});

test('stability after recall: Easy > Good > Hard, all above previous S', () => {
  const D = 5, S = 10, R = 0.9;
  const hard = stabilityAfterRecall(D, S, R, Grade.HARD);
  const good = stabilityAfterRecall(D, S, R, Grade.GOOD);
  const easy = stabilityAfterRecall(D, S, R, Grade.EASY);
  assert.ok(hard > S);
  assert.ok(good > hard);
  assert.ok(easy > good);
});

test('lower retrievability at review time gives a larger stability gain', () => {
  const late = stabilityAfterRecall(5, 10, 0.7, Grade.GOOD);
  const early = stabilityAfterRecall(5, 10, 0.97, Grade.GOOD);
  assert.ok(late > early);
});

test('stability after forgetting is positive and never above previous S', () => {
  for (const S of [0.5, 5, 50, 500]) {
    const s = stabilityAfterForget(5, S, 0.9);
    assert.ok(s > 0);
    assert.ok(s <= S);
  }
});

test('short-term stability never shrinks for Hard or better, shrinks for Again', () => {
  const S = 2;
  assert.ok(stabilityShortTerm(S, Grade.HARD) >= S);
  assert.ok(stabilityShortTerm(S, Grade.GOOD) >= S);
  assert.ok(stabilityShortTerm(S, Grade.EASY) > stabilityShortTerm(S, Grade.GOOD));
  assert.ok(stabilityShortTerm(S, Grade.AGAIN) < S);
});

test('curve constants are derived from w20', () => {
  const c = curveConstants(W);
  assert.equal(c.decay, -W[20]);
  assert.ok(Math.abs(c.factor - (Math.pow(0.9, -1 / W[20]) - 1)) < 1e-12);
});
