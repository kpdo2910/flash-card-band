/**
 * Describes the settings screen: one row per setting with its current value,
 * and the option list shown on the picker page (native `<picker type="text">`).
 *
 * Each option has a full `label` (settings row) and a `short` label (wheel
 * item); `unitFor(key)` is the small caption under the title on the picker page.
 */
import {
  THRESHOLD_PRESETS,
  NEW_PER_DAY_OPTIONS,
  RETENTION_OPTIONS
} from '../domain/settings/settings.js';
import { SwipeDirection } from '../domain/grading/gradingPolicy.js';
import { fitFontSize } from './textFit.js';

export var SETTING_KEYS = ['thresholds', 'knownDirection', 'newPerDay', 'requestRetention', 'showReadingFront'];

var TITLES = {
  thresholds: 'Ngưỡng Dễ / Tốt / Khó',
  knownDirection: 'Vuốt "thuộc"',
  newPerDay: 'Thẻ mới mỗi ngày',
  requestRetention: 'Độ nhớ mục tiêu',
  showReadingFront: 'Cách đọc ở mặt trước'
};

/** Shorter titles for the picker page (190 px wide at 18 px). */
var PICKER_TITLES = {
  thresholds: 'Ngưỡng thời gian',
  showReadingFront: 'Cách đọc mặt trước'
};

var UNITS = {
  thresholds: 'giây · Dễ · Tốt · Khó',
  knownDirection: 'hướng vuốt',
  newPerDay: 'thẻ / ngày',
  requestRetention: 'phần trăm',
  showReadingFront: 'mặt trước'
};

export function titleFor(key) {
  return TITLES[key] || key;
}

/** Title shown on the picker page; falls back to the row title. */
export function pickerTitleFor(key) {
  return PICKER_TITLES[key] || titleFor(key);
}

export function unitFor(key) {
  return UNITS[key] || '';
}

function thresholdIndex(settings) {
  for (var i = 0; i < THRESHOLD_PRESETS.length; i++) {
    var p = THRESHOLD_PRESETS[i];
    if (p.thrEasy === settings.thrEasy && p.thrGood === settings.thrGood && p.thrHard === settings.thrHard) return i;
  }
  return -1;
}

/** Index of the value in `values` closest to `target`. */
function nearestIndex(values, target) {
  var best = 0;
  for (var i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - target) < Math.abs(values[best] - target)) best = i;
  }
  return best;
}

function option(label, short, value, selected) {
  return { label: label, short: short, value: value, selected: selected };
}

/**
 * Options for a key: [{ label, short, value, selected }]. Exactly one option is
 * selected; numeric settings snap to the nearest available option. Values are
 * strings so they survive router params.
 */
export function optionsFor(key, settings) {
  var out = [];
  var i, sel;
  if (key === 'thresholds') {
    var idx = thresholdIndex(settings);
    for (i = 0; i < THRESHOLD_PRESETS.length; i++) {
      var p = THRESHOLD_PRESETS[i];
      out.push(option(p.label, p.thrEasy + ' · ' + p.thrGood + ' · ' + p.thrHard, String(i), i === idx));
    }
    if (idx === -1) {
      var custom = settings.thrEasy + ' / ' + settings.thrGood + ' / ' + settings.thrHard + ' s';
      out.push(option(custom, settings.thrEasy + ' · ' + settings.thrGood + ' · ' + settings.thrHard, 'custom', true));
    }
  } else if (key === 'knownDirection') {
    out.push(option('Vuốt lên', 'Lên', SwipeDirection.UP, settings.knownDirection === SwipeDirection.UP));
    out.push(option('Vuốt xuống', 'Xuống', SwipeDirection.DOWN, settings.knownDirection === SwipeDirection.DOWN));
  } else if (key === 'newPerDay') {
    sel = nearestIndex(NEW_PER_DAY_OPTIONS, settings.newPerDay);
    for (i = 0; i < NEW_PER_DAY_OPTIONS.length; i++) {
      out.push(option(NEW_PER_DAY_OPTIONS[i] + ' thẻ', String(NEW_PER_DAY_OPTIONS[i]), String(NEW_PER_DAY_OPTIONS[i]), i === sel));
    }
  } else if (key === 'requestRetention') {
    sel = nearestIndex(RETENTION_OPTIONS, settings.requestRetention);
    for (i = 0; i < RETENTION_OPTIONS.length; i++) {
      var pct = Math.round(RETENTION_OPTIONS[i] * 100);
      out.push(option(pct + '%', String(pct), String(RETENTION_OPTIONS[i]), i === sel));
    }
  } else if (key === 'showReadingFront') {
    out.push(option('Ẩn', 'Ẩn', 'false', !settings.showReadingFront));
    out.push(option('Hiện', 'Hiện', 'true', !!settings.showReadingFront));
  }
  return out;
}

/** Index of the selected option, or 0. */
export function selectedIndex(options) {
  for (var i = 0; i < options.length; i++) if (options[i].selected) return i;
  return 0;
}

/** Label of the currently selected option, for the settings row. */
export function currentLabel(key, settings) {
  var opts = optionsFor(key, settings);
  return opts.length ? opts[selectedIndex(opts)].label : '';
}

/** Settings patch for choosing `value` (string from the picker page) under `key`. */
export function patchFor(key, value) {
  if (key === 'thresholds') {
    var p = THRESHOLD_PRESETS[parseInt(value, 10)];
    if (!p) return null;
    return { thrEasy: p.thrEasy, thrGood: p.thrGood, thrHard: p.thrHard };
  }
  if (key === 'knownDirection') return { knownDirection: value };
  if (key === 'newPerDay') return { newPerDay: parseInt(value, 10) };
  if (key === 'requestRetention') return { requestRetention: parseFloat(value) };
  if (key === 'showReadingFront') return { showReadingFront: value === 'true' };
  return null;
}

/** Rows for the settings screen. */
export function settingsRows(settings) {
  var rows = [];
  for (var i = 0; i < SETTING_KEYS.length; i++) {
    rows.push({ key: SETTING_KEYS[i], title: titleFor(SETTING_KEYS[i]), value: currentLabel(SETTING_KEYS[i], settings) });
  }
  return rows;
}

var WHEEL_WIDTH = 190;
var WHEEL_BIG_SIZES = [46, 40, 34, 28, 24];

/**
 * Font sizes for the native picker: the selected item gets the largest size
 * at which the longest short label fits the wheel width; neighbours ~60%.
 */
export function wheelFontSizes(options) {
  var longest = '';
  for (var i = 0; i < options.length; i++) {
    if (options[i].short.length > longest.length) longest = options[i].short;
  }
  var big = fitFontSize(longest, WHEEL_WIDTH, WHEEL_BIG_SIZES);
  return { big: big, small: Math.round(big * 0.6) };
}
