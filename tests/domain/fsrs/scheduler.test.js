import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, previewIntervals } from '../../../src/domain/fsrs/scheduler.js';
import { CardState, newProgress } from '../../../src/domain/card/cardProgress.js';
import { Grade } from '../../../src/domain/grading/grade.js';
import { DAY_MS, MINUTE_MS } from '../../../src/domain/fsrs/parameters.js';

const NOW = Date.UTC(2026, 10, 7, 9, 0, 0);

test('new card + Again → Learning step 0, due in 1 minute', () => {
  const p = review(null, Grade.AGAIN, NOW);
  assert.equal(p.state, CardState.LEARNING);
  assert.equal(p.step, 0);
  assert.equal(p.due, NOW + 1 * MINUTE_MS);
  assert.equal(p.reps, 1);
  assert.equal(p.lapses, 0);
  assert.equal(p.lastReview, NOW);
});

test('new card + Hard → Learning step 0', () => {
  const p = review(newProgress(), Grade.HARD, NOW);
  assert.equal(p.state, CardState.LEARNING);
  assert.equal(p.step, 0);
  assert.equal(p.due, NOW + 1 * MINUTE_MS);
});

test('new card + Good → Learning step 1, due in 10 minutes', () => {
  const p = review(null, Grade.GOOD, NOW);
  assert.equal(p.state, CardState.LEARNING);
  assert.equal(p.step, 1);
  assert.equal(p.due, NOW + 10 * MINUTE_MS);
});

test('new card + Easy → Review immediately with interval >= 1 day', () => {
  const p = review(null, Grade.EASY, NOW);
  assert.equal(p.state, CardState.REVIEW);
  assert.ok(p.due - NOW >= DAY_MS);
  assert.ok(p.stability > 0 && p.difficulty >= 1 && p.difficulty <= 10);
});

test('Learning last step + Good → graduates to Review', () => {
  let p = review(null, Grade.GOOD, NOW); // step 1 (last)
  p = review(p, Grade.GOOD, NOW + 10 * MINUTE_MS);
  assert.equal(p.state, CardState.REVIEW);
  assert.ok(p.due - (NOW + 10 * MINUTE_MS) >= DAY_MS);
  assert.equal(p.reps, 2);
});

test('Learning + Again goes back to step 0; Hard stays on the same step', () => {
  let p = review(null, Grade.GOOD, NOW); // step 1
  const again = review(p, Grade.AGAIN, NOW + MINUTE_MS);
  assert.equal(again.state, CardState.LEARNING);
  assert.equal(again.step, 0);
  const hard = review(p, Grade.HARD, NOW + MINUTE_MS);
  assert.equal(hard.state, CardState.LEARNING);
  assert.equal(hard.step, 1);
});

test('Learning + Easy graduates immediately', () => {
  let p = review(null, Grade.AGAIN, NOW); // step 0
  p = review(p, Grade.EASY, NOW + MINUTE_MS);
  assert.equal(p.state, CardState.REVIEW);
});

test('Review + Again → Relearning step 0 due in 10 minutes, lapses + 1, stability drops', () => {
  let p = review(null, Grade.EASY, NOW);
  const later = p.due; // review exactly when due
  const lapsed = review(p, Grade.AGAIN, later);
  assert.equal(lapsed.state, CardState.RELEARNING);
  assert.equal(lapsed.step, 0);
  assert.equal(lapsed.due, later + 10 * MINUTE_MS);
  assert.equal(lapsed.lapses, 1);
  assert.ok(lapsed.stability < p.stability);
  assert.ok(lapsed.difficulty > p.difficulty);
});

test('Relearning + Good → back to Review', () => {
  let p = review(null, Grade.EASY, NOW);
  p = review(p, Grade.AGAIN, p.due);
  const t = p.due;
  p = review(p, Grade.GOOD, t);
  assert.equal(p.state, CardState.REVIEW);
  assert.ok(p.due - t >= DAY_MS);
});

test('Review + Good grows stability and interval over repeated on-time reviews', () => {
  let p = review(null, Grade.EASY, NOW);
  let lastInterval = 0;
  for (let i = 0; i < 5; i++) {
    const t = p.due;
    const next = review(p, Grade.GOOD, t);
    const interval = next.due - t;
    assert.ok(next.stability > p.stability, `iteration ${i}: stability grows`);
    assert.ok(interval >= lastInterval, `iteration ${i}: interval does not shrink`);
    lastInterval = interval;
    p = next;
  }
});

test('Review ordering: Easy >= Good >= Hard intervals', () => {
  let p = review(null, Grade.EASY, NOW);
  const t = p.due;
  const iv = previewIntervals(p, t);
  assert.ok(iv[Grade.EASY] >= iv[Grade.GOOD]);
  assert.ok(iv[Grade.GOOD] >= iv[Grade.HARD]);
  assert.ok(iv[Grade.AGAIN] < iv[Grade.HARD]);
});

test('same-day Review + Good uses short-term formula (stability does not shrink)', () => {
  const p = review(null, Grade.EASY, NOW);
  const sameDay = review(p, Grade.GOOD, NOW + 60 * MINUTE_MS);
  assert.ok(sameDay.stability >= p.stability);
  assert.equal(sameDay.state, CardState.REVIEW);
});

test('maxIntervalDays option caps the due date', () => {
  let p = review(null, Grade.EASY, NOW, { maxIntervalDays: 3 });
  for (let i = 0; i < 6; i++) p = review(p, Grade.EASY, p.due, { maxIntervalDays: 3 });
  assert.ok(p.due - p.lastReview <= 3 * DAY_MS);
});

test('requestRetention option changes the interval', () => {
  const base = review(null, Grade.EASY, NOW, { requestRetention: 0.9 });
  const strict = review(null, Grade.EASY, NOW, { requestRetention: 0.95 });
  assert.ok(strict.due <= base.due);
});

test('review never mutates its input', () => {
  const p = review(null, Grade.GOOD, NOW);
  const frozen = JSON.stringify(p);
  review(p, Grade.AGAIN, NOW + MINUTE_MS);
  assert.equal(JSON.stringify(p), frozen);
});
