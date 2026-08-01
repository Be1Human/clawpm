import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  AGENT_SKILL_FILES,
  injectSkill,
  listTargets,
  resolveSkillTarget,
} = require('../../desktop/recovered/dist/skill-injection.js');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clawpm-skill-injection-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const appPath = path.join(root, 'app');
  const homePath = path.join(root, 'home');
  const projectPath = path.join(root, 'project');
  const backupRoot = path.join(root, 'backups');
  const sourceRoot = path.join(appPath, 'skills', 'clawpm-project-workflow');
  for (const [index, relative] of AGENT_SKILL_FILES.entries()) {
    const target = path.join(sourceRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `source-${index}\n`, 'utf8');
  }
  await fs.mkdir(homePath, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  return { appPath, homePath, projectPath, backupRoot };
}

test('只解析平台白名单中的用户级与项目级目录', async t => {
  const options = await fixture(t);
  const codex = resolveSkillTarget({ ...options, platform: 'codex', scope: 'user' });
  const claude = resolveSkillTarget({ ...options, platform: 'claude', scope: 'project' });
  assert.equal(codex.targetPath, path.join(options.homePath, '.agents', 'skills', 'clawpm-project-workflow'));
  assert.equal(claude.targetPath, path.join(options.projectPath, '.claude', 'skills', 'clawpm-project-workflow'));
  assert.throws(
    () => resolveSkillTarget({ ...options, platform: '../outside', scope: 'user' }),
    /不支持的 Agent 平台/,
  );
});

test('可检测 4 个平台的用户级与项目级安装状态', async t => {
  const options = await fixture(t);
  const before = await listTargets(options);
  assert.equal(before.length, 8);
  assert.equal(before.every(target => target.status === 'not_installed'), true);

  const installed = await injectSkill({ ...options, platform: 'cursor', scope: 'project' });
  assert.equal(installed.changed, true);
  assert.equal(installed.backupPath, null);
  assert.equal(installed.target.status, 'current');

  const after = await listTargets(options);
  assert.equal(after.find(target => target.platform === 'cursor' && target.scope === 'project')?.status, 'current');
  assert.equal(after.filter(target => target.status === 'not_installed').length, 7);
});

test('重复注入保持幂等，更新修改版本前创建可恢复备份', async t => {
  const options = await fixture(t);
  const request = { ...options, platform: 'codebuddy', scope: 'user' };
  const first = await injectSkill(request);
  const unchanged = await injectSkill(request);
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.backupPath, null);

  await fs.writeFile(path.join(first.target.path, 'SKILL.md'), 'local-customization\n', 'utf8');
  const updated = await injectSkill(request);
  assert.equal(updated.changed, true);
  assert.ok(updated.backupPath);
  assert.equal(await fs.readFile(path.join(updated.backupPath, 'SKILL.md'), 'utf8'), 'local-customization\n');
  assert.equal(await fs.readFile(path.join(updated.target.path, 'SKILL.md'), 'utf8'), 'source-0\n');
});
