import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyValueStore } from '../../../src/infrastructure/storage/keyValueStore.js';
import { createMemoryStorage } from '../../../src/infrastructure/storage/memoryStorage.js';
import { createProgressRepository } from '../../../src/infrastructure/storage/progressRepository.js';
import { createSettingsRepository } from '../../../src/infrastructure/storage/settingsRepository.js';
import { createDailyStatsRepository } from '../../../src/infrastructure/storage/dailyStatsRepository.js';
import { createDeckRepository } from '../../../src/infrastructure/deck/deckRepository.js';
import { DEFAULT_SETTINGS } from '../../../src/domain/settings/settings.js';
import { CardState, newProgress } from '../../../src/domain/card/cardProgress.js';
import { formatLocalDay, createFixedClock } from '../../../src/infrastructure/device/systemClock.js';

test('progressRepository serialises to compact arrays and deserialises back', async () => {
  const storage = createMemoryStorage();
  const repo = createProgressRepository(createKeyValueStore(storage));
  const p = { ...newProgress(), state: CardState.REVIEW, due: 123456, stability: 3.14159265, difficulty: 6.1, reps: 2, lapses: 0, lastReview: 100 };
  await repo.save('x', p);
  const raw = JSON.parse(storage._dump().prog_0);
  assert.deepEqual(raw.x, [123456, 3.1416, 6.1, CardState.REVIEW, 0, 2, 0, 100]);
  const all = await createProgressRepository(createKeyValueStore(storage)).loadAll();
  assert.equal(all.x.stability, 3.1416);
  assert.equal(all.x.state, CardState.REVIEW);
});

test('progressRepository drops malformed entries', async () => {
  const storage = createMemoryStorage({ prog_meta: '{"n":1}', prog_0: '{"ok":[1,2,3,2,0,1,0,1],"bad":"zzz"}' });
  const all = await createProgressRepository(createKeyValueStore(storage)).loadAll();
  assert.deepEqual(Object.keys(all), ['ok']);
});

test('settingsRepository returns defaults when empty and normalises on save/load', async () => {
  const storage = createMemoryStorage();
  const repo = createSettingsRepository(createKeyValueStore(storage));
  assert.deepEqual(await repo.load(), DEFAULT_SETTINGS);
  await repo.save({ ...DEFAULT_SETTINGS, newPerDay: 20, requestRetention: 5 });
  const s = await repo.load();
  assert.equal(s.newPerDay, 20);
  assert.equal(s.requestRetention, 0.9);
});

test('dailyStatsRepository round-trips and rejects junk', async () => {
  const storage = createMemoryStorage({ day: '{"date": 5}' });
  const repo = createDailyStatsRepository(createKeyValueStore(storage));
  assert.equal(await repo.load(), null);
  await repo.save({ date: '2026-11-07', newCount: 3 });
  assert.deepEqual(await repo.load(), { date: '2026-11-07', newCount: 3 });
  await repo.clear();
  assert.equal(await repo.load(), null);
});

test('deckRepository builds valid cards and skips invalid rows', () => {
  const repo = createDeckRepository([
    { i: 'a', f: '学校', r: 'がっこう', b: 'trường học' },
    { f: '犬', r: 'いぬ', b: 'chó' },
    { f: '', b: 'rỗng' },
    { f: 'x', b: '' }
  ]);
  const cards = repo.getAll();
  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, 'a');
  assert.match(cards[1].id, /^h/);
  assert.equal(repo.getAll(), cards, 'cached');
});

test('clock formats local day and fixed clock advances', () => {
  assert.equal(formatLocalDay(new Date(2026, 0, 5)), '2026-01-05');
  const c = createFixedClock(1000);
  c.advance(500);
  assert.equal(c.now(), 1500);
});
