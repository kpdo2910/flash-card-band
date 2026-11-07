/**
 * Maps a swipe gesture plus the time the learner needed into an FSRS grade.
 *
 * Swiping in the "known" direction:
 *   elapsed <= thrEasy  → Easy
 *   elapsed <= thrGood  → Good
 *   elapsed <= thrHard  → Hard
 *   otherwise           → Again (took too long to recall)
 * Swiping in the opposite direction → Again.
 * Any other direction → null (not an answer).
 */
import { Grade } from './grade.js';

export var SwipeDirection = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right'
};

export function oppositeDirection(direction) {
  if (direction === SwipeDirection.UP) return SwipeDirection.DOWN;
  if (direction === SwipeDirection.DOWN) return SwipeDirection.UP;
  if (direction === SwipeDirection.LEFT) return SwipeDirection.RIGHT;
  return SwipeDirection.LEFT;
}

/**
 * @param {number} elapsedMs time from card shown to the swipe
 * @param {{thrEasy:number, thrGood:number, thrHard:number}} thresholds in seconds
 */
export function gradeFromElapsed(elapsedMs, thresholds) {
  var sec = elapsedMs / 1000;
  if (sec <= thresholds.thrEasy) return Grade.EASY;
  if (sec <= thresholds.thrGood) return Grade.GOOD;
  if (sec <= thresholds.thrHard) return Grade.HARD;
  return Grade.AGAIN;
}

/**
 * @param {string} direction swipe direction reported by the platform
 * @param {number} elapsedMs
 * @param {{thrEasy:number, thrGood:number, thrHard:number, knownDirection:string}} settings
 * @returns {number|null} Grade or null when the swipe is not an answer
 */
export function gradeFromSwipe(direction, elapsedMs, settings) {
  var known = settings.knownDirection || SwipeDirection.UP;
  if (direction === known) return gradeFromElapsed(elapsedMs, settings);
  if (direction === oppositeDirection(known)) return Grade.AGAIN;
  return null;
}
