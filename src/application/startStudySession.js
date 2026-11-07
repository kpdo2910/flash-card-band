/** Use case: load everything and create a StudySession. */
import { buildStudyQueue } from '../domain/session/studyQueue.js';
import { createStudySession } from '../domain/session/studySession.js';
import { review } from '../domain/fsrs/scheduler.js';
import { schedulerOptionsFrom } from '../domain/settings/settings.js';
import { newCountForToday } from './ports.js';

export function createStartStudySession(deps) {
  return function execute() {
    return Promise.all([
      deps.progressRepository.loadAll(),
      deps.settingsRepository.load(),
      deps.dailyStatsRepository.load()
    ]).then(function (results) {
      var progress = results[0];
      var settings = results[1];
      var introducedToday = newCountForToday(results[2], deps.clock.today());
      var built = buildStudyQueue(deps.deckRepository.getAll(), progress, settings, deps.clock.now(), introducedToday);
      var options = schedulerOptionsFrom(settings);
      var session = createStudySession(built.queue, function (p, grade, nowMs) {
        return review(p, grade, nowMs, options);
      });
      return {
        session: session,
        settings: settings,
        dueCount: built.dueCount,
        newCount: built.newCount,
        learningCount: built.learningCount
      };
    });
  };
}
