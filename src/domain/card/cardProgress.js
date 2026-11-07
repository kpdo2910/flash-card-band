/**
 * CardProgress value object: everything FSRS needs to schedule one card.
 * Serialised as a compact array so hundreds of cards fit in band storage.
 */

export var CardState = {
  NEW: 0,
  LEARNING: 1,
  REVIEW: 2,
  RELEARNING: 3
};

export function newProgress() {
  return {
    state: CardState.NEW,
    step: 0,
    due: 0,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReview: 0
  };
}

export function isNew(progress) {
  return !progress || progress.state === CardState.NEW;
}

export function isDue(progress, nowMs) {
  if (!progress || progress.state === CardState.NEW) return false;
  return progress.due <= nowMs;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/** → [due, S, D, state, step, reps, lapses, lastReview] */
export function serializeProgress(p) {
  return [
    p.due,
    round4(p.stability),
    round4(p.difficulty),
    p.state,
    p.step,
    p.reps,
    p.lapses,
    p.lastReview
  ];
}

/** Returns null when the array is malformed. */
export function deserializeProgress(arr) {
  if (!Array.isArray(arr) || arr.length < 8) return null;
  for (var i = 0; i < 8; i++) {
    if (typeof arr[i] !== 'number' || !isFinite(arr[i])) return null;
  }
  return {
    due: arr[0],
    stability: arr[1],
    difficulty: arr[2],
    state: arr[3],
    step: arr[4],
    reps: arr[5],
    lapses: arr[6],
    lastReview: arr[7]
  };
}
