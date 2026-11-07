/**
 * Builds a full application wiring on top of in-memory adapters, so use-case
 * tests exercise the real repositories and chunk store.
 */
import { createMemoryStorage } from '../../src/infrastructure/storage/memoryStorage.js';
import { createKeyValueStore } from '../../src/infrastructure/storage/keyValueStore.js';
import { createProgressRepository } from '../../src/infrastructure/storage/progressRepository.js';
import { createSettingsRepository } from '../../src/infrastructure/storage/settingsRepository.js';
import { createDailyStatsRepository } from '../../src/infrastructure/storage/dailyStatsRepository.js';
import { createDeckRepository } from '../../src/infrastructure/deck/deckRepository.js';
import { createFixedClock } from '../../src/infrastructure/device/systemClock.js';
import { createNoopHaptics } from '../../src/infrastructure/device/velaHaptics.js';
import { createGetHomeSummary } from '../../src/application/getHomeSummary.js';
import { createStartStudySession } from '../../src/application/startStudySession.js';
import { createAnswerCard } from '../../src/application/answerCard.js';
import { createUpdateSettings } from '../../src/application/updateSettings.js';
import { createResetProgress } from '../../src/application/resetProgress.js';

export const NOW = Date.UTC(2026, 10, 7, 9, 0, 0); // 2026-11-07 09:00 UTC

export function sampleRows(n = 5) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ i: 'c' + i, f: '単語' + i, r: 'たんご' + i, b: 'từ vựng ' + i });
  }
  return rows;
}

export function buildContainer({ rows = sampleRows(), storage = createMemoryStorage(), now = NOW, chunkSize } = {}) {
  const kv = createKeyValueStore(storage);
  const clock = createFixedClock(now);
  const deps = {
    progressRepository: createProgressRepository(kv, { chunkSize }),
    settingsRepository: createSettingsRepository(kv),
    dailyStatsRepository: createDailyStatsRepository(kv),
    deckRepository: createDeckRepository(rows),
    clock,
    haptics: createNoopHaptics()
  };
  return {
    storage,
    kv,
    clock,
    deps,
    getHomeSummary: createGetHomeSummary(deps),
    startStudySession: createStartStudySession(deps),
    answerCard: createAnswerCard(deps),
    updateSettings: createUpdateSettings(deps),
    resetProgress: createResetProgress(deps)
  };
}
