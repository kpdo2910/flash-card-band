#!/usr/bin/env node
/**
 * CLI: chuyển CSV / TSV / Anki "Notes in Plain Text" / Anki .apkg thành
 * src/infrastructure/deck/deck.generated.js
 *
 *   npm run deck -- decks/sample.tsv
 *   npm run deck -- decks/anki.txt --front=1 --reading=2 --back=3
 *   npm run deck -- decks/words.csv --front=word --back=meaning --header=yes --name="N5"
 *   npm run deck -- decks/n2.apkg --front=Word --reading=Hiragana --back=Meaning --extra=Sino-Vietnamese
 *
 * Tuỳ chọn: --front --reading --back --id --extra (số thứ tự cột 1-based hoặc tên header/trường),
 *           --header=auto|yes|no, --sep=tab|comma|semicolon|pipe, --name=..., --out=...
 *           .apkg: --deck=<tên bộ thẻ> --model=<tên kiểu ghi chú>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDeckText, buildCards, generateDeckModule } from './deckParser.js';
import { readApkg } from './anki.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(here, '../src/infrastructure/deck/deck.generated.js');

export function parseArgs(argv) {
  const opts = { columns: {}, header: 'auto' };
  const positional = [];
  for (const arg of argv) {
    const m = arg.match(/^--([a-z]+)(?:=(.*))?$/i);
    if (!m) {
      positional.push(arg);
      continue;
    }
    const [, key, value = ''] = m;
    if (['front', 'reading', 'back', 'id', 'extra'].includes(key)) opts.columns[key] = value;
    else if (key === 'deck') opts.deck = value;
    else if (key === 'model') opts.model = value;
    else if (key === 'header') opts.header = value;
    else if (key === 'sep') opts.separator = { tab: '\t', comma: ',', semicolon: ';', pipe: '|' }[value] || value;
    else if (key === 'name') opts.name = value;
    else if (key === 'out') opts.out = value;
    else throw new Error(`Tuỳ chọn không hợp lệ: --${key}`);
  }
  opts.input = positional[0];
  return opts;
}

const USAGE = 'Cách dùng: npm run deck -- <file.csv|tsv|txt|apkg> [--front=1 --reading=2 --back=3] [--header=auto|yes|no] [--name=...]';

export async function run(argv, io = { log: console.log, error: console.error }) {
  const opts = parseArgs(argv);
  if (!opts.input) {
    io.error(USAGE);
    return 2;
  }
  const inputPath = resolve(opts.input);
  const isApkg = /\.apkg$/i.test(inputPath);
  let result;
  if (isApkg) {
    const pkg = await readApkg(inputPath, { deck: opts.deck, model: opts.model });
    const built = buildCards(pkg.fieldNames, pkg.rows, { columns: opts.columns });
    result = { ...built, warnings: pkg.warnings.concat(built.warnings), apkg: pkg };
  } else {
    const text = readFileSync(inputPath, 'utf8');
    result = parseDeckText(text, { columns: opts.columns, header: opts.header, separator: opts.separator });
  }
  const outPath = resolve(opts.out || DEFAULT_OUT);
  const source = generateDeckModule(result.cards, {
    name: opts.name || basename(opts.input).replace(/\.[^.]+$/, ''),
    source: basename(opts.input),
    generatedAt: new Date().toISOString()
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, source, 'utf8');

  io.log(`✔ ${result.cards.length} thẻ → ${outPath}`);
  const col = (role) => (result.columns[role] !== undefined ? result.columns[role] + 1 : undefined);
  const colInfo = `cột: front=${col('front')}` +
    (col('reading') !== undefined ? ` reading=${col('reading')}` : ' reading=(furigana)') +
    ` back=${col('back')}` + (col('id') !== undefined ? ` id=${col('id')}` : '') +
    (col('extra') !== undefined ? ` extra=${col('extra')}` : '');
  if (isApkg) {
    const pkg = result.apkg;
    io.log(`  kiểu ghi chú: ${pkg.notetype} · trường: ${pkg.fieldNames.join(', ')}`);
    if (pkg.decks.length) io.log(`  bộ thẻ: ${pkg.decks.join(' | ')}`);
    io.log('  ' + colInfo);
  } else {
    const sepName = { '\t': 'tab', ',': 'dấu phẩy', ';': 'chấm phẩy', '|': 'gạch đứng' }[result.separator] || JSON.stringify(result.separator);
    io.log(`  phân cách: ${sepName} · header: ${result.hasHeader ? 'có' : 'không'} · ${colInfo}`);
  }
  for (const w of result.warnings.slice(0, 30)) io.log('  ! ' + w);
  if (result.warnings.length > 30) io.log(`  ! ... và ${result.warnings.length - 30} cảnh báo khác`);
  if (!result.cards.length) {
    io.error('Không có thẻ nào được tạo. Kiểm tra lại định dạng file hoặc tuỳ chọn cột.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (e) => {
    console.error('Lỗi: ' + e.message);
    process.exitCode = 1;
  });
}
