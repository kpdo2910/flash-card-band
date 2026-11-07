/** Use case: merge a partial change into the stored settings, validate, persist. */
import { normalizeSettings } from '../domain/settings/settings.js';

export function createUpdateSettings(deps) {
  return function execute(patch) {
    return deps.settingsRepository.load().then(function (current) {
      var merged = {};
      for (var k in current) merged[k] = current[k];
      if (patch) for (var j in patch) merged[j] = patch[j];
      var next = normalizeSettings(merged);
      return deps.settingsRepository.save(next).then(function () {
        return next;
      });
    });
  };
}
