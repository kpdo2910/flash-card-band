/**
 * User settings with defaults and validation. Invalid or missing values fall
 * back to defaults field by field, so a corrupted store never breaks the app.
 */
import { SwipeDirection } from '../grading/gradingPolicy.js';

export var DEFAULT_SETTINGS = {
  thrEasy: 5,
  thrGood: 10,
  thrHard: 15,
  knownDirection: SwipeDirection.UP,
  newPerDay: 10,
  requestRetention: 0.9,
  maxIntervalDays: 365,
  showReadingFront: false
};

export var THRESHOLD_PRESETS = [
  { label: '3 / 6 / 10 s', thrEasy: 3, thrGood: 6, thrHard: 10 },
  { label: '5 / 10 / 15 s', thrEasy: 5, thrGood: 10, thrHard: 15 },
  { label: '7 / 14 / 20 s', thrEasy: 7, thrGood: 14, thrHard: 20 },
  { label: '10 / 20 / 30 s', thrEasy: 10, thrGood: 20, thrHard: 30 }
];

/** 10, 20, …, 200 new cards per day. */
export var NEW_PER_DAY_OPTIONS = (function () {
  var out = [];
  for (var n = 10; n <= 200; n += 10) out.push(n);
  return out;
})();
export var RETENTION_OPTIONS = [0.85, 0.9, 0.95];

function isNumber(n) {
  return typeof n === 'number' && isFinite(n);
}

function validThresholds(s) {
  return isNumber(s.thrEasy) && isNumber(s.thrGood) && isNumber(s.thrHard) &&
    s.thrEasy > 0 && s.thrEasy < s.thrGood && s.thrGood < s.thrHard && s.thrHard <= 120;
}

/** Returns a complete, valid settings object built from `raw` (any shape). */
export function normalizeSettings(raw) {
  var s = {};
  var src = raw && typeof raw === 'object' ? raw : {};
  for (var k in DEFAULT_SETTINGS) s[k] = DEFAULT_SETTINGS[k];

  if (validThresholds(src)) {
    s.thrEasy = src.thrEasy;
    s.thrGood = src.thrGood;
    s.thrHard = src.thrHard;
  }
  if (src.knownDirection === SwipeDirection.UP || src.knownDirection === SwipeDirection.DOWN) {
    s.knownDirection = src.knownDirection;
  }
  if (isNumber(src.newPerDay) && src.newPerDay >= 0 && src.newPerDay <= 500) {
    s.newPerDay = Math.floor(src.newPerDay);
  }
  if (isNumber(src.requestRetention) && src.requestRetention >= 0.7 && src.requestRetention <= 0.97) {
    s.requestRetention = src.requestRetention;
  }
  if (isNumber(src.maxIntervalDays) && src.maxIntervalDays >= 1 && src.maxIntervalDays <= 36500) {
    s.maxIntervalDays = Math.floor(src.maxIntervalDays);
  }
  if (typeof src.showReadingFront === 'boolean') {
    s.showReadingFront = src.showReadingFront;
  }
  return s;
}

/** Scheduler options derived from settings. */
export function schedulerOptionsFrom(settings) {
  return {
    requestRetention: settings.requestRetention,
    maxIntervalDays: settings.maxIntervalDays
  };
}
