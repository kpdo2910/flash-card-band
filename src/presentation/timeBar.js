/**
 * Visual state of the recall-time indicator shown above the card.
 * Phase follows the grading thresholds; ratio grows from 0 to 1 over thrHard seconds.
 */
export var PHASE_COLORS = {
  easy: '#2ecc71',
  good: '#f1c40f',
  hard: '#e67e22',
  again: '#e74c3c'
};

export var PHASE_LABELS = {
  easy: 'Dễ',
  good: 'Tốt',
  hard: 'Khó',
  again: 'Quên'
};

export function phaseForElapsed(elapsedMs, thresholds) {
  var sec = elapsedMs / 1000;
  if (sec <= thresholds.thrEasy) return 'easy';
  if (sec <= thresholds.thrGood) return 'good';
  if (sec <= thresholds.thrHard) return 'hard';
  return 'again';
}

export function timeBarState(elapsedMs, thresholds) {
  var phase = phaseForElapsed(elapsedMs, thresholds);
  var ratio = Math.min(1, Math.max(0, elapsedMs / (thresholds.thrHard * 1000)));
  return {
    phase: phase,
    color: PHASE_COLORS[phase],
    label: PHASE_LABELS[phase],
    ratio: ratio,
    percent: Math.round(ratio * 100),
    seconds: Math.floor(elapsedMs / 1000)
  };
}
