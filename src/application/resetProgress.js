/** Use case: wipe all learning progress and the daily counter (settings stay). */
export function createResetProgress(deps) {
  return function execute() {
    return Promise.all([
      deps.progressRepository.clear(),
      deps.dailyStatsRepository.clear()
    ]).then(function () {
      return true;
    });
  };
}
