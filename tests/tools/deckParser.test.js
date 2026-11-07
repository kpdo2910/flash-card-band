import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readFileSync as read, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDeckText,
  parseDelimited,
  cleanField,
  splitFurigana,
  detectSeparator,
  splitAnkiDirectives,
  generateDeckModule,
  serializeDeck
} from '../../tools/deckParser.js';
import { createDeckRepository } from '../../src/infrastructure/deck/deckRepository.js';
import { parseArgs, run } from '../../tools/build-deck.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, '..', 'fixtures', name), 'utf8');

test('splitFurigana handles single and multi-segment Anki furigana', () => {
  assert.deepEqual(splitFurigana('学校[がっこう]'), { base: '学校', reading: 'がっこう' });
  assert.deepEqual(splitFurigana(' 日本[にほん]語[ご]'), { base: '日本語', reading: 'にほんご' });
  assert.deepEqual(splitFurigana('食[た]べる'), { base: '食べる', reading: 'たべる' });
  assert.deepEqual(splitFurigana('ありがとう'), { base: 'ありがとう', reading: '' });
});

test('cleanField strips HTML, entities, sound tags and collapses whitespace', () => {
  assert.equal(cleanField('<b>tiếng Nhật</b><br>ngôn ngữ'), 'tiếng Nhật / ngôn ngữ');
  assert.equal(cleanField('trường&nbsp;học  &amp; lớp'), 'trường học & lớp');
  assert.equal(cleanField('[sound:a.mp3] chó'), 'chó');
  assert.equal(cleanField('<div>a</div><div>b</div>'), 'a / b');
  assert.equal(cleanField('&#12354;&#x3044;'), 'あい');
  assert.equal(cleanField(null), '');
});

test('parseDelimited supports quotes, escaped quotes and newlines inside quotes', () => {
  const rows = parseDelimited('a,"b ""x"", y","line1\nline2"\n1,2,3\n\n', ',');
  assert.deepEqual(rows, [['a', 'b "x", y', 'line1\nline2'], ['1', '2', '3']]);
});

test('detectSeparator prefers the consistent delimiter', () => {
  assert.equal(detectSeparator('a\tb\tc\nd\te\tf'), '\t');
  assert.equal(detectSeparator('a,b,c\nd,e,f'), ',');
  assert.equal(detectSeparator('a;b;c\nd;e,x;f'), ';');
});

test('splitAnkiDirectives reads #key:value lines', () => {
  const r = splitAnkiDirectives('#separator:tab\n#html:true\nx\ty');
  assert.deepEqual(r.directives, { separator: 'tab', html: 'true' });
  assert.equal(r.body, 'x\ty');
});

test('parses the sample TSV with header', () => {
  const r = parseDeckText(readFileSync(join(here, '..', '..', 'decks', 'sample.tsv'), 'utf8'));
  assert.equal(r.hasHeader, true);
  assert.equal(r.separator, '\t');
  assert.equal(r.cards.length, 20);
  assert.deepEqual(r.cards[0], { front: '学校', reading: 'がっこう', back: 'trường học' });
  assert.equal(r.warnings.length, 0);
});

test('parses an Anki export: directives, furigana, HTML, guid column, duplicates', () => {
  const r = parseDeckText(fixture('anki-export.txt'), { columns: { id: 1, front: 3, back: 4 } });
  assert.equal(r.separator, '\t');
  assert.equal(r.hasHeader, false);
  assert.equal(r.cards.length, 3);
  assert.deepEqual(r.cards[0], { id: 'Kx9f2a', front: '日本語', reading: 'にほんご', back: 'tiếng Nhật / ngôn ngữ' });
  assert.deepEqual(r.cards[1], { id: 'Qp3m7z', front: '学校', reading: 'がっこう', back: 'trường học' });
  assert.deepEqual(r.cards[2], { id: 'Rt5n1b', front: 'ありがとう', reading: '', back: 'cảm ơn' });
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /Dòng 4: thiếu/);
  assert.match(r.warnings[1], /Dòng 5: trùng/);
});

test('parses quoted CSV with header names and multi-line fields', () => {
  const r = parseDeckText(fixture('quoted.csv'));
  assert.equal(r.hasHeader, true);
  assert.deepEqual(r.columns, { front: 0, reading: 1, back: 2 });
  assert.equal(r.cards.length, 3);
  assert.equal(r.cards[0].back, 'cao; đắt, "mắc"');
  assert.equal(r.cards[1].back, 'ăn (động từ nhóm 2)');
});

test('two-column file without header: front/back, reading from furigana', () => {
  const r = parseDeckText('猫[ねこ]\tmèo\n犬[いぬ]\tchó\n');
  assert.equal(r.hasHeader, false);
  assert.deepEqual(r.cards, [
    { front: '猫', reading: 'ねこ', back: 'mèo' },
    { front: '犬', reading: 'いぬ', back: 'chó' }
  ]);
});

test('three-column file without header defaults to front/reading/back', () => {
  const r = parseDeckText('猫,ねこ,mèo\n');
  assert.deepEqual(r.columns, { front: 0, reading: 1, back: 2 });
  assert.deepEqual(r.cards, [{ front: '猫', reading: 'ねこ', back: 'mèo' }]);
});

test('column names can be given explicitly; header can be forced', () => {
  const r = parseDeckText('a,b,c\n猫,mèo,ねこ\n', { header: 'yes', columns: { front: 'a', back: 'b', reading: 'c' } });
  assert.deepEqual(r.cards, [{ front: '猫', reading: 'ねこ', back: 'mèo' }]);
  assert.throws(() => parseDeckText('a,b\nx,y\n', { header: true, columns: { front: 'zzz' } }), /Không tìm thấy cột/);
});

test('BOM and empty lines are tolerated; warnings flag long text', () => {
  const r = parseDeckText('﻿front\tback\n\n' + 'あ'.repeat(13) + '\t' + 'x'.repeat(61) + '\n');
  assert.equal(r.cards.length, 1);
  assert.equal(r.warnings.length, 2);
});

test('generateDeckModule emits one tab-separated line per card as a single string', async () => {
  const cards = [
    { id: 'a1', front: '学校', reading: 'がっこう', back: 'trường học', extra: 'HỌC HIỆU' },
    { front: 'ありがとう', reading: '', back: 'cảm ơn\tnhé' }
  ];
  const src = generateDeckModule(cards, { name: 'n5', source: 'x.tsv', generatedAt: '2026-11-07T00:00:00Z' });
  assert.match(src, /export var DECK_META = \{ name: "n5", count: 2 \};/);
  assert.equal(serializeDeck(cards), 'a1\t学校\tがっこう\ttrường học\tHỌC HIỆU\n\tありがとう\t\tcảm ơn nhé\t');
  assert.match(src, /^export default "a1\\t学校/m);
  const repo = createDeckRepository(serializeDeck(cards));
  assert.deepEqual(repo.getAll().map((c) => [c.id, c.front, c.reading, c.back, c.extra]), [
    ['a1', '学校', 'がっこう', 'trường học', 'HỌC HIỆU'],
    [repo.getAll()[1].id, 'ありがとう', '', 'cảm ơn nhé', '']
  ]);
  assert.ok(!/[`$]\{/.test(src), 'no template literals');
});

test('CLI parseArgs and run write a module to --out', async () => {
  const opts = parseArgs(['decks/x.tsv', '--front=1', '--back=word', '--header=no', '--sep=comma', '--name=N5']);
  assert.equal(opts.input, 'decks/x.tsv');
  assert.deepEqual(opts.columns, { front: '1', back: 'word' });
  assert.equal(opts.header, 'no');
  assert.equal(opts.separator, ',');
  assert.equal(opts.name, 'N5');
  assert.throws(() => parseArgs(['--bogus']), /không hợp lệ/);

  const dir = mkdtempSync(join(tmpdir(), 'cardband-'));
  const out = join(dir, 'deck.generated.js');
  const logs = [];
  const code = await run([join(here, '..', 'fixtures', 'quoted.csv'), `--out=${out}`], { log: (m) => logs.push(m), error: (m) => logs.push(m) });
  assert.equal(code, 0);
  assert.ok(existsSync(out));
  assert.match(read(out, 'utf8'), /count: 3/);
  assert.match(logs[0], /3 thẻ/);
  assert.equal(await run([], { log() {}, error() {} }), 2);
});
