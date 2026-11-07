/** Small Vietnamese formatting helpers for the band UI. */
import { DAY_MS, MINUTE_MS } from '../domain/fsrs/parameters.js';
import { GRADE_NAMES } from '../domain/grading/grade.js';
import { PHASE_LABELS } from './timeBar.js';

/** "1p", "10p", "3g", "5ng", "2th", "1n" — compact interval for the band. */
export function formatIntervalShort(ms) {
  if (ms < MINUTE_MS) return '<1p';
  if (ms < 60 * MINUTE_MS) return Math.round(ms / MINUTE_MS) + 'p';
  if (ms < DAY_MS) return Math.round(ms / (60 * MINUTE_MS)) + 'g';
  var days = ms / DAY_MS;
  if (days < 30) return Math.round(days) + 'ng';
  if (days < 365) return Math.round(days / 30) + 'th';
  return (Math.round(days / 365 * 10) / 10) + 'n';
}

export function gradeLabel(grade) {
  return PHASE_LABELS[GRADE_NAMES[grade]] || '';
}

export function formatPercent(fraction) {
  return Math.round(fraction * 100) + '%';
}

export function formatCounter(index, total) {
  return index + '/' + total;
}
