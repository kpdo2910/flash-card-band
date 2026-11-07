/**
 * Pure parsing logic for deck files (CSV / TSV / Anki "Notes in Plain Text").
 * Runs in Node only (build time), so modern syntax is fine here.
 *
 *   parseDeckText(text, options) → { cards, warnings, separator, hasHeader, columns }
 *   generateDeckModule(cards, meta) → JavaScript source for deck.generated.js
 */

const HEADER_ALIASES = {
  id: ['id', 'guid', 'key', 'ma', 'mã'],
  front: ['front', 'word', 'kanji', 'vocab', 'vocabulary', 'term', 'expression', 'japanese', 'jp', 'tu', 'từ', 'tuvung', 'từ vựng', 'mặt trước'],
  reading: ['reading', 'kana', 'furigana', 'yomi', 'yomikata', 'hiragana', 'pronunciation', 'doc', 'đọc', 'cách đọc', 'phien am', 'phiên âm'],
  back: ['back', 'meaning', 'definition', 'translation', 'vietnamese', 'vi', 'nghia', 'nghĩa', 'mặt sau', 'english', 'en']
};

const SEPARATOR_NAMES = {
  tab: '\t', comma: ',', semicolon: ';', pipe: '|', colon: ':', space: ' '
};

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Reads Anki `#key:value` header lines; returns { directives, body }. */
export function splitAnkiDirectives(text) {
  const lines = text.split(/\r?\n/);
  const directives = {};
  let i = 0;
  while (i < lines.length && /^#\w[\w ]*:/.test(lines[i])) {
    const m = lines[i].match(/^#([\w ]+):(.*)$/);
    if (m) directives[m[1].trim().toLowerCase()] = m[2].trim();
    i++;
  }
  return { directives, body: lines.slice(i).join('\n') };
}

export function detectSeparator(body) {
  const lines = body.split('\n').filter((l) => l.trim()).slice(0, 40);
  const candidates = ['\t', ',', ';', '|'];
  let best = '\t';
  let bestScore = -1;
  for (const sep of candidates) {
    const counts = lines.map((l) => l.split(sep).length - 1);
    const withSep = counts.filter((c) => c > 0);
    const fraction = lines.length ? withSep.length / lines.length : 0;
    if (fraction < 0.5) continue;
    const mean = withSep.reduce((a, b) => a + b, 0) / withSep.length;
    const score = fraction * 1000 + mean - variance(withSep);
    if (score > bestScore) {
      bestScore = score;
      best = sep;
    }
  }
  return best;
}

function variance(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
}

/** RFC-4180 style parser supporting quoted fields with embedded separators/newlines. */
export function parseDelimited(body, separator) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === separator) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function cleanField(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.replace(/\[sound:[^\]]*\]/gi, '');
  s = s.replace(/<br\s*\/?>/gi, ' / ');
  s = s.replace(/<\/(p|div|li)>/gi, ' / ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/&(#?\w+);/g, (m, name) => {
    if (ENTITIES[name] !== undefined) return ENTITIES[name];
    if (/^#\d+$/.test(name)) return String.fromCodePoint(parseInt(name.slice(1), 10));
    if (/^#x[0-9a-f]+$/i.test(name)) return String.fromCodePoint(parseInt(name.slice(2), 16));
    return m;
  });
  s = s.replace(/\s*\/\s*(\/\s*)+/g, ' / ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^\/\s*|\s*\/$/g, '').trim();
  return s;
}

/**
 * Anki furigana: "日本[にほん]語[ご]" (a space before a kanji block separates readings).
 * Returns { base: "日本語", reading: "にほんご" }; reading is '' when no brackets.
 */
export function splitFurigana(text) {
  if (!/\[[^\]]+\]/.test(text)) return { base: text, reading: '' };
  let base = '';
  let reading = '';
  const re = /\s?([^\s\[\]]+)\[([^\]]+)\]|([^\[\]]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      base += m[1];
      reading += m[2];
    } else {
      const plain = m[3].replace(/^\s+/, '');
      base += plain;
      reading += plain;
    }
  }
  return { base: base.trim(), reading: reading.trim() };
}

function normalizeHeaderName(name) {
  return cleanField(name).toLowerCase().replace(/[_\-]/g, ' ').trim();
}

function matchHeader(headerRow) {
  const found = {};
  headerRow.forEach((cell, idx) => {
    const n = normalizeHeaderName(cell);
    for (const role of Object.keys(HEADER_ALIASES)) {
      if (found[role] === undefined && HEADER_ALIASES[role].includes(n)) found[role] = idx;
    }
  });
  return found;
}

function looksLikeHeader(row) {
  const matched = matchHeader(row);
  return matched.front !== undefined && matched.back !== undefined;
}

/**
 * Resolves user column options (1-based numbers or header names) to 0-based indexes.
 */
function resolveColumns(options, headerRow, width) {
  const cols = {};
  const fromHeader = headerRow ? matchHeader(headerRow) : {};
  let explicit = false;
  for (const role of ['id', 'front', 'reading', 'back', 'extra']) {
    const opt = options.columns && options.columns[role];
    if (opt === undefined || opt === null || opt === '') {
      if (fromHeader[role] !== undefined) cols[role] = fromHeader[role];
      continue;
    }
    explicit = true;
    if (typeof opt === 'number' || /^\d+$/.test(String(opt))) {
      cols[role] = parseInt(opt, 10) - 1;
    } else if (headerRow) {
      const idx = headerRow.findIndex((h) => normalizeHeaderName(h) === normalizeHeaderName(opt));
      if (idx < 0) throw new Error(`Không tìm thấy cột "${opt}" trong header`);
      cols[role] = idx;
    } else {
      throw new Error(`Cột "${opt}" cần header; dùng số thứ tự cột thay thế`);
    }
  }
  const used = () => new Set(Object.values(cols));
  const firstFree = () => {
    const u = used();
    let i = 0;
    while (u.has(i)) i++;
    return i;
  };
  if (cols.front === undefined) cols.front = firstFree();
  if (!explicit && Object.keys(fromHeader).length === 0) {
    // Pure positional layout: front, [reading], back
    if (width >= 3) {
      if (cols.reading === undefined) cols.reading = 1;
      if (cols.back === undefined) cols.back = 2;
    }
  }
  if (cols.back === undefined) cols.back = firstFree();
  return cols;
}

/**
 * @param {string} text
 * @param {{columns?: {id?, front?, reading?, back?, extra?}, header?: 'auto'|boolean, separator?: string}} [options]
 */
export function parseDeckText(text, options = {}) {
  const { directives, body } = splitAnkiDirectives(stripBom(text));
  let separator = options.separator;
  if (!separator && directives.separator) separator = SEPARATOR_NAMES[directives.separator.toLowerCase()] || directives.separator;
  if (!separator) separator = detectSeparator(body);

  const rows = parseDelimited(body, separator);
  if (!rows.length) return { cards: [], warnings: ['File không có dòng dữ liệu'], separator, hasHeader: false, columns: {} };

  let hasHeader;
  if (options.header === true || options.header === 'yes') hasHeader = true;
  else if (options.header === false || options.header === 'no') hasHeader = false;
  else hasHeader = looksLikeHeader(rows[0]);

  const headerRow = hasHeader ? rows[0] : null;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const built = buildCards(headerRow, dataRows, options);
  return { ...built, separator, hasHeader };
}

/**
 * Turns a header row (or null) plus data rows into cards. Shared by the text
 * parser and the Anki package reader.
 *
 * Column roles: front, reading, back, id and the optional `extra`, shown as a
 * second, smaller line on the back side (e.g. Sino-Vietnamese reading).
 */
export function buildCards(headerRow, dataRows, options = {}) {
  const warnings = [];
  const width = Math.max(...dataRows.map((r) => r.length), 0);
  const columns = resolveColumns(options, headerRow, width);
  const headerOffset = headerRow ? 1 : 0;

  const cards = [];
  const seen = new Map();
  dataRows.forEach((row, i) => {
    const lineNo = i + 1 + headerOffset;
    const get = (idx) => (idx === undefined ? '' : cleanField(row[idx]));
    let front = get(columns.front);
    let reading = get(columns.reading);
    let back = get(columns.back);
    const extra = get(columns.extra);
    const id = columns.id !== undefined ? get(columns.id) : '';

    if (!reading || /\[[^\]]+\]/.test(front)) {
      const f = splitFurigana(front);
      front = f.base;
      if (!reading && f.reading && f.reading !== f.base) reading = f.reading;
    }
    if (!front && reading) {
      // Kana-only entries often leave the kanji column empty: the reading is the word.
      front = reading;
      reading = '';
    }
    if (reading === front) reading = '';
    if (!back && extra) back = extra;
    if (!front || !back) {
      warnings.push(`Dòng ${lineNo}: thiếu mặt trước hoặc mặt sau, bỏ qua`);
      return;
    }
    const key = id || front;
    if (seen.has(key)) {
      warnings.push(`Dòng ${lineNo}: trùng "${key}" với dòng ${seen.get(key)}, bỏ qua`);
      return;
    }
    seen.set(key, lineNo);
    if (front.length > 12) warnings.push(`Dòng ${lineNo}: mặt trước dài (${front.length} ký tự), có thể bị cắt trên màn hình`);
    if (back.length > 60) warnings.push(`Dòng ${lineNo}: nghĩa dài (${back.length} ký tự), có thể bị cắt trên màn hình`);
    const card = { front, reading, back };
    if (extra && extra !== back) card.extra = extra;
    if (id) card.id = id;
    cards.push(card);
  });

  return { cards, warnings, columns };
}

function jsString(s) {
  return JSON.stringify(s);
}

const FIELD_SEP = '\t';
const LINE_SEP = '\n';

function deckField(s) {
  return String(s == null ? '' : s).replace(/[\t\n\r]+/g, ' ');
}

/**
 * Serialises cards as one text blob: one card per line, fields separated by
 * tabs in the order id, front, reading, back, extra. The band parses it with
 * deckRepository. A plain string stays small in the Vela debug bundle, while
 * an array of object literals is pretty-printed to several times its size.
 */
export function serializeDeck(cards) {
  return cards.map((c) => [c.id, c.front, c.reading, c.back, c.extra].map(deckField).join(FIELD_SEP)).join(LINE_SEP);
}

/** Emits an ES module exporting the deck text (default) and DECK_META. ES5-compatible for the band. */
export function generateDeckModule(cards, meta = {}) {
  const name = meta.name || 'deck';
  return [
    '/* eslint-disable */',
    '// FILE SINH TỰ ĐỘNG bởi tools/build-deck.js – đừng sửa tay, hãy sửa file nguồn rồi chạy `npm run deck`.',
    `// Nguồn: ${meta.source || 'không rõ'} · ${cards.length} thẻ · ${meta.generatedAt || new Date().toISOString()}`,
    '// Mỗi dòng một thẻ: id \\t mặt trước \\t cách đọc \\t mặt sau \\t dòng phụ (xem infrastructure/deck/deckRepository.js).',
    `export var DECK_META = { name: ${jsString(name)}, count: ${cards.length} };`,
    `export default ${jsString(serializeDeck(cards))};`,
    ''
  ].join('\n');
}
