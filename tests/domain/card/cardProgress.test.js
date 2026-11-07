import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CardState,
  newProgress,
  isNew,
  isDue,
  serializeProgress,
  deserializeProgress
} from '../../../src/domain/card/cardProgress.js';

test('newProgress is New and never due', () => {
  const p = newProgress();
  assert.equal(p.state, CardState.NEW);
  assert.ok(isNew(p));
  assert.ok(isNew(null));
  assert.ok(!isDue(p, Date.now()));
  assert.ok(!isDue(null, Date.now()));
});

test('isDue compares due with now for non-new cards', () => {
  const p = { ...newProgress(), state: CardState.REVIEW, due: 1000 };
  assert.ok(isDue(p, 1000));
  assert.ok(isDue(p, 5000));
  assert.ok(!isDue(p, 999));
});

test('serialize/deserialize round-trip with 4-decimal rounding of S and D', () => {
  const p = {
    due: 1762500000000, stability: 12.3456789, difficulty: 5.00004,
    state: CardState.REVIEW, step: 0, reps: 7, lapses: 1, lastReview: 1762400000000
  };
  const arr = serializeProgress(p);
  assert.equal(arr.length, 8);
  const back = deserializeProgress(arr);
  assert.equal(back.stability, 12.3457);
  assert.equal(back.difficulty, 5);
  assert.equal(back.due, p.due);
  assert.equal(back.reps, 7);
  assert.equal(back.lapses, 1);
  assert.equal(back.state, CardState.REVIEW);
});

test('deserialize rejects malformed input', () => {
  assert.equal(deserializeProgress(null), null);
  assert.equal(deserializeProgress([1, 2, 3]), null);
  assert.equal(deserializeProgress([1, 2, 3, 4, 5, 6, 7, 'x']), null);
  assert.equal(deserializeProgress([1, NaN, 3, 4, 5, 6, 7, 8]), null);
});
