/**
 * Ports (interfaces) the application layer depends on. Implemented by
 * infrastructure adapters; documented here with JSDoc since the code base is
 * plain JavaScript and relies on duck typing.
 *
 * @typedef {Object} ProgressRepository
 * @property {() => Promise<Object<string, import('../domain/card/cardProgress.js').CardProgress>>} loadAll
 * @property {(id: string, progress: Object) => Promise<void>} save
 * @property {() => Promise<void>} clear
 *
 * @typedef {Object} SettingsRepository
 * @property {() => Promise<Object>} load   resolves to a normalised settings object
 * @property {(settings: Object) => Promise<void>} save
 *
 * @typedef {{date: string, newCount: number}} DailyStats
 * @typedef {Object} DailyStatsRepository
 * @property {() => Promise<DailyStats|null>} load
 * @property {(stats: DailyStats) => Promise<void>} save
 * @property {() => Promise<void>} clear
 *
 * @typedef {Object} DeckRepository
 * @property {() => Array<{id:string, front:string, reading:string, back:string}>} getAll
 *
 * @typedef {Object} Clock
 * @property {() => number} now    epoch milliseconds
 * @property {() => string} today  local calendar day as 'YYYY-MM-DD'
 *
 * @typedef {Object} Haptics
 * @property {() => void} tap
 */

/** Returns today's new-card count, or 0 when the stored day is not today. */
export function newCountForToday(dailyStats, today) {
  if (!dailyStats || dailyStats.date !== today) return 0;
  return typeof dailyStats.newCount === 'number' ? dailyStats.newCount : 0;
}
