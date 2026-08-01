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
  const current = task({ acceptanceCriteria: ['可以验证结果'] });
  assert.equal(nextTaskAction(current, [current]).action, 'claim');
});

test('领取前必须先定义验收标准', () => {
  const current = task();
  assert.equal(isClaimActive(current), false);
  assert.equal(nextTaskAction(current, [current]).action, 'define_acceptance');
});

test('描述清单过大的任务必须继续拆解，不能直接领取', () => {
  const current = task({
    acceptanceCriteria: ['整体功能可用'],
    description: Array.from({ length: 9 }, (_, index) => `实现步骤 ${index + 1}`),
  });
  assert.equal(nextTaskAction(current, [current]).action, 'decompose');
});

test('已有未完成子任务时必须先推进子任务', () => {
  const current = task({ acceptanceCriteria: ['整体功能可用'] });
  const child = task({ id: 'APP-001-001', parent: 'APP-001', acceptanceCriteria: ['子结果可验证'] });
  assert.equal(nextTaskAction(current, [current, child]).action, 'advance_children');
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
