import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecallTimer } from '../../../src/domain/grading/recallTimer.js';
import { gradeFromSwipe, SwipeDirection } from '../../../src/domain/grading/gradingPolicy.js';
import { Grade } from '../../../src/domain/grading/grade.js';

const S = { thrEasy: 5, thrGood: 10, thrHard: 15, knownDirection: SwipeDirection.UP };

test('runs from the start time until frozen', () => {
  const t = createRecallTimer(1000);
  assert.equal(t.isRunning(), true);
  assert.equal(t.elapsed(1000), 0);
  assert.equal(t.elapsed(4200), 3200);
  assert.equal(t.freeze(4200), 3200);
  assert.equal(t.isRunning(), false);
  // reading the back for a long time does not add up
  assert.equal(t.elapsed(60000), 3200);
});

test('only the first freeze counts', () => {
  const t = createRecallTimer(0);
  t.freeze(3000);
  assert.equal(t.freeze(9000), 3000);
  assert.equal(t.elapsed(9000), 3000);
});

test('clock never goes negative', () => {
  const t = createRecallTimer(5000);
  assert.equal(t.elapsed(4000), 0);
  assert.equal(t.freeze(4000), 0);
  assert.equal(t.elapsed(99999), 0);
});

test('flipping at 3 s then swiping up at 12 s is still Easy', () => {
  const t = createRecallTimer(0);
  t.freeze(3000);
  assert.equal(gradeFromSwipe(SwipeDirection.UP, t.elapsed(12000), S), Grade.EASY);
  // without a flip the swipe time itself is graded
  const u = createRecallTimer(0);
  assert.equal(gradeFromSwipe(SwipeDirection.UP, u.elapsed(12000), S), Grade.HARD);
  // the opposite direction is Again regardless of time
  assert.equal(gradeFromSwipe(SwipeDirection.DOWN, t.elapsed(12000), S), Grade.AGAIN);
});
