// 打包 clawpm 为 Windows 桌面发行版。
// 产物 server/dist-portable/：clawpm.exe（Node SEA 单可执行文件，内含后端）
// + node_modules（仅 better-sqlite3 原生模块，无法打进 exe）+ web（前端）。
// 双击 clawpm.exe 即以当前目录为需求库、开独立应用窗口。
//
// 说明：
// - 原计划 bun build --compile，但 Fastify 5 在 Bun 1.3.14(Windows) 下 listen 后无法接受
//   连接（见 db/sqlite-driver.ts 注释），故走 Node SEA。
// - better-sqlite3 是原生 .node，SEA 无法内嵌；SEA 内 require() 只解析内置模块，
//   驱动层已改为以 exe 目录为基准解析（见 sqlite-driver.ts）。
//
// 用法: node scripts/build-portable.mjs

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
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

/**
 * 改写 PE 可选头的 Subsystem 字段（3=控制台 / 2=GUI）。
 * GUI 子系统的进程不分配控制台窗口——双击 exe 不再弹黑框。
 * 字段位置：DOS 头 0x3C 处存 PE 头偏移；Subsystem 在可选头内偏移 68，
 * 而可选头紧跟 PE 签名(4B) + COFF 头(20B)，故绝对偏移 = peOffset + 92（PE32/PE32+ 一致）。
 */
function setPeSubsystem(exeFile, subsystem) {
  const buf = fs.readFileSync(exeFile);
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error(`${exeFile} 不是有效的 PE 文件`);
  }
  buf.writeUInt16LE(subsystem, peOffset + 92);
  fs.writeFileSync(exeFile, buf);
}

// ── 1. 清理输出目录 ──
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// ── 2. esbuild 打包后端为单 CJS（SEA 主脚本）──
//
// better-sqlite3 是原生模块，打不进 SEA，必须放 exe 同级 node_modules。而 SEA 内
// require() 只解析内置模块，普通 require("better-sqlite3")（drizzle 适配器内部也有）
// 会抛 ERR_UNKNOWN_BUILTIN_MODULE。故用插件把它统一替换为「以 exe 目录为基准解析」
// 的虚拟模块——一处收口，覆盖自有代码与第三方依赖。
const nativeSqlitePlugin = {
  name: 'native-sqlite-loader',
  setup(build) {
    build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
      path: 'better-sqlite3',
      namespace: 'native-sqlite',
    }));
    build.onLoad({ filter: /.*/, namespace: 'native-sqlite' }, () => ({
      contents: `
        const { createRequire } = require('node:module');
        module.exports = createRequire(process.execPath)('better-sqlite3');
      `,
      loader: 'js',
    }));
  },
};

log('esbuild 打包后端 → clawpm.cjs');
await esbuild.build({
  entryPoints: [path.join(serverDir, 'src/exe-main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  plugins: [nativeSqlitePlugin],
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

// ── 5. 生成 clawpm.exe（Node SEA：node 二进制 + 注入 bundle）──
log(`生成 clawpm.exe（Node SEA, ${process.version}）`);
const seaConfig = path.join(out, 'sea-config.json');
const blob = path.join(out, 'sea-prep.blob');
const exePath = path.join(out, 'clawpm.exe');
fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: path.join(out, 'clawpm.cjs'), output: blob, disableExperimentalSEAWarning: true }),
  'utf8'
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });
fs.copyFileSync(process.execPath, exePath);
// postject 把 blob 注入 exe 的 NODE_SEA_BLOB 段（sentinel fuse 为 Node 官方固定值）。
// 用 shell 调 npx：Node 24 起 spawn 不允许直接执行 .cmd（EINVAL）。
execFileSync(
  `npx --yes postject "${exePath}" NODE_SEA_BLOB "${blob}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { stdio: 'inherit', shell: true }
);
// 同一份 SEA 产物出两个 exe：日常双击用 GUI 版（不弹控制台黑框），跑子命令用 CLI 版。
// 二者仅差 PE 头 Subsystem 一个字段——GUI 子系统下进程不分配控制台，
// 从 cmd/PowerShell 运行时 stdout 无处可写、命令输出不可见，故 CLI 必须保留控制台版。
const cliExe = path.join(out, 'clawpm-cli.exe');
fs.copyFileSync(exePath, cliExe);
setPeSubsystem(exePath, 2); // 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI
log('clawpm.exe（GUI，双击无黑框）+ clawpm-cli.exe（控制台，子命令用）');

// 中间产物不入发行包；clawpm.cjs 已注入 exe，保留仅供排查
for (const f of [seaConfig, blob]) fs.unlinkSync(f);

// ── 7. README ──
const readme = `# clawpm 桌面版

本地轻量需求管理，数据以文本文件（需求库/vault）存储，可随 git 仓库版本化。

## 使用
- 把需求库文件夹**拖到 clawpm.exe 上**，或在库目录里运行 clawpm.exe。
- 打开的是独立应用窗口（非浏览器标签页，无地址栏）；**关闭窗口即退出**。
- 在空目录运行会自动初始化成新需求库。

## 命令行（用 clawpm-cli.exe）
子命令要看输出，须用控制台版 clawpm-cli.exe（clawpm.exe 是 GUI 版，双击不弹黑框，
但在 cmd 里没有输出）：

    clawpm-cli.exe init --vault <dir>                     新建空需求库
    clawpm-cli.exe migrate --from <json> --vault <dir>    迁移旧需求数据
    clawpm-cli.exe find --path <dir>                      向上查找所属需求库
    clawpm-cli.exe export --db <db> --project <slug> --out <dir>   从 SQLite 导出

## 环境变量（可选）
- CLAWPM_PORT      端口（默认 3210）
- CLAWPM_DESKTOP   设为 0 则用默认浏览器打开而非应用窗口

## 目录说明
clawpm.exe 需与 node_modules/（原生 SQLite 模块）、web/（前端）放在一起，勿单独移动 exe。

数据即文本：需求存于库目录的 tasks/*.json、domains.json 等，可直接编辑、git diff、合并。
`;
fs.writeFileSync(path.join(out, 'README.md'), readme, 'utf8');

log(`完成 → ${out}`);
log('内容: ' + fs.readdirSync(out).join(', '));
