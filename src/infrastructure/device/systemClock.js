/** Clock port backed by Date. */
export function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

export function formatLocalDay(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

export function createSystemClock() {
  return {
    now: function () { return Date.now(); },
    today: function () { return formatLocalDay(new Date()); }
  };
}

/** Deterministic clock for tests: createFixedClock(ms) → {now, today, advance}. */
export function createFixedClock(startMs) {
  var t = startMs;
  return {
    now: function () { return t; },
    today: function () { return formatLocalDay(new Date(t)); },
    advance: function (ms) { t += ms; }
  };
}
