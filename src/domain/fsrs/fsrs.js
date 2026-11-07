/**
 * FSRS-6 core formulas. Every function is pure and takes the weight array
 * explicitly so the scheduler (and tests) can swap parameters.
 *
 * Symbols: S = stability (days), D = difficulty [1,10], R = retrievability [0,1],
 * G = grade 1..4 (Again, Hard, Good, Easy), t = elapsed days since last review.
 */
import {
  DEFAULT_WEIGHTS,
  MIN_DIFFICULTY,
  MAX_DIFFICULTY,
  MIN_STABILITY,
  clamp,
  curveConstants
} from './parameters.js';
import { Grade } from '../grading/grade.js';

export function initialStability(grade, w) {
  w = w || DEFAULT_WEIGHTS;
  return Math.max(MIN_STABILITY, w[grade - 1]);
}

export function initialDifficulty(grade, w) {
  w = w || DEFAULT_WEIGHTS;
  var d = w[4] - Math.exp(w[5] * (grade - 1)) + 1;
  return clamp(d, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

export function nextDifficulty(difficulty, grade, w) {
  w = w || DEFAULT_WEIGHTS;
  var delta = -w[6] * (grade - 3);
  var damped = difficulty + delta * (10 - difficulty) / 9;
  var target = initialDifficulty(Grade.EASY, w);
  var reverted = w[7] * target + (1 - w[7]) * damped;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

export function retrievability(elapsedDays, stability, w) {
  w = w || DEFAULT_WEIGHTS;
  if (elapsedDays <= 0) return 1;
  var c = curveConstants(w);
  return Math.pow(1 + c.factor * elapsedDays / stability, c.decay);
}

export function stabilityAfterRecall(difficulty, stability, retr, grade, w) {
  w = w || DEFAULT_WEIGHTS;
  var hardPenalty = grade === Grade.HARD ? w[15] : 1;
  var easyBonus = grade === Grade.EASY ? w[16] : 1;
  var inc = Math.exp(w[8]) *
    (11 - difficulty) *
    Math.pow(stability, -w[9]) *
    (Math.exp(w[10] * (1 - retr)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(MIN_STABILITY, stability * (inc + 1));
}

export function stabilityAfterForget(difficulty, stability, retr, w) {
  w = w || DEFAULT_WEIGHTS;
  var s = w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - retr));
  return Math.max(MIN_STABILITY, Math.min(s, stability));
}

/** Same-day (short-term) review: FSRS-6 formula; never shrinks S when grade >= Hard. */
export function stabilityShortTerm(stability, grade, w) {
  w = w || DEFAULT_WEIGHTS;
  var inc = Math.exp(w[17] * (grade - 3 + w[18])) * Math.pow(stability, -w[19]);
  if (grade >= Grade.HARD && inc < 1) inc = 1;
  return Math.max(MIN_STABILITY, stability * inc);
}

/**
 * Interval in whole days that brings retrievability down to `requestRetention`.
 * Clamped to [1, maxIntervalDays].
 */
export function nextIntervalDays(stability, requestRetention, maxIntervalDays, w) {
  w = w || DEFAULT_WEIGHTS;
  var c = curveConstants(w);
  var days = (stability / c.factor) * (Math.pow(requestRetention, 1 / c.decay) - 1);
  var rounded = Math.round(days);
  if (!isFinite(rounded)) rounded = maxIntervalDays;
  return clamp(rounded, 1, maxIntervalDays);
}
