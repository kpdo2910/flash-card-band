/** Use case: numbers for the home screen. */
import { countForHome } from '../domain/session/studyQueue.js';
import { newCountForToday } from './ports.js';

export function createGetHomeSummary(deps) {
  return function execute() {
    return Promise.all([
      deps.progressRepository.loadAll(),
      deps.settingsRepository.load(),
      deps.dailyStatsRepository.load()
    ]).then(function (results) {
      var progress = results[0];
      var settings = results[1];
      var introducedToday = newCountForToday(results[2], deps.clock.today());
      var counts = countForHome(deps.deckRepository.getAll(), progress, settings, deps.clock.now(), introducedToday);
      counts.newIntroducedToday = introducedToday;
      return counts;
    });
  };
}
