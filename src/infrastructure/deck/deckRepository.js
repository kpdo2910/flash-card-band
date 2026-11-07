/**
 * DeckRepository over the generated deck. Accepts either the deck text
 * (one card per line, tab-separated: id, front, reading, back, extra) or an
 * array of raw rows {i, f, r, b, x} (used by tests). Cards are parsed once,
 * on first use, so app start stays cheap.
 */
import { createCard, isValidCard } from '../../domain/card/card.js';

export function parseDeckText(text) {
  var rows = [];
  var lines = String(text || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    var f = lines[i].split('\t');
    rows.push({ i: f[0], f: f[1], r: f[2], b: f[3], x: f[4] });
  }
  return rows;
}

export function createDeckRepository(source) {
  var cards = null;
  return {
    getAll: function () {
      if (!cards) {
        var rawRows = typeof source === 'string' ? parseDeckText(source) : source;
        cards = [];
        for (var i = 0; i < rawRows.length; i++) {
          var row = rawRows[i];
          var card = createCard({ id: row.i, front: row.f, reading: row.r, back: row.b, extra: row.x });
          if (isValidCard(card)) cards.push(card);
        }
      }
      return cards;
    }
  };
}
