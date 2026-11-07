import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readZipEntries, writeZip, crc32 } from '../../tools/zip.js';
import { readApkg, extractCollection, readNotes } from '../../tools/anki.js';
import { run } from '../../tools/build-deck.js';
import { createDeckRepository } from '../../src/infrastructure/deck/deckRepository.js';

const cardsOf = (mod) => createDeckRepository(mod.default).getAll().map((c) => ({ i: c.id, f: c.front, r: c.reading, b: c.back, x: c.extra }));

const FS = '\x1f';

/** Builds a legacy-schema Anki collection in memory and returns its bytes. */
function makeCollection({ notes, models, decks }) {
  const dir = mkdtempSync(join(tmpdir(), 'cardband-anki-test-'));
  const path = join(dir, 'collection.anki21');
  const db = new DatabaseSync(path);
  db.exec(`
    create table col (id integer primary key, models text, decks text);
    create table notes (id integer primary key, guid text, mid integer, flds text, tags text);
    create table cards (id integer primary key, nid integer, did integer);
  `);
  db.prepare('insert into col (id, models, decks) values (1, ?, ?)').run(JSON.stringify(models), JSON.stringify(decks));
  const insNote = db.prepare('insert into notes (id, guid, mid, flds, tags) values (?, ?, ?, ?, ?)');
  const insCard = db.prepare('insert into cards (id, nid, did) values (?, ?, ?)');
  notes.forEach((n, i) => {
    insNote.run(n.id || i + 1, n.guid, n.mid, n.fields.join(FS), '');
    insCard.run(1000 + i, n.id || i + 1, n.did);
  });
  db.close();
  return readFileSync(path);
}

const MODELS = {
  '100': { id: 100, name: 'Japanese Vocab', flds: [
    { name: 'STT', ord: 0 }, { name: 'Word', ord: 1 }, { name: 'Sino-Vietnamese', ord: 2 },
    { name: 'Meaning', ord: 3 }, { name: 'Ex', ord: 4 }, { name: 'Hiragana', ord: 6 }, { name: 'Ex-trans', ord: 5 }
  ] },
  '200': { id: 200, name: 'Basic', flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }] }
};
const DECKS = {
  '1': { id: 1, name: 'Default' },
  '10': { id: 10, name: 'N3' },
  '11': { id: 11, name: 'N3::MIMIKARA OBOERU N2' }
};
const NOTES = [
  { guid: 'g1', mid: 100, did: 11, fields: ['1', '人生 [sound:a.mp3] <img src="x.jpg">', 'NHÂN SANH', 'Đời người, cuộc đời', '人生には…', 'Tôi nghĩ…', 'じんせい [sound:b.mp3]'] },
  { guid: 'g2', mid: 100, did: 11, fields: ['2', '人間', 'NHÂN GIAN', 'Con người', '', '', 'にんげん'] },
  { guid: 'g3', mid: 100, did: 11, fields: ['3', 'ひと', 'NHÂN', 'Người', '', '', 'ひと'] },
  { guid: 'g5', mid: 100, did: 11, fields: ['4', '', '', 'Nếp nhăn', '', '', 'しわ'] },
  { guid: 'g4', mid: 200, did: 10, fields: ['cat', 'mèo'] }
];

function makeApkg(method = 0) {
  const collection = makeCollection({ notes: NOTES, models: MODELS, decks: DECKS });
  const dir = mkdtempSync(join(tmpdir(), 'cardband-apkg-test-'));
  const path = join(dir, 'test.apkg');
  writeFileSync(path, writeZip([
    { name: 'meta', data: Buffer.from([8, 2]) },
    { name: 'collection.anki2', data: Buffer.alloc(0) },
    { name: 'collection.anki21', data: collection, method },
    { name: 'media', data: '{}' }
  ]));
  return { path, dir };
}

test('zip round trip with stored and deflated entries', () => {
  const buf = writeZip([
    { name: 'a.txt', data: 'hello', method: 0 },
    { name: 'dir/b.bin', data: Buffer.alloc(5000, 7), method: 8 }
  ]);
  const entries = readZipEntries(buf);
  assert.deepEqual([...entries.keys()], ['a.txt', 'dir/b.bin']);
  assert.equal(entries.get('a.txt').read().toString(), 'hello');
  assert.equal(entries.get('dir/b.bin').method, 8);
  assert.ok(entries.get('dir/b.bin').compressedSize < 5000);
  assert.equal(entries.get('dir/b.bin').read().length, 5000);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('extractCollection prefers the newest non-empty collection file', () => {
  const { path } = makeApkg();
  const { name, data } = extractCollection(readFileSync(path));
  assert.equal(name, 'collection.anki21');
  assert.equal(data.subarray(0, 15).toString(), 'SQLite format 3');
  assert.throws(() => extractCollection(writeZip([{ name: 'meta', data: 'x' }])), /collection/);
});

test('readApkg returns field names plus guid, picks the most common note type', async () => {
  const { path } = makeApkg(8);
  const pkg = await readApkg(path);
  assert.equal(pkg.notetype, 'Japanese Vocab');
  // fields are ordered by `ord`, guid appended last
  assert.deepEqual(pkg.fieldNames, ['STT', 'Word', 'Sino-Vietnamese', 'Meaning', 'Ex', 'Ex-trans', 'Hiragana', 'guid']);
  assert.equal(pkg.rows.length, 4);
  assert.equal(pkg.rows[0][7], 'g1');
  assert.equal(pkg.rows[0][6], 'じんせい [sound:b.mp3]');
  assert.deepEqual(pkg.decks, ['N3', 'N3::MIMIKARA OBOERU N2']);
  assert.match(pkg.warnings[0], /2 kiểu ghi chú/);
});

test('readApkg filters by deck and note type', async () => {
  const { path } = makeApkg();
  const basic = await readApkg(path, { model: 'basic' });
  assert.equal(basic.notetype, 'Basic');
  assert.deepEqual(basic.rows, [['cat', 'mèo', 'g4']]);
  const n2 = await readApkg(path, { deck: 'mimikara' });
  assert.equal(n2.rows.length, 4);
  assert.equal(n2.warnings.length, 0);
  await assert.rejects(readApkg(path, { deck: 'nope' }), /Không có bộ thẻ/);
  await assert.rejects(readApkg(path, { model: 'nope' }), /Không có kiểu ghi chú/);
});

test('readNotes falls back to the newer notetypes/fields/decks tables', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    create table col (id integer primary key, models text, decks text);
    create table notes (id integer primary key, guid text, mid integer, flds text);
    create table cards (id integer primary key, nid integer, did integer);
    create table notetypes (id integer primary key, name text);
    create table fields (ntid integer, ord integer, name text);
    create table decks (id integer primary key, name text);
    insert into col values (1, '{}', '{}');
    insert into notetypes values (5, 'Vocab');
    insert into fields values (5, 1, 'Back'), (5, 0, 'Front');
    insert into decks values (7, 'JP' || char(31) || 'N5');
    insert into notes values (1, 'q', 5, 'いぬ' || char(31) || 'chó');
    insert into cards values (1, 1, 7);
  `);
  const r = readNotes(db);
  assert.deepEqual(r.fieldNames, ['Front', 'Back', 'guid']);
  assert.deepEqual(r.rows, [['いぬ', 'chó', 'q']]);
  assert.deepEqual(r.decks, ['JP::N5']);
  db.close();
});

test('build-deck CLI converts an .apkg with named fields and an extra column', async () => {
  const { path, dir } = makeApkg(8);
  const out = join(dir, 'deck.generated.js');
  const logs = [];
  const code = await run([path, '--front=Word', '--reading=Hiragana', '--back=Meaning', '--extra=Sino-Vietnamese', '--name=N2', `--out=${out}`],
    { log: (m) => logs.push(m), error: (m) => logs.push(m) });
  assert.equal(code, 0);
  assert.ok(existsSync(out));
  const mod = await import(out + '?t=' + Date.now());
  assert.equal(mod.DECK_META.name, 'N2');
  const cards = cardsOf(mod);
  assert.equal(cards.length, 4);
  assert.deepEqual(cards[0], { i: 'g1', f: '人生', r: 'じんせい', b: 'Đời người, cuộc đời', x: 'NHÂN SANH' });
  // reading equal to the front is dropped
  assert.deepEqual(cards[2], { i: 'g3', f: 'ひと', r: '', b: 'Người', x: 'NHÂN' });
  // empty front with a reading: the reading becomes the word
  assert.deepEqual(cards[3], { i: 'g5', f: 'しわ', r: '', b: 'Nếp nhăn', x: '' });
  assert.ok(logs.some((l) => /kiểu ghi chú: Japanese Vocab/.test(l)));
  assert.ok(logs.some((l) => /front=2 reading=7 back=4 id=8 extra=3/.test(l)));
});

test('build-deck CLI maps Anki fields automatically from their names', async () => {
  const { path, dir } = makeApkg();
  const out = join(dir, 'auto.generated.js');
  const code = await run([path, `--out=${out}`], { log() {}, error() {} });
  assert.equal(code, 0);
  const mod = await import(out + '?t=' + Date.now());
  assert.deepEqual(cardsOf(mod)[1], { i: 'g2', f: '人間', r: 'にんげん', b: 'Con người', x: '' });
});
