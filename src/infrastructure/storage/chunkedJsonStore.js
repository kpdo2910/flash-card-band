/**
 * Stores a large map {id → value} across several storage keys so no single
 * value grows beyond what the band's key-value storage accepts.
 *
 *   <prefix>_meta   → {"n": <chunk count>}
 *   <prefix>_0 .. n → {"<id>": <value>, ...}   (at most chunkSize ids each)
 *
 * loadAll() must be called before save(); the store keeps the chunks in memory
 * and rewrites only the chunk containing the changed id.
 */
import { parseJson } from './keyValueStore.js';

export function createChunkedJsonStore(kv, prefix, chunkSize) {
  var size = chunkSize || 150;
  var chunks = null;          // Array<Object>
  var locationOf = {};        // id → chunk index

  function metaKey() { return prefix + '_meta'; }
  function chunkKey(i) { return prefix + '_' + i; }

  function loadAll() {
    return kv.get(metaKey()).then(function (metaText) {
      var meta = parseJson(metaText, { n: 0 });
      var n = typeof meta.n === 'number' && meta.n > 0 ? Math.floor(meta.n) : 0;
      var reads = [];
      for (var i = 0; i < n; i++) reads.push(kv.get(chunkKey(i)));
      return Promise.all(reads);
    }).then(function (texts) {
      chunks = [];
      locationOf = {};
      var all = {};
      for (var i = 0; i < texts.length; i++) {
        var obj = parseJson(texts[i], {});
        if (typeof obj !== 'object' || Array.isArray(obj)) obj = {};
        chunks.push(obj);
        for (var id in obj) {
          if (!obj.hasOwnProperty(id)) continue;
          locationOf[id] = i;
          all[id] = obj[id];
        }
      }
      return all;
    });
  }

  function ensureLoaded() {
    return chunks ? Promise.resolve() : loadAll().then(function () {});
  }

  function count(obj) {
    var c = 0;
    for (var k in obj) if (obj.hasOwnProperty(k)) c++;
    return c;
  }

  function save(id, value) {
    return ensureLoaded().then(function () {
      var idx = locationOf[id];
      var metaChanged = false;
      if (idx === undefined) {
        idx = chunks.length - 1;
        if (idx < 0 || count(chunks[idx]) >= size) {
          chunks.push({});
          idx = chunks.length - 1;
          metaChanged = true;
        }
        locationOf[id] = idx;
      }
      chunks[idx][id] = value;
      var writes = [kv.set(chunkKey(idx), JSON.stringify(chunks[idx]))];
      if (metaChanged) writes.push(kv.set(metaKey(), JSON.stringify({ n: chunks.length })));
      return Promise.all(writes);
    });
  }

  function clear() {
    return ensureLoaded().then(function () {
      var removes = [];
      for (var i = 0; i < chunks.length; i++) removes.push(kv.remove(chunkKey(i)));
      removes.push(kv.remove(metaKey()));
      chunks = [];
      locationOf = {};
      return Promise.all(removes);
    });
  }

  function chunkCount() {
    return chunks ? chunks.length : 0;
  }

  return { loadAll: loadAll, save: save, clear: clear, chunkCount: chunkCount };
}
