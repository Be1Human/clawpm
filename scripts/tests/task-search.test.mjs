import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesTaskSearch } from '../../web/src/lib/task-search.ts';

const task = {
  taskId: 'ENG-006',
  title: 'MARL research',
  tags: ['Multi-Agent'],
};

test('task search ignores separators and letter case in task IDs', () => {
  assert.equal(matchesTaskSearch(task, 'eng006'), true);
  assert.equal(matchesTaskSearch(task, 'ENG 006'), true);
  assert.equal(matchesTaskSearch(task, 'eng-006'), true);
});

test('task search still rejects unrelated text', () => {
  assert.equal(matchesTaskSearch(task, 'ENG-007'), false);
});
