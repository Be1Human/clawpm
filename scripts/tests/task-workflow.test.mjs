import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completionChecks,
  isClaimActive,
  nextTaskAction,
} from '../../web/src/vault/task-workflow.ts';

const now = new Date(Date.now() + 60 * 60 * 1000).toISOString();

function task(overrides = {}) {
  return {
    id: 'APP-001',
    title: '实现工作流',
    type: 'feature',
    status: 'planned',
    progress: 0,
    acceptanceCriteria: [],
    deps: [],
    testResults: [],
    ...overrides,
  };
}

test('未领取任务的下一步是领取', () => {
  assert.equal(nextTaskAction(task(), [task()]).action, 'claim');
});

test('领取后必须先定义验收标准', () => {
  const current = task({ claim: { agent: 'codex', active: true, leaseUntil: now } });
  assert.equal(isClaimActive(current), true);
  assert.equal(nextTaskAction(current, [current]).action, 'define_acceptance');
});

test('通过测试后进入提交验收', () => {
  const current = task({
    status: 'review',
    progress: 90,
    acceptanceCriteria: ['可以拆分任务'],
    claim: { agent: 'codex', active: true, leaseUntil: now },
    testResults: [{ status: 'passed', command: 'pnpm test' }],
  });
  assert.equal(nextTaskAction(current, [current]).action, 'complete');
  assert.equal(completionChecks(current, [current]).every(check => check.passed), true);
});

test('未完成依赖与子任务会阻止完成', () => {
  const dependency = task({ id: 'APP-002', status: 'active' });
  const child = task({ id: 'APP-001-001', parent: 'APP-001', status: 'active' });
  const current = task({
    acceptanceCriteria: ['可以拆分任务'],
    deps: ['APP-002'],
    claim: { agent: 'codex', active: true, leaseUntil: now },
    testResults: [{ status: 'passed', command: 'pnpm test' }],
  });
  const failed = completionChecks(current, [current, dependency, child]).filter(check => !check.passed).map(check => check.id);
  assert.deepEqual(failed.sort(), ['children', 'dependencies']);
});

test('已释放租约不再有效', () => {
  assert.equal(isClaimActive(task({ claim: { agent: 'codex', active: false, leaseUntil: now } })), false);
});
