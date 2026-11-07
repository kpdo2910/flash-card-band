/**
 * Promise wrapper around a Vela `@system.storage`-shaped module
 * ({ get, set, delete, clear } with success/fail callbacks, string values).
 * The module is injected so tests can pass an in-memory fake.
 */
export function createKeyValueStore(systemStorage) {
  function get(key) {
    return new Promise(function (resolve) {
      try {
        systemStorage.get({
          key: key,
          default: '',
          success: function (data) { resolve(typeof data === 'string' ? data : ''); },
          fail: function () { resolve(''); },
          complete: function () {}
        });
      } catch (e) {
        resolve('');
      }
    });
  }

  function set(key, value) {
    return new Promise(function (resolve, reject) {
      try {
        systemStorage.set({
          key: key,
          value: value,
          success: function () { resolve(); },
          fail: function (data, code) { reject(new Error('storage.set failed: ' + code)); },
          complete: function () {}
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function remove(key) {
    return new Promise(function (resolve) {
      try {
        systemStorage.delete({
          key: key,
          success: function () { resolve(); },
          fail: function () { resolve(); },
          complete: function () {}
        });
      } catch (e) {
        resolve();
      }
    });
  }

  return { get: get, set: set, remove: remove };
}

/** Parse JSON defensively: returns `fallback` on any error. */
export function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    var v = JSON.parse(text);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
