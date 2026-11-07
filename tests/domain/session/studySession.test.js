import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudySession } from '../../../src/domain/session/studySession.js';
import { review } from '../../../src/domain/fsrs/scheduler.js';
import { CardState } from '../../../src/domain/card/cardProgress.js';
import { Grade } from '../../../src/domain/grading/grade.js';
import { MINUTE_MS } from '../../../src/domain/fsrs/parameters.js';

const NOW = Date.UTC(2026, 10, 7, 9, 0, 0);
const card = (id) => ({ id, front: id, reading: '', back: id });
const schedule = (p, g, t) => review(p, g, t);
const fresh = (...ids) => ids.map((id) => ({ card: card(id), progress: null }));

test('current/flip/answer basic flow', () => {
  const s = createStudySession(fresh('a', 'b'), schedule);
  assert.equal(s.current(NOW).card.id, 'a');
  assert.equal(s.isFlipped(), false);
  assert.equal(s.flip(), true);
  assert.equal(s.isFlipped(), true);
  const r = s.answer(Grade.EASY, NOW);
  assert.equal(r.card.id, 'a');
  assert.equal(r.wasNew, true);
  assert.equal(r.requeued, false);
  assert.equal(r.progress.state, CardState.REVIEW);
  assert.equal(s.isFlipped(), false, 'flip resets on next card');
  assert.equal(s.current(NOW).card.id, 'b');
});

test('Again re-queues the card; it waits until due while other cards remain', () => {
  const s = createStudySession(fresh('a', 'b', 'c'), schedule);
  const r = s.answer(Grade.AGAIN, NOW);
  assert.equal(r.requeued, true);
  assert.equal(s.remaining(), 3);
  assert.equal(s.current(NOW + 1000).card.id, 'b');
  s.answer(Grade.EASY, NOW + 1000);
  // 'a' is due at NOW+1m; at NOW+2s it is not due yet → 'c' first
  assert.equal(s.current(NOW + 2000).card.id, 'c');
  // ...but once due it jumps ahead of remaining main cards
  assert.equal(s.current(NOW + 61_000).card.id, 'a');
});

test('learning card is shown early when nothing else is left', () => {
  const s = createStudySession(fresh('a'), schedule);
  s.answer(Grade.AGAIN, NOW);                       // due NOW+1m
  assert.equal(s.current(NOW + 5000).card.id, 'a');  // shown early
  s.answer(Grade.GOOD, NOW + 5000);                  // step 0 → step 1 (same day: short-term S)
  assert.equal(s.remaining(), 1);
  s.answer(Grade.GOOD, NOW + 15 * MINUTE_MS);        // graduates
  assert.equal(s.remaining(), 0);
  assert.equal(s.current(NOW), null);
  assert.equal(s.answer(Grade.GOOD, NOW), null);
});

test('same card is not shown twice in a row when another learning card exists', () => {
  const s = createStudySession(fresh('a', 'b'), schedule);
  s.answer(Grade.AGAIN, NOW);          // a due NOW+1m
  s.answer(Grade.AGAIN, NOW + 500);    // b due NOW+1m+0.5s
  const t = NOW + 2 * MINUTE_MS;       // both due; last shown was b → a first
  assert.equal(s.current(t).card.id, 'a');
  s.answer(Grade.AGAIN, t);            // a due t+1m, last shown a
  assert.equal(s.current(t + 2 * MINUTE_MS).card.id, 'b');
});

test('summary counts answers per grade and unique cards', () => {
  const s = createStudySession(fresh('a', 'b'), schedule);
  s.answer(Grade.AGAIN, NOW);
  s.answer(Grade.HARD, NOW);
  const t = NOW + 2 * MINUTE_MS;
  s.answer(Grade.GOOD, t);
  s.answer(Grade.EASY, t);
  const sum = s.summary();
  assert.equal(sum.answered, 4);
  assert.equal(sum.cardsSeen, 2);
  assert.deepEqual([sum.again, sum.hard, sum.good, sum.easy], [1, 1, 1, 1]);
});

test('learning list is ordered by due time', () => {
  const s = createStudySession(fresh('x', 'y', 'z'), schedule);
  s.answer(Grade.GOOD, NOW);           // x due NOW+10m
  s.answer(Grade.AGAIN, NOW + 1000);   // y due NOW+1m+1s
  s.answer(Grade.EASY, NOW + 2000);    // z graduates
  assert.equal(s.current(NOW + 20 * MINUTE_MS).card.id, 'y');
});

test('current() without a time treats every learning card as due', () => {
  const s = createStudySession(fresh('a', 'b'), schedule);
  s.answer(Grade.AGAIN, NOW);
  assert.equal(s.current().card.id, 'b'); // a was just shown → b
});
