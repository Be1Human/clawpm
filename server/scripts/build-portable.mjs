// 打包 clawpm 为自包含便携发行版（Windows）。
// 产物 server/dist-portable/：clawpm.cjs（打包后端）+ node.exe + better-sqlite3 原生模块
// + web（前端，如已构建）+ clawpm.cmd 启动器。双击 clawpm.cmd 即在当前目录作为 vault 打开。
//
// 说明：原计划 bun build --compile 单 exe，但 Fastify 5 在 Bun 1.3.14(Windows) 下 listen 后
// 无法接受连接（见 db/sqlite-driver.ts 注释），故走 Node 运行时便携发行版。
//
// 用法: node scripts/build-portable.mjs

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverDir, '..');

// esbuild 是 pnpm 传递依赖，从 .pnpm 存储解析
function loadEsbuild() {
  try {
    return require('esbuild');
  } catch {
    const pnpmDir = path.join(repoRoot, 'node_modules', '.pnpm');
    const dir = fs.readdirSync(pnpmDir).find((d) => /^esbuild@/.test(d));
    if (!dir) throw new Error('未找到 esbuild，请先 pnpm install');
    return require(path.join(pnpmDir, dir, 'node_modules', 'esbuild'));
  }
}
const esbuild = loadEsbuild();
const out = path.join(serverDir, 'dist-portable');

function log(msg) {
  console.log(`[build] ${msg}`);
}

// ── 1. 清理输出目录 ──
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// ── 2. esbuild 打包后端为单 CJS ──
log('esbuild 打包后端 → clawpm.cjs');
await esbuild.build({
  entryPoints: [path.join(serverDir, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['better-sqlite3'],
  banner: { js: 'const __IMPORT_META_URL__=require("url").pathToFileURL(__filename).href;' },
  define: { 'import.meta.url': '__IMPORT_META_URL__' },
  outfile: path.join(out, 'clawpm.cjs'),
});

// ── 3. 复制 better-sqlite3 原生模块及运行时依赖（含预编译 .node）──
// pnpm 按包嵌套解析：从每个包自身的 require 链解析其依赖，避免 hoist 假设
log('复制 better-sqlite3 原生模块及运行时依赖');
const nmOut = path.join(out, 'node_modules');
fs.mkdirSync(nmOut, { recursive: true });
const copyPkg = (fromRequire, dep) => {
  const pkgJson = fromRequire.resolve(`${dep}/package.json`);
  const src = path.dirname(pkgJson);
  fs.cpSync(src, path.join(nmOut, dep), { recursive: true });
  return createRequire(pkgJson);
};
const bsqReq = copyPkg(require, 'better-sqlite3');
const bindingsReq = copyPkg(bsqReq, 'bindings');
copyPkg(bindingsReq, 'file-uri-to-path');
// 校验预编译二进制存在
const nodeFile = path.join(nmOut, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
if (!fs.existsSync(nodeFile)) {
  throw new Error(`缺少预编译二进制 ${nodeFile}（先在项目内构建 better-sqlite3）`);
}

// ── 4. 复制前端构建产物（如已构建）──
const webDist = path.join(repoRoot, 'web', 'dist');
if (fs.existsSync(webDist)) {
  log('复制前端 web/dist → web');
  fs.cpSync(webDist, path.join(out, 'web'), { recursive: true });
} else {
  log('⚠ 未找到 web/dist，跳过前端（先运行 pnpm --filter web build）');
}

// ── 5. 复制 node.exe（自包含，免装 Node）──
log(`复制 Node 运行时 (${process.version})`);
fs.copyFileSync(process.execPath, path.join(out, 'node.exe'));

// ── 6. 启动器 clawpm.cmd ──
// 当前目录（或第一个参数）作为 vault；启动服务并打开浏览器
const launcher = `@echo off
setlocal
set "HERE=%~dp0"
set "VAULT=%~1"
if "%VAULT%"=="" set "VAULT=%CD%"
set "CLAWPM_STORAGE=vault"
set "CLAWPM_VAULT=%VAULT%"
set "CLAWPM_HOME=%HERE%"
set "CLAWPM_WEB_DIST=%HERE%web"
if not defined CLAWPM_PORT set "CLAWPM_PORT=3210"
echo 启动 clawpm，需求库: %VAULT%
start "" http://127.0.0.1:%CLAWPM_PORT%
"%HERE%node.exe" "%HERE%clawpm.cjs"
`;
fs.writeFileSync(path.join(out, 'clawpm.cmd'), launcher.replace(/\n/g, '\r\n'), 'utf8');

// ── 7. README ──
const readme = `# clawpm 便携版

本地轻量需求管理，数据以文本文件（vault）存储，可随 git 仓库版本化。

## 使用
1. 在需求库目录（放 clawpm.json 的目录）运行 clawpm.cmd，或把库目录拖到 clawpm.cmd 上。
2. 浏览器自动打开 http://127.0.0.1:3210。
3. 首次在空目录运行会自动初始化 clawpm.json。

## 环境变量（可选）
- CLAWPM_PORT     端口（默认 3210）
- CLAWPM_VAULT    需求库目录（默认当前目录）

数据即文本：所有需求存于库目录的 tasks/*.json、domains.json 等，可直接编辑、git diff、合并。
`;
fs.writeFileSync(path.join(out, 'README.md'), readme, 'utf8');

log(`完成 → ${out}`);
log('内容: ' + fs.readdirSync(out).join(', '));
