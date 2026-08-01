#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = join(root, 'desktop');
const web = join(root, 'web');
const buildOutput = join(desktop, 'release-build');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const artifactDir = join(root, 'release-artifacts', `v${version}`, 'windows');

function run(command, args, cwd, env = {}) {
  const needsCmd = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  const quote = value => /^[A-Za-z0-9_./:=,\\-]+$/.test(value)
    ? value
    : `"${String(value).replaceAll('"', '\\"')}"`;
  const executable = needsCmd ? 'cmd.exe' : command;
  const actualArgs = needsCmd
    ? ['/d', '/s', '/c', [command, ...args].map(quote).join(' ')]
    : args;
  const result = spawnSync(executable, actualArgs, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    const reason = result.error ? `：${result.error.message}` : '';
    throw new Error(`${command} ${args.join(' ')} 失败，退出码 ${result.status}${reason}`);
  }
}

function localBin(packageDir, name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const candidates = [
    join(packageDir, 'node_modules', '.bin', `${name}${suffix}`),
    join(root, 'node_modules', '.bin', `${name}${suffix}`),
  ];
  const file = candidates.find(c => existsSync(c));
  if (!file) throw new Error(`缺少 ${name}，请先执行 pnpm install`);
  return file;
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

if (process.platform !== 'win32') throw new Error('Windows 安装包必须在 Windows 构建机上生成');
run(process.execPath, [join(root, 'scripts', 'release', 'preflight.mjs')], root);

rmSync(buildOutput, { recursive: true, force: true, maxRetries: 6, retryDelay: 500 });
rmSync(artifactDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 500 });
mkdirSync(artifactDir, { recursive: true });

console.log('[release] 1/3 构建 Electron 模式前端');
run(localBin(web, 'tsc'), ['-b'], web, { CLAWPM_ELECTRON: '1' });
run(localBin(web, 'vite'), ['build'], web, { CLAWPM_ELECTRON: '1' });

console.log('[release] 2/3 使用已恢复的 Electron 运行时');
if (!existsSync(join(desktop, 'recovered', 'dist', 'main.js'))) {
  throw new Error('缺少 desktop/recovered/dist/main.js，无法构建桌面应用');
}

console.log('[release] 3/3 构建 NSIS x64 安装包');
run(localBin(desktop, 'electron-builder'), ['--win', 'nsis', '--x64'], desktop);

const releaseFiles = readdirSync(buildOutput);
const selected = releaseFiles.filter(name =>
  name === `ClawPM-Setup-${version}-x64.exe` ||
  name === `ClawPM-Setup-${version}-x64.exe.blockmap` ||
  name === 'latest.yml'
);
if (!selected.some(name => name.endsWith('.exe'))) throw new Error('electron-builder 未生成预期的 EXE 安装包');

for (const name of selected) copyFileSync(join(buildOutput, name), join(artifactDir, name));
const files = selected.sort().map(name => {
  const file = join(artifactDir, name);
  return { path: relative(join(root, 'release-artifacts', `v${version}`), file).replaceAll('\\', '/'), size: statSync(file).size, sha256: sha256(file) };
});
const manifest = {
  name: 'clawpm',
  version,
  builtAt: new Date().toISOString(),
  git: { branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown'), commit: git(['rev-parse', 'HEAD'], 'unknown'), dirty: Boolean(git(['status', '--short'])) },
  platform: { os: process.platform, arch: process.arch, node: process.version },
  files,
};
const versionDir = join(root, 'release-artifacts', `v${version}`);
writeFileSync(join(versionDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(versionDir, 'checksums.txt'), `${files.map(file => `${file.sha256}  ${file.path}`).join('\n')}\n`);

console.log('\n[release] Windows 发行版构建完成');
for (const file of files) console.log(`- ${file.path} (${file.size} bytes) sha256=${file.sha256}`);
console.log(`[release] output=${versionDir}`);
