// clawpm.exe（Node SEA 单可执行文件）入口。
//
//   clawpm.exe                    打开当前目录为需求库（也可把库文件夹拖到 exe 上）
//   clawpm.exe <需求库目录>        打开指定需求库
//   clawpm.exe init --vault <dir> 等子命令走 CLI（见 cli/vault.ts）
//
// 打开模式默认桌面窗口：独立应用窗口而非浏览器标签页，关窗即退出。
// 参数需先翻译成环境变量再加载服务端（config 在导入时读取 env），故用动态 import 保序。

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE } from './store/files.js';

/** 走 CLI 的子命令（与 cli/vault.ts 的 main 保持一致） */
const CLI_COMMANDS = new Set(['init', 'find', 'migrate', 'export', 'import', 'roundtrip']);

async function main(): Promise<void> {
  const args = process.argv.slice(2); // SEA 下与 `node script.js …` 形状一致
  const first = args[0];

  if (first && CLI_COMMANDS.has(first)) {
    await import('./cli/vault.js'); // 自行解析 process.argv
    return;
  }

  const exeDir = path.dirname(process.execPath);
  const vault = first && !first.startsWith('-') ? path.resolve(first) : process.cwd();

  // ??= 保证显式传入的环境变量优先（调试/自定义端口）
  process.env.CLAWPM_STORAGE ??= 'vault';
  process.env.CLAWPM_VAULT ??= vault;
  process.env.CLAWPM_HOME ??= exeDir;
  process.env.CLAWPM_WEB_DIST ??= path.join(exeDir, 'web');
  process.env.CLAWPM_PORT ??= '3210';
  process.env.CLAWPM_DESKTOP ??= '1';

  if (!fs.existsSync(path.join(vault, CONFIG_FILE))) {
    console.log(`该目录还不是需求库，将初始化: ${vault}`);
  }
  console.log(`需求库: ${vault}`);

  await import('./index.js');
}

void main();
