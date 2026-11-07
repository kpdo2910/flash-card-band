/**
 * Recall stopwatch for one card.
 *
 * Starts when the front of the card is shown and freezes the first time the
 * card is flipped: the time spent reading the back must not count against the
 * learner. Flipping back to the front keeps it frozen, because once the answer
 * has been seen the recall time is fixed. A card that is swiped without being
 * flipped is graded on the time until the swipe.
 */
export function createRecallTimer(startMs) {
  var start = startMs;
  var frozenAt = null;

  /** Milliseconds counted so far (frozen value once frozen). */
  function elapsed(nowMs) {
    var end = frozenAt === null ? nowMs : frozenAt;
    return Math.max(0, end - start);
  }

  /** Stops the clock at `nowMs`; later calls are ignored. Returns the elapsed time. */
  function freeze(nowMs) {
    if (frozenAt === null) frozenAt = Math.max(start, nowMs);
    return elapsed(nowMs);
  }

  function isRunning() {
    return frozenAt === null;
  }

  return { elapsed: elapsed, freeze: freeze, isRunning: isRunning };
}
