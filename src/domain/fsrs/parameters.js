/**
 * FSRS-6 default parameters and shared constants.
 * Source: open-spaced-repetition "The Algorithm" wiki (FSRS-6 section).
 * Pure module: no platform imports.
 */

export var DEFAULT_WEIGHTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
  0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
  1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
];

export var MIN_DIFFICULTY = 1;
export var MAX_DIFFICULTY = 10;
export var MIN_STABILITY = 0.001;

export var DAY_MS = 24 * 60 * 60 * 1000;
export var MINUTE_MS = 60 * 1000;

/** Learning steps (ms) for a brand-new card, same defaults as ts-fsrs ("1m", "10m"). */
export var DEFAULT_LEARNING_STEPS = [1 * MINUTE_MS, 10 * MINUTE_MS];
/** Relearning steps (ms) after a lapse in Review, same default as ts-fsrs ("10m"). */
export var DEFAULT_RELEARNING_STEPS = [10 * MINUTE_MS];

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Decay exponent and forgetting-curve factor derived from w[20] so that R(S, S) = 0.9.
 */
export function curveConstants(w) {
  var decay = -w[20];
  var factor = Math.pow(0.9, 1 / decay) - 1;
  return { decay: decay, factor: factor };
}
