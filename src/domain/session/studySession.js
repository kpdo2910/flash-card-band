/**
 * StudySession: in-memory state machine for one sitting.
 *
 *   current(nowMs)       → {card, progress} or null when finished
 *   flip()               → toggles front/back
 *   answer(grade, nowMs) → records the answer, returns the new progress;
 *                          learning cards are re-queued, graduated cards leave
 *   summary()            → counts per grade and cards seen
 *
 * Two lists are kept, like Anki: `main` (due reviews + new cards in order) and
 * `learning` (cards answered this session that are still in learning steps,
 * sorted by due). A learning card is shown as soon as it is due; while none is
 * due the main list continues; when main is empty learning cards are shown early.
 * Scheduling itself is delegated to the scheduler function passed in.
 */
import { CardState } from '../card/cardProgress.js';
import { Grade } from '../grading/grade.js';

export function createStudySession(queue, scheduleFn) {
  var main = queue.slice();
  var learning = [];
  var flipped = false;
  var counts = { again: 0, hard: 0, good: 0, easy: 0 };
  var answered = 0;
  var uniqueSeen = {};
  var lastShownId = null;

  function pickIndex(nowMs) {
    // Returns {list, index} of the card to show, or null.
    if (learning.length && learning[0].progress.due <= nowMs) {
      // Avoid showing the same card twice in a row when something else is available.
      if (learning[0].card.id === lastShownId && (main.length || learning.length > 1)) {
        if (main.length) return { list: main, index: 0 };
        return { list: learning, index: 1 };
      }
      return { list: learning, index: 0 };
    }
    if (main.length) return { list: main, index: 0 };
    if (learning.length) return { list: learning, index: 0 };
    return null;
  }

  function current(nowMs) {
    var pick = pickIndex(nowMs === undefined ? Infinity : nowMs);
    return pick ? pick.list[pick.index] : null;
  }

  function flip() {
    if (!main.length && !learning.length) return false;
    flipped = !flipped;
    return flipped;
  }

  function isFlipped() {
    return flipped;
  }

  function remaining() {
    return main.length + learning.length;
  }

  function answer(grade, nowMs) {
    var pick = pickIndex(nowMs);
    if (!pick) return null;
    var item = pick.list.splice(pick.index, 1)[0];
    var wasNew = !item.progress || item.progress.state === CardState.NEW;
    var next = scheduleFn(item.progress, grade, nowMs);
    flipped = false;
    answered++;
    uniqueSeen[item.card.id] = true;
    lastShownId = item.card.id;
    if (grade === Grade.AGAIN) counts.again++;
    else if (grade === Grade.HARD) counts.hard++;
    else if (grade === Grade.GOOD) counts.good++;
    else counts.easy++;

    var requeued = false;
    if (next.state === CardState.LEARNING || next.state === CardState.RELEARNING) {
      insertLearning({ card: item.card, progress: next });
      requeued = true;
    }
    return { card: item.card, progress: next, wasNew: wasNew, requeued: requeued };
  }

  function insertLearning(entry) {
    var idx = 0;
    while (idx < learning.length && learning[idx].progress.due <= entry.progress.due) idx++;
    learning.splice(idx, 0, entry);
  }

  function summary() {
    var seen = 0;
    for (var k in uniqueSeen) if (uniqueSeen.hasOwnProperty(k)) seen++;
    return {
      answered: answered,
      cardsSeen: seen,
      again: counts.again,
      hard: counts.hard,
      good: counts.good,
      easy: counts.easy
    };
  }

  return {
    current: current,
    flip: flip,
    isFlipped: isFlipped,
    remaining: remaining,
    answer: answer,
    summary: summary
  };
}
