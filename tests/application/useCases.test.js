import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContainer, sampleRows, NOW } from '../helpers/testContainer.js';
import { Grade } from '../../src/domain/grading/grade.js';
import { CardState } from '../../src/domain/card/cardProgress.js';
import { DAY_MS, MINUTE_MS } from '../../src/domain/fsrs/parameters.js';
import { DEFAULT_SETTINGS } from '../../src/domain/settings/settings.js';

test('getHomeSummary on a fresh install: nothing due, new limited by newPerDay', async () => {
  const c = buildContainer({ rows: sampleRows(30) });
  const s = await c.getHomeSummary();
  assert.equal(s.total, 30);
  assert.equal(s.due, 0);
  assert.equal(s.learned, 0);
  assert.equal(s.newAvailable, 10);
  assert.equal(s.newIntroducedToday, 0);
});

test('startStudySession + answerCard persist progress and count new cards once', async () => {
  const c = buildContainer({ rows: sampleRows(3) });
  const started = await c.startStudySession();
  assert.equal(started.newCount, 3);
  assert.equal(started.session.remaining(), 3);

  const r1 = await c.answerCard(started.session, Grade.EASY);
  assert.equal(r1.wasNew, true);
  assert.equal(r1.progress.state, CardState.REVIEW);

  const r2 = await c.answerCard(started.session, Grade.AGAIN);
  assert.equal(r2.requeued, true);

  const stored = await c.deps.progressRepository.loadAll();
  assert.equal(Object.keys(stored).length, 2);
  assert.equal(stored[r1.card.id].state, CardState.REVIEW);
  assert.equal(stored[r2.card.id].state, CardState.LEARNING);

  const day = await c.deps.dailyStatsRepository.load();
  assert.deepEqual(day, { date: c.clock.today(), newCount: 2 });

  // Re-answering the requeued (no longer new) card must not bump the counter.
  c.clock.advance(2 * MINUTE_MS);
  const r3 = await c.answerCard(started.session, Grade.GOOD); // c2 (new) → counter 3
  assert.equal(r3.wasNew, true);
  c.clock.advance(2 * MINUTE_MS);
  const r4 = await c.answerCard(started.session, Grade.GOOD); // learning card
  assert.equal(r4.wasNew, false);
  assert.equal((await c.deps.dailyStatsRepository.load()).newCount, 3);
});

test('answerCard on a finished session resolves null without writing', async () => {
  const c = buildContainer({ rows: sampleRows(1) });
  const { session } = await c.startStudySession();
  await c.answerCard(session, Grade.EASY);
  c.storage._stats.writtenKeys.length = 0;
  assert.equal(await c.answerCard(session, Grade.EASY), null);
  assert.deepEqual(c.storage._stats.writtenKeys, []);
});

test('daily allowance carries across sessions and resets the next day', async () => {
  const c = buildContainer({ rows: sampleRows(30) });
  await c.updateSettings({ newPerDay: 2 });
  let s = await c.startStudySession();
  assert.equal(s.newCount, 2);
  await c.answerCard(s.session, Grade.EASY);
  await c.answerCard(s.session, Grade.EASY);

  s = await c.startStudySession();
  assert.equal(s.newCount, 0, 'allowance used up today');
  assert.equal((await c.getHomeSummary()).newAvailable, 0);

  c.clock.advance(DAY_MS);
  s = await c.startStudySession();
  assert.equal(s.newCount, 2, 'new day, new allowance');
});

test('reviews become due after their interval and show up in the summary', async () => {
  const c = buildContainer({ rows: sampleRows(2) });
  const s = await c.startStudySession();
  const r = await c.answerCard(s.session, Grade.EASY);
  await c.answerCard(s.session, Grade.EASY);
  assert.equal((await c.getHomeSummary()).due, 0);
  c.clock.advance(r.progress.due - NOW);
  const home = await c.getHomeSummary();
  assert.ok(home.due >= 1);
  const next = await c.startStudySession();
  assert.ok(next.dueCount >= 1);
});

test('updateSettings merges, validates and persists', async () => {
  const c = buildContainer();
  const s1 = await c.updateSettings({ knownDirection: 'down', thrEasy: 3, thrGood: 6, thrHard: 10 });
  assert.equal(s1.knownDirection, 'down');
  assert.equal(s1.thrHard, 10);
  const s2 = await c.updateSettings({ requestRetention: 42 });
  assert.equal(s2.requestRetention, DEFAULT_SETTINGS.requestRetention);
  assert.equal(s2.knownDirection, 'down', 'earlier change kept');
  assert.deepEqual(await c.deps.settingsRepository.load(), s2);
});

test('settings drive the scheduler (retention) and the queue (newPerDay)', async () => {
  const strict = buildContainer({ rows: sampleRows(1) });
  await strict.updateSettings({ requestRetention: 0.95 });
  const lax = buildContainer({ rows: sampleRows(1) });
  await lax.updateSettings({ requestRetention: 0.8 });
  const a = await strict.answerCard((await strict.startStudySession()).session, Grade.EASY);
  const b = await lax.answerCard((await lax.startStudySession()).session, Grade.EASY);
  assert.ok(a.progress.due < b.progress.due);
});

test('resetProgress wipes progress and the daily counter but keeps settings', async () => {
  const c = buildContainer({ rows: sampleRows(3) });
  await c.updateSettings({ newPerDay: 5 });
  const s = await c.startStudySession();
  await c.answerCard(s.session, Grade.GOOD);
  await c.resetProgress();
  const dump = c.storage._dump();
  assert.deepEqual(Object.keys(dump), ['settings']);
  assert.equal((await c.getHomeSummary()).learned, 0);
  assert.equal((await c.deps.settingsRepository.load()).newPerDay, 5);
});
