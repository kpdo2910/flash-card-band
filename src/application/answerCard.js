/**
 * Use case: grade the current card of a session, persist the new progress and
 * bump today's new-card counter when the card was new.
 */
import { newCountForToday } from './ports.js';

export function createAnswerCard(deps) {
  return function execute(session, grade) {
    var now = deps.clock.now();
    var result = session.answer(grade, now);
    if (!result) return Promise.resolve(null);

    var writes = [deps.progressRepository.save(result.card.id, result.progress)];
    if (result.wasNew) {
      writes.push(deps.dailyStatsRepository.load().then(function (stats) {
        var today = deps.clock.today();
        var count = newCountForToday(stats, today) + 1;
        return deps.dailyStatsRepository.save({ date: today, newCount: count });
      }));
    }
    return Promise.all(writes).then(function () {
      return result;
    });
  };
}
