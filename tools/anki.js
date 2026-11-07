/**
 * Reads an Anki package (.apkg) and returns the notes as a header row plus
 * data rows, ready for deckParser.buildCards(). Node only (build time).
 *
 * Supports the legacy schema (collection.anki2 / collection.anki21 with JSON
 * in `col.models` / `col.decks`) and the newer one (collection.anki21b, zstd
 * compressed, `notetypes` / `fields` / `decks` tables).
 *
 *   readApkg(path, { deck?, model? }) → {
 *     fieldNames,   // ['STT', 'Word', ..., 'guid']   (guid is appended last)
 *     rows,         // [['1', '人生 ...', ..., 'abc123'], ...]
 *     notetype,     // name of the note type used
 *     decks,        // names of all decks in the package
 *     warnings
 *   }
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { readZipEntries } from './zip.js';

const FIELD_SEP = '\x1f';
const COLLECTION_FILES = ['collection.anki21b', 'collection.anki21', 'collection.anki2'];

/** Picks and decompresses the collection database inside the package. */
export function extractCollection(zipBuffer) {
  const entries = readZipEntries(zipBuffer);
  for (const name of COLLECTION_FILES) {
    const e = entries.get(name);
    if (!e || e.size === 0) continue;
    let data = e.read();
    if (name.endsWith('.anki21b')) data = zstdDecompressSync(data);
    return { name, data };
  }
  throw new Error('Không tìm thấy collection.anki2* trong file .apkg');
}

function tableExists(db, name) {
  const row = db.prepare("select name from sqlite_master where type='table' and name=?").get(name);
  return !!row;
}

function parseJsonOr(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

/** Note types as Map<id, { name, fields: string[] }>. */
export function readNotetypes(db) {
  const out = new Map();
  const col = db.prepare('select models from col').get();
  const models = col ? parseJsonOr(col.models, {}) : {};
  for (const id of Object.keys(models)) {
    const m = models[id];
    const fields = (m.flds || []).slice().sort((a, b) => a.ord - b.ord).map((f) => f.name);
    if (fields.length) out.set(String(id), { name: m.name || String(id), fields });
  }
  if (out.size === 0 && tableExists(db, 'notetypes') && tableExists(db, 'fields')) {
    for (const nt of db.prepare('select id, name from notetypes').all()) {
      const fields = db.prepare('select name from fields where ntid=? order by ord').all(nt.id).map((f) => f.name);
      out.set(String(nt.id), { name: nt.name, fields });
    }
  }
  return out;
}

/** Decks as Map<id, name>. */
export function readDecks(db) {
  const out = new Map();
  const col = db.prepare('select decks from col').get();
  const decks = col ? parseJsonOr(col.decks, {}) : {};
  for (const id of Object.keys(decks)) out.set(String(id), decks[id].name || String(id));
  if (out.size === 0 && tableExists(db, 'decks')) {
    for (const d of db.prepare('select id, name from decks').all()) out.set(String(d.id), String(d.name).replace(/\x1f/g, '::'));
  }
  return out;
}

function matchesName(name, filter) {
  return String(name).toLowerCase().includes(String(filter).toLowerCase());
}

export async function readApkg(path, options = {}) {
  const { name: fileName, data } = extractCollection(readFileSync(path));
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'cardband-apkg-'));
  const dbPath = join(dir, fileName.replace(/b$/, ''));
  writeFileSync(dbPath, data);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return readNotes(db, options);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

export function readNotes(db, options = {}) {
  const warnings = [];
  const notetypes = readNotetypes(db);
  const decks = readDecks(db);
  if (notetypes.size === 0) throw new Error('Không đọc được kiểu ghi chú (note type) trong file .apkg');

  const notes = db.prepare(
    'select n.id as id, n.guid as guid, n.mid as mid, n.flds as flds, min(c.did) as did ' +
    'from notes n left join cards c on c.nid = n.id group by n.id order by n.id'
  ).all();

  let selected = notes;
  if (options.deck) {
    const deckIds = new Set([...decks.entries()].filter(([, name]) => matchesName(name, options.deck)).map(([id]) => Number(id)));
    if (deckIds.size === 0) throw new Error(`Không có bộ thẻ nào khớp "${options.deck}". Có: ${[...decks.values()].join(', ')}`);
    selected = notes.filter((n) => deckIds.has(Number(n.did)));
  }

  // Note type: explicit --model, else the most common one among the selected notes.
  const counts = new Map();
  for (const n of selected) counts.set(String(n.mid), (counts.get(String(n.mid)) || 0) + 1);
  let mid;
  if (options.model) {
    mid = [...notetypes.keys()].find((id) => matchesName(notetypes.get(id).name, options.model));
    if (!mid) throw new Error(`Không có kiểu ghi chú nào khớp "${options.model}". Có: ${[...notetypes.values()].map((m) => m.name).join(', ')}`);
  } else {
    mid = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)[0];
  }
  if (counts.size > 1) {
    const skipped = [...counts.entries()].filter(([id]) => id !== mid).reduce((a, [, c]) => a + c, 0);
    warnings.push(`File có ${counts.size} kiểu ghi chú; dùng "${notetypes.get(mid).name}", bỏ qua ${skipped} ghi chú kiểu khác (chọn bằng --model=...)`);
  }

  const nt = notetypes.get(mid) || { name: mid, fields: [] };
  const rows = [];
  for (const n of selected) {
    if (String(n.mid) !== mid) continue;
    const fields = String(n.flds).split(FIELD_SEP);
    while (fields.length < nt.fields.length) fields.push('');
    rows.push(fields.slice(0, nt.fields.length).concat([String(n.guid)]));
  }
  return {
    fieldNames: nt.fields.concat(['guid']),
    rows,
    notetype: nt.name,
    decks: [...decks.values()].filter((d) => d !== 'Default'),
    warnings
  };
}
