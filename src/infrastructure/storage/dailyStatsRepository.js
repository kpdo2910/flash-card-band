/** DailyStatsRepository: {date, newCount} on a single JSON key. */
import { parseJson } from './keyValueStore.js';

export var DAILY_KEY = 'day';

export function createDailyStatsRepository(kv) {
  return {
    load: function () {
      return kv.get(DAILY_KEY).then(function (text) {
        var v = parseJson(text, null);
        if (!v || typeof v.date !== 'string' || typeof v.newCount !== 'number') return null;
        return { date: v.date, newCount: v.newCount };
      });
    },
    save: function (stats) {
      return kv.set(DAILY_KEY, JSON.stringify({ date: stats.date, newCount: stats.newCount }));
    },
    clear: function () {
      return kv.remove(DAILY_KEY);
    }
  };
}
