import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  optionsFor, currentLabel, patchFor, settingsRows, titleFor, pickerTitleFor, unitFor,
  selectedIndex, wheelFontSizes, SETTING_KEYS
} from '../../src/presentation/settingsOptions.js';
import { DEFAULT_SETTINGS, normalizeSettings, NEW_PER_DAY_OPTIONS } from '../../src/domain/settings/settings.js';

test('settingsRows lists every key with its current label', () => {
  const rows = settingsRows(DEFAULT_SETTINGS);
  assert.deepEqual(rows.map((r) => r.key), SETTING_KEYS);
  assert.deepEqual(rows.map((r) => r.value), ['5 / 10 / 15 s', 'Vuốt lên', '10 thẻ', '90%', 'Ẩn']);
  rows.forEach((r) => assert.equal(r.title, titleFor(r.key)));
  SETTING_KEYS.forEach((k) => assert.ok(unitFor(k).length > 0, k));
  // picker titles must fit the 190 px wide header at 18 px (≈ 19 Latin glyphs)
  SETTING_KEYS.forEach((k) => assert.ok(pickerTitleFor(k).length <= 19, pickerTitleFor(k)));
  assert.equal(pickerTitleFor('newPerDay'), titleFor('newPerDay'));
});

test('optionsFor marks exactly one selected option per key and gives short labels', () => {
  for (const key of SETTING_KEYS) {
    const opts = optionsFor(key, DEFAULT_SETTINGS);
    assert.ok(opts.length >= 2, key);
    assert.equal(opts.filter((o) => o.selected).length, 1, key);
    opts.forEach((o) => {
      assert.equal(typeof o.value, 'string');
      assert.ok(o.short.length > 0 && o.short.length <= 12, `${key}: ${o.short}`);
    });
  }
});

test('new cards per day runs 10..200 in steps of 10', () => {
  assert.deepEqual(NEW_PER_DAY_OPTIONS.slice(0, 3), [10, 20, 30]);
  assert.equal(NEW_PER_DAY_OPTIONS.length, 20);
  assert.equal(NEW_PER_DAY_OPTIONS[19], 200);
  const opts = optionsFor('newPerDay', normalizeSettings({ newPerDay: 150 }));
  assert.equal(opts[selectedIndex(opts)].value, '150');
  assert.equal(opts[0].short, '10');
  assert.equal(opts[0].label, '10 thẻ');
});

test('numeric settings snap to the nearest option', () => {
  const legacy = optionsFor('newPerDay', normalizeSettings({ newPerDay: 5 }));
  assert.equal(legacy[selectedIndex(legacy)].value, '10');
  const odd = optionsFor('newPerDay', normalizeSettings({ newPerDay: 37 }));
  assert.equal(odd[selectedIndex(odd)].value, '40');
  const ret = optionsFor('requestRetention', normalizeSettings({ requestRetention: 0.93 }));
  assert.equal(ret[selectedIndex(ret)].value, '0.95');
});

test('custom thresholds appear as an extra selected option', () => {
  const s = normalizeSettings({ thrEasy: 4, thrGood: 8, thrHard: 12 });
  const opts = optionsFor('thresholds', s);
  assert.equal(opts[opts.length - 1].label, '4 / 8 / 12 s');
  assert.equal(opts[opts.length - 1].short, '4 · 8 · 12');
  assert.equal(opts[opts.length - 1].selected, true);
  assert.equal(currentLabel('thresholds', s), '4 / 8 / 12 s');
});

test('patchFor converts string values back into typed settings patches', () => {
  assert.deepEqual(patchFor('thresholds', '0'), { thrEasy: 3, thrGood: 6, thrHard: 10 });
  assert.equal(patchFor('thresholds', 'custom'), null);
  assert.deepEqual(patchFor('knownDirection', 'down'), { knownDirection: 'down' });
  assert.deepEqual(patchFor('newPerDay', '120'), { newPerDay: 120 });
  assert.deepEqual(patchFor('requestRetention', '0.85'), { requestRetention: 0.85 });
  assert.deepEqual(patchFor('showReadingFront', 'true'), { showReadingFront: true });
  assert.deepEqual(patchFor('showReadingFront', 'false'), { showReadingFront: false });
  assert.equal(patchFor('bogus', 'x'), null);
});

test('round trip: choosing an option changes the row label', () => {
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, ...patchFor('requestRetention', '0.95') });
  assert.equal(currentLabel('requestRetention', s), '95%');
  const s2 = normalizeSettings({ ...s, ...patchFor('thresholds', '2') });
  assert.equal(currentLabel('thresholds', s2), '7 / 14 / 20 s');
  const s3 = normalizeSettings({ ...s2, ...patchFor('newPerDay', '200') });
  assert.equal(currentLabel('newPerDay', s3), '200 thẻ');
});

test('wheelFontSizes shrinks the selected size for long labels', () => {
  const numbers = wheelFontSizes(optionsFor('newPerDay', DEFAULT_SETTINGS));
  assert.deepEqual(numbers, { big: 46, small: 28 });
  const thresholds = wheelFontSizes(optionsFor('thresholds', DEFAULT_SETTINGS));
  assert.ok(thresholds.big < 46, 'long "10 · 20 · 30" labels need a smaller size');
  assert.equal(thresholds.small, Math.round(thresholds.big * 0.6));
  for (const key of SETTING_KEYS) {
    const s = wheelFontSizes(optionsFor(key, DEFAULT_SETTINGS));
    assert.ok(s.big >= 24 && s.big <= 46 && s.small < s.big, key);
  }
});
