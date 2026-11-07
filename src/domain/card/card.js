/** Card entity: one vocabulary item. `extra` is an optional secondary line on the back (e.g. Hán Việt). */
import { normalizeCardId } from './cardId.js';

export function createCard(fields) {
  var front = String(fields.front || '').trim();
  return {
    id: normalizeCardId(fields.id, front),
    front: front,
    reading: String(fields.reading || '').trim(),
    back: String(fields.back || '').trim(),
    extra: String(fields.extra || '').trim()
  };
}

export function isValidCard(card) {
  return !!card && typeof card.front === 'string' && card.front.length > 0 &&
    typeof card.back === 'string' && card.back.length > 0;
}
