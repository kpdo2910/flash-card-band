/** Review grades, numbered as in FSRS. */
export var Grade = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4
};

export var GRADE_NAMES = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy'
};

export function isGrade(value) {
  return value === 1 || value === 2 || value === 3 || value === 4;
}
