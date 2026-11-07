import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyValueStore, parseJson } from '../../../src/infrastructure/storage/keyValueStore.js';
import { createMemoryStorage } from '../../../src/infrastructure/storage/memoryStorage.js';

test('get returns "" for a missing key and the stored string otherwise', async () => {
  const kv = createKeyValueStore(createMemoryStorage());
  assert.equal(await kv.get('nope'), '');
  await kv.set('a', 'hello');
  assert.equal(await kv.get('a'), 'hello');
});

test('remove deletes the key', async () => {
  const storage = createMemoryStorage({ a: '1' });
  const kv = createKeyValueStore(storage);
  await kv.remove('a');
  assert.equal(await kv.get('a'), '');
  assert.deepEqual(storage._dump(), {});
});

test('set rejects when the platform reports failure', async () => {
  const failing = {
    get() {}, delete() {},
    set(opts) { opts.fail('boom', 500); }
  };
  const kv = createKeyValueStore(failing);
  await assert.rejects(kv.set('k', 'v'), /500/);
});

test('get resolves "" when the platform fails or throws', async () => {
  const failing = { get(opts) { opts.fail('x', 1); }, set() {}, delete() {} };
  assert.equal(await createKeyValueStore(failing).get('k'), '');
  const throwing = { get() { throw new Error('no storage'); }, set() {}, delete() {} };
  assert.equal(await createKeyValueStore(throwing).get('k'), '');
});

test('parseJson is defensive', () => {
  assert.deepEqual(parseJson('{"a":1}', null), { a: 1 });
  assert.equal(parseJson('', 'fb'), 'fb');
  assert.equal(parseJson('{bad', 'fb'), 'fb');
  assert.equal(parseJson('null', 'fb'), 'fb');
});
