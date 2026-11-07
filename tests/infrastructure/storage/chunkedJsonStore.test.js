import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChunkedJsonStore } from '../../../src/infrastructure/storage/chunkedJsonStore.js';
import { createKeyValueStore } from '../../../src/infrastructure/storage/keyValueStore.js';
import { createMemoryStorage } from '../../../src/infrastructure/storage/memoryStorage.js';

function make(storage, chunkSize = 150) {
  return createChunkedJsonStore(createKeyValueStore(storage), 'prog', chunkSize);
}

test('empty store loads as {} and has no chunks', async () => {
  const store = make(createMemoryStorage());
  assert.deepEqual(await store.loadAll(), {});
  assert.equal(store.chunkCount(), 0);
});

test('400 ids with chunk size 150 → 3 chunks, round-trips through a fresh instance', async () => {
  const storage = createMemoryStorage();
  const store = make(storage);
  await store.loadAll();
  for (let i = 0; i < 400; i++) await store.save('id' + i, [i, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(store.chunkCount(), 3);
  const dump = storage._dump();
  assert.deepEqual(Object.keys(dump).sort(), ['prog_0', 'prog_1', 'prog_2', 'prog_meta']);
  assert.deepEqual(JSON.parse(dump.prog_meta), { n: 3 });

  const again = make(storage);
  const all = await again.loadAll();
  assert.equal(Object.keys(all).length, 400);
  assert.deepEqual(all.id399, [399, 1, 2, 3, 4, 5, 6, 7]);
});

test('updating an existing id rewrites only its chunk', async () => {
  const storage = createMemoryStorage();
  const store = make(storage, 2);
  await store.loadAll();
  await store.save('a', 1);
  await store.save('b', 2);
  await store.save('c', 3); // → chunk 1
  storage._stats.writtenKeys.length = 0;
  await store.save('a', 10);
  assert.deepEqual(storage._stats.writtenKeys, ['prog_0']);
  await store.save('c', 30);
  assert.deepEqual(storage._stats.writtenKeys, ['prog_0', 'prog_1']);
  assert.deepEqual(JSON.parse(storage._dump().prog_0), { a: 10, b: 2 });
});

test('a corrupted chunk is skipped, the others still load', async () => {
  const storage = createMemoryStorage({
    prog_meta: '{"n":2}',
    prog_0: '{"a":[1]}',
    prog_1: '{not json'
  });
  const store = make(storage);
  const all = await store.loadAll();
  assert.deepEqual(all, { a: [1] });
  assert.equal(store.chunkCount(), 2);
});

test('corrupted meta behaves like an empty store', async () => {
  const storage = createMemoryStorage({ prog_meta: 'garbage', prog_0: '{"a":1}' });
  const store = make(storage);
  assert.deepEqual(await store.loadAll(), {});
});

test('save before loadAll loads implicitly', async () => {
  const storage = createMemoryStorage({ prog_meta: '{"n":1}', prog_0: '{"a":1}' });
  const store = make(storage);
  await store.save('b', 2);
  assert.deepEqual(JSON.parse(storage._dump().prog_0), { a: 1, b: 2 });
});

test('clear removes all chunks and meta', async () => {
  const storage = createMemoryStorage();
  const store = make(storage, 1);
  await store.loadAll();
  await store.save('a', 1);
  await store.save('b', 2);
  await store.clear();
  assert.deepEqual(storage._dump(), {});
  assert.equal(store.chunkCount(), 0);
  assert.deepEqual(await make(storage).loadAll(), {});
});
