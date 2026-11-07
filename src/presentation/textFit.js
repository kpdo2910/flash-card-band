/**
 * Rough text metrics for picking a font size that fits the band screen.
 * CJK / full-width glyphs are about one em wide, Latin glyphs ~0.55 em.
 */

export function isWide(code) {
  return (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6);
}

export function estimateTextWidth(text, fontSize) {
  var w = 0;
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c === 32) w += 0.3;
    else if (isWide(c)) w += 1;
    else if (c >= 0xd800 && c <= 0xdbff) { w += 1; i++; } // surrogate pair (emoji etc.)
    else w += 0.55;
  }
  return w * fontSize;
}

/** Largest size from `sizes` (descending) whose single line fits `maxWidth`; else the smallest. */
export function fitFontSize(text, maxWidth, sizes) {
  for (var i = 0; i < sizes.length; i++) {
    if (estimateTextWidth(text, sizes[i]) <= maxWidth) return sizes[i];
  }
  return sizes[sizes.length - 1];
}

/** Greedy word-wrap estimate; breaks long CJK runs by character. Returns the lines. */
export function wrapLines(text, fontSize, maxWidth) {
  var words = text.split(' ');
  var lines = [];
  var line = '';
  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    var candidate = line ? line + ' ' + word : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // word alone too wide → split by character
    if (estimateTextWidth(word, fontSize) > maxWidth) {
      var chunk = '';
      for (var j = 0; j < word.length; j++) {
        if (estimateTextWidth(chunk + word[j], fontSize) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = '';
        }
        chunk += word[j];
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Picks the largest size whose wrapped block fits in maxWidth × maxHeight.
 * Returns { fontSize, lines, truncated } where `lines` is capped to what fits.
 */
export function fitTextBlock(text, maxWidth, maxHeight, sizes, lineHeightRatio) {
  var ratio = lineHeightRatio || 1.3;
  var last = null;
  for (var i = 0; i < sizes.length; i++) {
    var size = sizes[i];
    var lines = wrapLines(text, size, maxWidth);
    var maxLines = Math.max(1, Math.floor(maxHeight / (size * ratio)));
    last = { fontSize: size, lines: lines, maxLines: maxLines };
    if (lines.length <= maxLines) return { fontSize: size, lines: lines, truncated: false };
  }
  var cut = last.lines.slice(0, last.maxLines);
  if (cut.length) cut[cut.length - 1] = ellipsize(cut[cut.length - 1]);
  return { fontSize: last.fontSize, lines: cut, truncated: true };
}

function ellipsize(s) {
  return s.length > 1 ? s.slice(0, s.length - 1) + '…' : s;
}
