/**
 * Stable card identifiers. When a deck row has no explicit id we hash the
 * front text with FNV-1a (32-bit) so progress survives edits to reading/meaning.
 */

export function fnv1a32(text) {
  var hash = 0x811c9dc5;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    // Fold UTF-16 code units byte by byte so CJK text hashes deterministically.
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function cardIdFromFront(front) {
  return 'h' + fnv1a32(String(front).trim()).toString(36);
}

export function normalizeCardId(explicitId, front) {
  if (explicitId !== undefined && explicitId !== null && String(explicitId).trim() !== '') {
    return String(explicitId).trim();
  }
  return cardIdFromFront(front);
}
