/** SettingsRepository on a single JSON key; always returns normalised settings. */
import { parseJson } from './keyValueStore.js';
import { normalizeSettings } from '../../domain/settings/settings.js';

export var SETTINGS_KEY = 'settings';

export function createSettingsRepository(kv) {
  return {
    load: function () {
      return kv.get(SETTINGS_KEY).then(function (text) {
        return normalizeSettings(parseJson(text, null));
      });
    },
    save: function (settings) {
      return kv.set(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    }
  };
}
