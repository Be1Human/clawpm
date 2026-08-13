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
  installRecommended,
  listTargets,
  resolveSkillTarget,
  resolveSkillTargets,
} = require('../../desktop/recovered/dist/skill-injection.js');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clawpm-skill-injection-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const appPath = path.join(root, 'app');
  const homePath = path.join(root, 'home');
  const projectPath = path.join(root, 'project');
  const backupRoot = path.join(root, 'backups');
  const globalAgentsPath = path.join(homePath, '.codex', 'AGENTS.md');
  const manifestPath = path.join(root, 'user-data', 'skill-installations', 'clawpm-project-workflow.json');
  const sourceRoot = path.join(appPath, 'skills', 'clawpm-project-workflow');
  for (const [index, relative] of AGENT_SKILL_FILES.entries()) {
    const target = path.join(sourceRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `source-${index}\n`, 'utf8');
  }
  await fs.mkdir(homePath, { recursive: true });
  await fs.mkdir(projectPath, { recursive: true });
  return { appPath, homePath, projectPath, backupRoot, globalAgentsPath, manifestPath, appVersion: 'test' };
}

test('内置 Skill 强制任务描述使用背景、目标和涉及文档结构', async () => {
  const skill = await fs.readFile(path.resolve('desktop/skills/clawpm-project-workflow/SKILL.md'), 'utf8');
  const protocol = await fs.readFile(path.resolve('desktop/skills/clawpm-project-workflow/references/decomposition-protocol.md'), 'utf8');

  for (const heading of ['### 背景', '### 目标', '### 涉及文档']) {
    assert.match(skill, new RegExp(heading));
  }
  assert.match(skill, /缺少任一必填段落时不得写入新任务或领取现有任务/);
  assert.match(skill, /没有时写 `- 无`/);
  assert.match(protocol, /description 按“背景、目标、涉及文档”分段/);
});

test('只解析平台白名单中的用户级与项目级目录', async t => {
  const options = await fixture(t);
  const codex = resolveSkillTarget({ ...options, platform: 'codex', scope: 'user' });
  const claude = resolveSkillTarget({ ...options, platform: 'claude', scope: 'project' });
  assert.equal(codex.targetPath, path.join(options.homePath, '.agents', 'skills', 'clawpm-project-workflow'));
  const codexTargets = resolveSkillTargets({ ...options, platform: 'codex', scope: 'user' });
  assert.deepEqual(codexTargets.map(target => target.targetPath), [
    path.join(options.homePath, '.agents', 'skills', 'clawpm-project-workflow'),
    path.join(options.homePath, '.codex', 'skills', 'clawpm-project-workflow'),
  ]);
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

test('一键安装覆盖全部用户目录并记录全局指引与安装清单', async t => {
  const options = await fixture(t);
  const result = await installRecommended(options);
  assert.equal(result.ok, true);
  assert.equal(result.installedPlatforms, 4);
  assert.equal(result.installedPaths.length, 5);
  assert.equal(result.failures.length, 0);

  const agents = await fs.readFile(options.globalAgentsPath, 'utf8');
  assert.match(agents, /clawpm:global-agent:start/);
  assert.match(agents, /不需要 ClawPM CLI/);

  const manifest = JSON.parse(await fs.readFile(options.manifestPath, 'utf8'));
  assert.equal(manifest.format, 'clawpm-skill-installation@1');
  assert.equal(manifest.targets.length, 4);
  assert.equal(manifest.targets.find(target => target.platform === 'codex').paths.length, 2);
  assert.equal(manifest.cli.required, false);

  const targets = await listTargets(options);
  assert.equal(targets.filter(target => target.scope === 'user').every(target => target.status === 'current'), true);

  const repeated = await installRecommended(options);
  assert.equal(repeated.ok, true);
  const repeatedAgents = await fs.readFile(options.globalAgentsPath, 'utf8');
  assert.equal(repeatedAgents.match(/clawpm:global-agent:start/g)?.length, 1);
});
