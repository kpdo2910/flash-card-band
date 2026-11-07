/** ProgressRepository backed by a chunked JSON store; values are compact arrays. */
import { createChunkedJsonStore } from './chunkedJsonStore.js';
import { serializeProgress, deserializeProgress } from '../../domain/card/cardProgress.js';

export var PROGRESS_PREFIX = 'prog';

export function createProgressRepository(kv, options) {
  var store = createChunkedJsonStore(kv, PROGRESS_PREFIX, options && options.chunkSize);

  function loadAll() {
    return store.loadAll().then(function (raw) {
      var out = {};
      for (var id in raw) {
        if (!raw.hasOwnProperty(id)) continue;
        var p = deserializeProgress(raw[id]);
        if (p) out[id] = p;
      }
      return out;
    });
  }

  function save(id, progress) {
    return store.save(id, serializeProgress(progress));
  }

  return {
    loadAll: loadAll,
    save: save,
    clear: store.clear,
    chunkCount: store.chunkCount
  };
}
