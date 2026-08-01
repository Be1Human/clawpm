#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const rootPackage = readJson('package.json');
const desktopPackage = readJson('desktop/package.json');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`[release:preflight] ERROR: ${message}`);
}

function warn(message) {
  console.warn(`[release:preflight] WARN: ${message}`);
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

console.log(`[release:preflight] version=${rootPackage.version} node=${process.version}`);
if (Number(process.versions.node.split('.')[0]) < 20) fail('Node.js 20 或更高版本是发布构建的最低要求');
if (rootPackage.version !== desktopPackage.version) {
  fail(`版本不一致：root=${rootPackage.version}, desktop=${desktopPackage.version}`);
}

for (const file of [
  'desktop/package.json',
  'desktop/assets/icon.png',
  'desktop/recovered/dist/main.js',
  'desktop/recovered/dist/preload.js',
  'web/vite.config.ts',
  'web/src/assets/logo.png',
]) {
  if (!existsSync(resolve(root, file))) fail(`缺少发布所需文件：${file}`);
}

const changelog = resolve(root, 'CHANGELOG.md');
if (!existsSync(changelog)) fail('缺少 CHANGELOG.md');
else if (!readFileSync(changelog, 'utf8').includes(`## [${rootPackage.version}]`)) {
  fail(`CHANGELOG.md 缺少 ${rootPackage.version} 条目`);
}

const status = git(['status', '--short']);
console.log(`[release:preflight] branch=${git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown')} commit=${git(['rev-parse', '--short=12', 'HEAD'], 'unknown')}`);
if (status) {
  const message = `工作区存在未提交改动，产物 manifest 会标记 dirty：\n${status}`;
  if (process.env.CI && process.env.RELEASE_ALLOW_DIRTY !== '1') fail(message);
  else warn(message);
}

if (failed) process.exit(1);
console.log('[release:preflight] OK');
