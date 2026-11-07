import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTextWidth, fitFontSize, wrapLines, fitTextBlock, isWide } from '../../src/presentation/textFit.js';
import { timeBarState, phaseForElapsed, PHASE_COLORS } from '../../src/presentation/timeBar.js';
import { formatIntervalShort, gradeLabel, formatPercent, formatCounter } from '../../src/presentation/formatters.js';
import { Grade } from '../../src/domain/grading/grade.js';
import { DAY_MS, MINUTE_MS } from '../../src/domain/fsrs/parameters.js';

const T = { thrEasy: 5, thrGood: 10, thrHard: 15 };

test('isWide recognises kana, kanji and full-width forms', () => {
  assert.ok(isWide('学'.charCodeAt(0)));
  assert.ok(isWide('が'.charCodeAt(0)));
  assert.ok(isWide('ア'.charCodeAt(0)));
  assert.ok(isWide('Ａ'.charCodeAt(0)));
  assert.ok(!isWide('a'.charCodeAt(0)));
  assert.ok(!isWide('ă'.charCodeAt(0)));
});

test('estimateTextWidth: CJK one em, Latin ~0.55 em', () => {
  assert.equal(estimateTextWidth('学校', 40), 80);
  assert.ok(Math.abs(estimateTextWidth('ab', 40) - 44) < 1e-9);
  assert.ok(estimateTextWidth('a b', 10) < estimateTextWidth('abb', 10));
});

test('fitFontSize picks the largest size that fits a 196px-wide card', () => {
  const sizes = [44, 36, 30, 24];
  assert.equal(fitFontSize('犬', 196, sizes), 44);
  assert.equal(fitFontSize('学校', 196, sizes), 44);     // 88px
  assert.equal(fitFontSize('ありがとう', 196, sizes), 36); // 5 glyphs: 220 > 196 at 44, 180 at 36
  assert.equal(fitFontSize('ありがとうございます', 196, sizes), 24); // 10 glyphs: 240 at 24 → still min
});

test('wrapLines wraps on spaces and splits long CJK runs', () => {
  assert.deepEqual(wrapLines('trường học', 22, 196), ['trường học']);
  const lines = wrapLines('học sinh, sinh viên đại học', 22, 120);
  assert.ok(lines.length >= 2);
  lines.forEach((l) => assert.ok(estimateTextWidth(l, 22) <= 120 || l.split(' ').length === 1));
  assert.deepEqual(wrapLines('あいうえおかきくけこ', 20, 100), ['あいうえお', 'かきくけこ']);
});

test('fitTextBlock shrinks until the block fits, then truncates with an ellipsis', () => {
  const r = fitTextBlock('trường học', 196, 100, [26, 22, 18]);
  assert.equal(r.fontSize, 26);
  assert.equal(r.truncated, false);
  const long = 'một đoạn nghĩa rất dài gồm nhiều từ để kiểm tra việc xuống dòng và cắt bớt khi không đủ chỗ hiển thị trên màn hình nhỏ';
  const t = fitTextBlock(long, 196, 60, [26, 22, 18]);
  assert.equal(t.fontSize, 18);
  assert.equal(t.truncated, true);
  assert.ok(t.lines[t.lines.length - 1].endsWith('…'));
  assert.ok(t.lines.length <= Math.floor(60 / (18 * 1.3)));
});

test('phase and time bar follow the thresholds', () => {
  assert.equal(phaseForElapsed(0, T), 'easy');
  assert.equal(phaseForElapsed(5000, T), 'easy');
  assert.equal(phaseForElapsed(5001, T), 'good');
  assert.equal(phaseForElapsed(10001, T), 'hard');
  assert.equal(phaseForElapsed(15001, T), 'again');
  const s = timeBarState(7500, T);
  assert.equal(s.phase, 'good');
  assert.equal(s.color, PHASE_COLORS.good);
  assert.equal(s.label, 'Tốt');
  assert.equal(s.ratio, 0.5);
  assert.equal(s.percent, 50);
  assert.equal(s.seconds, 7);
  assert.equal(timeBarState(99999, T).ratio, 1);
  assert.equal(timeBarState(-5, T).ratio, 0);
});

test('formatters', () => {
  assert.equal(formatIntervalShort(30 * 1000), '<1p');
  assert.equal(formatIntervalShort(10 * MINUTE_MS), '10p');
  assert.equal(formatIntervalShort(3 * 60 * MINUTE_MS), '3g');
  assert.equal(formatIntervalShort(5 * DAY_MS), '5ng');
  assert.equal(formatIntervalShort(60 * DAY_MS), '2th');
  assert.equal(formatIntervalShort(730 * DAY_MS), '2n');
  assert.equal(gradeLabel(Grade.AGAIN), 'Quên');
  assert.equal(gradeLabel(Grade.EASY), 'Dễ');
  assert.equal(formatPercent(0.9), '90%');
  assert.equal(formatCounter(3, 20), '3/20');
});
