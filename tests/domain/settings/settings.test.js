import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  schedulerOptionsFrom
} from '../../../src/domain/settings/settings.js';

test('normalizeSettings returns defaults for empty / invalid input', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('junk'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
});

test('valid overrides are kept', () => {
  const s = normalizeSettings({
    thrEasy: 3, thrGood: 6, thrHard: 10,
    knownDirection: 'down', newPerDay: 20, requestRetention: 0.85,
    maxIntervalDays: 90, showReadingFront: true
  });
  assert.equal(s.thrEasy, 3);
  assert.equal(s.thrHard, 10);
  assert.equal(s.knownDirection, 'down');
  assert.equal(s.newPerDay, 20);
  assert.equal(s.requestRetention, 0.85);
  assert.equal(s.maxIntervalDays, 90);
  assert.equal(s.showReadingFront, true);
});

test('non-increasing thresholds fall back to defaults as a group', () => {
  const s = normalizeSettings({ thrEasy: 10, thrGood: 5, thrHard: 15 });
  assert.equal(s.thrEasy, 5);
  assert.equal(s.thrGood, 10);
  assert.equal(s.thrHard, 15);
});

test('out-of-range values fall back individually', () => {
  const s = normalizeSettings({
    knownDirection: 'left', newPerDay: -3, requestRetention: 0.5,
    maxIntervalDays: 0, showReadingFront: 'yes'
  });
  assert.equal(s.knownDirection, 'up');
  assert.equal(s.newPerDay, 10);
  assert.equal(s.requestRetention, 0.9);
  assert.equal(s.maxIntervalDays, 365);
  assert.equal(s.showReadingFront, false);
});

test('newPerDay is floored to an integer', () => {
  assert.equal(normalizeSettings({ newPerDay: 7.9 }).newPerDay, 7);
});

test('schedulerOptionsFrom picks retention and max interval', () => {
  assert.deepEqual(schedulerOptionsFrom(DEFAULT_SETTINGS), { requestRetention: 0.9, maxIntervalDays: 365 });
});
