import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyQueue, countForHome } from '../../../src/domain/session/studyQueue.js';
import { CardState, newProgress } from '../../../src/domain/card/cardProgress.js';

const NOW = 1_000_000;
const deck = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, front: id, reading: '', back: id }));

function review(due) {
  return { ...newProgress(), state: CardState.REVIEW, due, stability: 5, difficulty: 5 };
}
function learning(due) {
  return { ...newProgress(), state: CardState.LEARNING, due, stability: 1, difficulty: 5 };
}

test('due cards come first sorted by due, then new cards in deck order', () => {
  const progress = { a: review(NOW - 10), c: review(NOW - 500), e: review(NOW + 999_999) };
  const r = buildStudyQueue(deck, progress, { newPerDay: 10 }, NOW, 0);
  assert.deepEqual(r.queue.map((x) => x.card.id), ['c', 'a', 'b', 'd', 'f']);
  assert.equal(r.dueCount, 2);
  assert.equal(r.newCount, 3);
});

test('new cards are limited by the daily allowance minus those already introduced', () => {
  const r = buildStudyQueue(deck, {}, { newPerDay: 4 }, NOW, 3);
  assert.deepEqual(r.queue.map((x) => x.card.id), ['a']);
  assert.equal(r.newCount, 1);
  const none = buildStudyQueue(deck, {}, { newPerDay: 4 }, NOW, 4);
  assert.equal(none.queue.length, 0);
});

test('cards not yet due are excluded unless they are learning cards', () => {
  const progress = { a: review(NOW + 1), b: learning(NOW + 60_000) };
  const r = buildStudyQueue(deck, progress, { newPerDay: 0 }, NOW, 0);
  assert.deepEqual(r.queue.map((x) => x.card.id), ['b']);
  assert.equal(r.learningCount, 1);
  assert.equal(r.dueCount, 0);
});

test('pending learning cards are placed after new cards', () => {
  const progress = { a: learning(NOW + 60_000), b: review(NOW - 1) };
  const r = buildStudyQueue(deck, progress, { newPerDay: 1 }, NOW, 0);
  assert.deepEqual(r.queue.map((x) => x.card.id), ['b', 'c', 'a']);
});

test('empty deck yields an empty queue', () => {
  const r = buildStudyQueue([], {}, { newPerDay: 10 }, NOW, 0);
  assert.equal(r.queue.length, 0);
});

test('countForHome summarises due / new / learned', () => {
  const progress = { a: review(NOW - 1), b: review(NOW + 1), c: learning(NOW - 1) };
  const c = countForHome(deck, progress, { newPerDay: 2 }, NOW, 1);
  assert.equal(c.total, 6);
  assert.equal(c.due, 2);
  assert.equal(c.learned, 3);
  assert.equal(c.unseen, 3);
  assert.equal(c.newAvailable, 1);
});
