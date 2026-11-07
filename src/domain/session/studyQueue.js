/**
 * Builds the ordered list of cards for one study session:
 *   1. Review / Relearning / Learning cards that are due, earliest first
 *   2. New cards, in deck order, limited by the daily allowance
 *
 * Learning cards not yet due are included too (they become due within minutes),
 * placed after the due ones so the learner is not asked again instantly.
 */
import { CardState, isNew } from '../card/cardProgress.js';

/**
 * @param {Array} deck cards
 * @param {Object} progressById map id → CardProgress
 * @param {{newPerDay:number}} settings
 * @param {number} nowMs
 * @param {number} newAlreadyToday how many new cards were introduced today
 * @returns {{queue: Array<{card, progress}>, dueCount:number, newCount:number}}
 */
export function buildStudyQueue(deck, progressById, settings, nowMs, newAlreadyToday) {
  var due = [];
  var pendingLearning = [];
  var fresh = [];
  var allowance = Math.max(0, settings.newPerDay - (newAlreadyToday || 0));

  for (var i = 0; i < deck.length; i++) {
    var card = deck[i];
    var p = progressById[card.id];
    if (isNew(p)) {
      if (fresh.length < allowance) fresh.push({ card: card, progress: p || null });
      continue;
    }
    if (p.due <= nowMs) {
      due.push({ card: card, progress: p });
    } else if (p.state === CardState.LEARNING || p.state === CardState.RELEARNING) {
      pendingLearning.push({ card: card, progress: p });
    }
  }

  due.sort(byDue);
  pendingLearning.sort(byDue);

  return {
    queue: due.concat(fresh, pendingLearning),
    dueCount: due.length,
    newCount: fresh.length,
    learningCount: pendingLearning.length
  };
}

function byDue(a, b) {
  return a.progress.due - b.progress.due;
}

/** Counts shown on the home screen. */
export function countForHome(deck, progressById, settings, nowMs, newAlreadyToday) {
  var due = 0, learned = 0;
  for (var i = 0; i < deck.length; i++) {
    var p = progressById[deck[i].id];
    if (isNew(p)) continue;
    learned++;
    if (p.due <= nowMs) due++;
  }
  var unseen = deck.length - learned;
  var allowance = Math.max(0, settings.newPerDay - (newAlreadyToday || 0));
  return {
    total: deck.length,
    due: due,
    newAvailable: Math.min(unseen, allowance),
    unseen: unseen,
    learned: learned
  };
}
