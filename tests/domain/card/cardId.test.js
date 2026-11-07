import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a32, cardIdFromFront, normalizeCardId } from '../../../src/domain/card/cardId.js';
import { createCard, isValidCard } from '../../../src/domain/card/card.js';

test('fnv1a32 is deterministic and differs for different CJK strings', () => {
  assert.equal(fnv1a32('学校'), fnv1a32('学校'));
  assert.notEqual(fnv1a32('学校'), fnv1a32('学生'));
  assert.notEqual(fnv1a32('がっこう'), fnv1a32('かっこう'));
  assert.equal(fnv1a32(''), 0x811c9dc5);
});

test('cardIdFromFront trims and prefixes', () => {
  assert.equal(cardIdFromFront('  学校 '), cardIdFromFront('学校'));
  assert.match(cardIdFromFront('学校'), /^h[0-9a-z]+$/);
});

test('normalizeCardId prefers an explicit id', () => {
  assert.equal(normalizeCardId(' n5-001 ', '学校'), 'n5-001');
  assert.equal(normalizeCardId(42, '学校'), '42');
  assert.equal(normalizeCardId('', '学校'), cardIdFromFront('学校'));
  assert.equal(normalizeCardId(undefined, '学校'), cardIdFromFront('学校'));
});

test('createCard trims fields and validates', () => {
  const c = createCard({ front: ' 学校 ', reading: 'がっこう ', back: ' trường học' });
  assert.deepEqual(c, { id: cardIdFromFront('学校'), front: '学校', reading: 'がっこう', back: 'trường học', extra: '' });
  assert.ok(isValidCard(c));
  assert.ok(!isValidCard(createCard({ front: '', back: 'x' })));
  assert.ok(!isValidCard(createCard({ front: 'x', back: '' })));
  assert.equal(createCard({ front: 'x', back: 'y' }).extra, '');
  assert.equal(createCard({ front: 'x', back: 'y', extra: ' HÁN ' }).extra, 'HÁN');
  assert.ok(!isValidCard(null));
});
