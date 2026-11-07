import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeFromElapsed,
  gradeFromSwipe,
  oppositeDirection,
  SwipeDirection
} from '../../../src/domain/grading/gradingPolicy.js';
import { Grade } from '../../../src/domain/grading/grade.js';

const T = { thrEasy: 5, thrGood: 10, thrHard: 15 };

test('elapsed → grade bands with default thresholds', () => {
  assert.equal(gradeFromElapsed(0, T), Grade.EASY);
  assert.equal(gradeFromElapsed(5000, T), Grade.EASY);
  assert.equal(gradeFromElapsed(5001, T), Grade.GOOD);
  assert.equal(gradeFromElapsed(10000, T), Grade.GOOD);
  assert.equal(gradeFromElapsed(10001, T), Grade.HARD);
  assert.equal(gradeFromElapsed(15000, T), Grade.HARD);
  assert.equal(gradeFromElapsed(15001, T), Grade.AGAIN);
  assert.equal(gradeFromElapsed(60000, T), Grade.AGAIN);
});

test('custom thresholds are respected', () => {
  const t = { thrEasy: 3, thrGood: 6, thrHard: 10 };
  assert.equal(gradeFromElapsed(3500, t), Grade.GOOD);
  assert.equal(gradeFromElapsed(9000, t), Grade.HARD);
  assert.equal(gradeFromElapsed(11000, t), Grade.AGAIN);
});

test('swipe in known direction grades by time, opposite is Again, sideways is null', () => {
  const s = { ...T, knownDirection: SwipeDirection.UP };
  assert.equal(gradeFromSwipe('up', 2000, s), Grade.EASY);
  assert.equal(gradeFromSwipe('up', 12000, s), Grade.HARD);
  assert.equal(gradeFromSwipe('up', 20000, s), Grade.AGAIN);
  assert.equal(gradeFromSwipe('down', 1000, s), Grade.AGAIN);
  assert.equal(gradeFromSwipe('left', 1000, s), null);
  assert.equal(gradeFromSwipe('right', 1000, s), null);
});

test('known direction can be inverted to down', () => {
  const s = { ...T, knownDirection: SwipeDirection.DOWN };
  assert.equal(gradeFromSwipe('down', 1000, s), Grade.EASY);
  assert.equal(gradeFromSwipe('up', 1000, s), Grade.AGAIN);
});

test('missing knownDirection defaults to up', () => {
  assert.equal(gradeFromSwipe('up', 1000, T), Grade.EASY);
  assert.equal(gradeFromSwipe('down', 1000, T), Grade.AGAIN);
});

test('oppositeDirection', () => {
  assert.equal(oppositeDirection('up'), 'down');
  assert.equal(oppositeDirection('down'), 'up');
  assert.equal(oppositeDirection('left'), 'right');
  assert.equal(oppositeDirection('right'), 'left');
});
