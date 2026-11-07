/**
 * In-memory fake of Vela `@system.storage` for tests and the emulator fallback.
 * Mirrors the real API: string values, callbacks, `set` with '' deletes,
 * `get` of a missing key returns `default` or ''. Callbacks fire asynchronously.
 */
export function createMemoryStorage(initial) {
  var data = {};
  if (initial) for (var k in initial) data[k] = String(initial[k]);
  var stats = { gets: 0, sets: 0, deletes: 0, writtenKeys: [] };

  function later(fn) {
    Promise.resolve().then(fn);
  }

  return {
    get: function (opts) {
      stats.gets++;
      later(function () {
        var has = Object.prototype.hasOwnProperty.call(data, opts.key);
        var value = has ? data[opts.key] : (opts.default !== undefined ? opts.default : '');
        if (opts.success) opts.success(value);
        if (opts.complete) opts.complete();
      });
    },
    set: function (opts) {
      stats.sets++;
      stats.writtenKeys.push(opts.key);
      later(function () {
        if (opts.value === '' || opts.value === undefined) delete data[opts.key];
        else data[opts.key] = String(opts.value);
        if (opts.success) opts.success();
        if (opts.complete) opts.complete();
      });
    },
    delete: function (opts) {
      stats.deletes++;
      later(function () {
        delete data[opts.key];
        if (opts.success) opts.success();
        if (opts.complete) opts.complete();
      });
    },
    clear: function (opts) {
      later(function () {
        data = {};
        if (opts && opts.success) opts.success();
        if (opts && opts.complete) opts.complete();
      });
    },
    /** test helpers */
    _dump: function () { var c = {}; for (var k in data) c[k] = data[k]; return c; },
    _stats: stats
  };
}
