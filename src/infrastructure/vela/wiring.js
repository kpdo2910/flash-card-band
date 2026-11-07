/**
 * Composition root for the Vela runtime: the ONLY module (besides pages) that
 * imports `@system.*`. Builds adapters + use cases and returns a container
 * that pages reach through `this.$app.$def.container`.
 */
import storage from '@system.storage';
import vibrator from '@system.vibrator';

import deckText, { DECK_META } from '../deck/deck.generated.js';
import { createKeyValueStore } from '../storage/keyValueStore.js';
import { createProgressRepository } from '../storage/progressRepository.js';
import { createSettingsRepository } from '../storage/settingsRepository.js';
import { createDailyStatsRepository } from '../storage/dailyStatsRepository.js';
import { createDeckRepository } from '../deck/deckRepository.js';
import { createSystemClock } from '../device/systemClock.js';
import { createHaptics } from '../device/velaHaptics.js';

import { createGetHomeSummary } from '../../application/getHomeSummary.js';
import { createStartStudySession } from '../../application/startStudySession.js';
import { createAnswerCard } from '../../application/answerCard.js';
import { createUpdateSettings } from '../../application/updateSettings.js';
import { createResetProgress } from '../../application/resetProgress.js';

export function createContainer() {
  var kv = createKeyValueStore(storage);
  var deps = {
    progressRepository: createProgressRepository(kv),
    settingsRepository: createSettingsRepository(kv),
    dailyStatsRepository: createDailyStatsRepository(kv),
    deckRepository: createDeckRepository(deckText),
    clock: createSystemClock(),
    haptics: createHaptics(vibrator)
  };
  return {
    deckMeta: DECK_META,
    clock: deps.clock,
    haptics: deps.haptics,
    settingsRepository: deps.settingsRepository,
    getHomeSummary: createGetHomeSummary(deps),
    startStudySession: createStartStudySession(deps),
    answerCard: createAnswerCard(deps),
    updateSettings: createUpdateSettings(deps),
    resetProgress: createResetProgress(deps),
    /** Session handed from the study page to the summary page. */
    lastSummary: null
  };
}
