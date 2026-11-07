/**
 * FSRS scheduler: state machine New → Learning → Review ⇄ Relearning,
 * with time-based learning steps like ts-fsrs defaults.
 *
 * review(progress, grade, nowMs, options) → new CardProgress (input is not mutated).
 */
import {
  DEFAULT_WEIGHTS,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_RELEARNING_STEPS,
  DAY_MS
} from './parameters.js';
import {
  initialStability,
  initialDifficulty,
  nextDifficulty,
  retrievability,
  stabilityAfterRecall,
  stabilityAfterForget,
  stabilityShortTerm,
  nextIntervalDays
} from './fsrs.js';
import { Grade } from '../grading/grade.js';
import { CardState, newProgress } from '../card/cardProgress.js';

export var DEFAULT_SCHEDULER_OPTIONS = {
  requestRetention: 0.9,
  maxIntervalDays: 365,
  learningSteps: DEFAULT_LEARNING_STEPS,
  relearningSteps: DEFAULT_RELEARNING_STEPS,
  weights: DEFAULT_WEIGHTS
};

function withDefaults(options) {
  var o = {};
  for (var k in DEFAULT_SCHEDULER_OPTIONS) o[k] = DEFAULT_SCHEDULER_OPTIONS[k];
  if (options) for (var j in options) if (options[j] !== undefined) o[j] = options[j];
  return o;
}

function elapsedDays(progress, nowMs) {
  if (!progress.lastReview) return 0;
  return Math.max(0, (nowMs - progress.lastReview) / DAY_MS);
}

function isSameDay(progress, nowMs) {
  return progress.lastReview > 0 && (nowMs - progress.lastReview) < DAY_MS;
}

function toReview(p, stability, nowMs, o) {
  var days = nextIntervalDays(stability, o.requestRetention, o.maxIntervalDays, o.weights);
  p.state = CardState.REVIEW;
  p.step = 0;
  p.stability = stability;
  p.due = nowMs + days * DAY_MS;
  return p;
}

function toStep(p, state, step, stability, steps, nowMs) {
  p.state = state;
  p.step = step;
  p.stability = stability;
  p.due = nowMs + steps[Math.min(step, steps.length - 1)];
  return p;
}

function reviewNew(prev, grade, nowMs, o) {
  var p = clone(prev);
  var w = o.weights;
  p.stability = initialStability(grade, w);
  p.difficulty = initialDifficulty(grade, w);
  if (grade === Grade.EASY || o.learningSteps.length === 0) {
    return toReview(p, p.stability, nowMs, o);
  }
  if (grade === Grade.GOOD) {
    if (o.learningSteps.length === 1) return toReview(p, p.stability, nowMs, o);
    return toStep(p, CardState.LEARNING, 1, p.stability, o.learningSteps, nowMs);
  }
  // Again or Hard: start at the first step.
  return toStep(p, CardState.LEARNING, 0, p.stability, o.learningSteps, nowMs);
}

function reviewInSteps(prev, grade, nowMs, o, steps) {
  var p = clone(prev);
  var w = o.weights;
  var stability = isSameDay(prev, nowMs)
    ? stabilityShortTerm(prev.stability, grade, w)
    : (grade === Grade.AGAIN
      ? stabilityAfterForget(prev.difficulty, prev.stability, retrievability(elapsedDays(prev, nowMs), prev.stability, w), w)
      : stabilityAfterRecall(prev.difficulty, prev.stability, retrievability(elapsedDays(prev, nowMs), prev.stability, w), grade, w));
  p.difficulty = nextDifficulty(prev.difficulty, grade, w);

  if (grade === Grade.AGAIN) {
    return toStep(p, prev.state, 0, stability, steps, nowMs);
  }
  if (grade === Grade.HARD) {
    // Stay on the current step.
    return toStep(p, prev.state, prev.step, stability, steps, nowMs);
  }
  if (grade === Grade.GOOD) {
    var next = prev.step + 1;
    if (next >= steps.length) return toReview(p, stability, nowMs, o);
    return toStep(p, prev.state, next, stability, steps, nowMs);
  }
  return toReview(p, stability, nowMs, o); // Easy graduates immediately.
}

function reviewReview(prev, grade, nowMs, o) {
  var p = clone(prev);
  var w = o.weights;
  var t = elapsedDays(prev, nowMs);
  var r = retrievability(t, prev.stability, w);
  p.difficulty = nextDifficulty(prev.difficulty, grade, w);
  if (grade === Grade.AGAIN) {
    p.lapses = prev.lapses + 1;
    var sForget = isSameDay(prev, nowMs)
      ? stabilityShortTerm(prev.stability, grade, w)
      : stabilityAfterForget(prev.difficulty, prev.stability, r, w);
    if (o.relearningSteps.length === 0) return toReview(p, sForget, nowMs, o);
    return toStep(p, CardState.RELEARNING, 0, sForget, o.relearningSteps, nowMs);
  }
  var s = isSameDay(prev, nowMs)
    ? stabilityShortTerm(prev.stability, grade, w)
    : stabilityAfterRecall(prev.difficulty, prev.stability, r, grade, w);
  return toReview(p, s, nowMs, o);
}

function clone(p) {
  return {
    state: p.state,
    step: p.step,
    due: p.due,
    stability: p.stability,
    difficulty: p.difficulty,
    reps: p.reps,
    lapses: p.lapses,
    lastReview: p.lastReview
  };
}

/**
 * Apply one review. `progress` may be null/undefined for a card never seen.
 */
export function review(progress, grade, nowMs, options) {
  var o = withDefaults(options);
  var prev = progress || newProgress();
  var next;
  switch (prev.state) {
    case CardState.LEARNING:
      next = reviewInSteps(prev, grade, nowMs, o, o.learningSteps);
      break;
    case CardState.RELEARNING:
      next = reviewInSteps(prev, grade, nowMs, o, o.relearningSteps);
      break;
    case CardState.REVIEW:
      next = reviewReview(prev, grade, nowMs, o);
      break;
    default:
      next = reviewNew(prev, grade, nowMs, o);
  }
  next.reps = prev.reps + 1;
  next.lastReview = nowMs;
  return next;
}

/** Convenience for UI previews: interval (days) a Review-state card would get per grade. */
export function previewIntervals(progress, nowMs, options) {
  var out = {};
  var grades = [Grade.AGAIN, Grade.HARD, Grade.GOOD, Grade.EASY];
  for (var i = 0; i < grades.length; i++) {
    var p = review(progress, grades[i], nowMs, options);
    out[grades[i]] = (p.due - nowMs) / DAY_MS;
  }
  return out;
}
