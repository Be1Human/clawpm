// 桌面窗口模式：以「应用窗口」打开界面，而非浏览器标签页。
//
// 用 Edge/Chrome 的 --app 模式：无地址栏、无标签栏、无书签栏，独立任务栏图标，
// 视觉上即一个本地软件窗口。Windows 10/11 必装 Edge，故无需随包分发浏览器内核
// （相比 Electron 省去 ~150MB 与原生模块重编译）。
//
// 关闭窗口即退出服务：窗口进程是前台，其退出触发 onClose（落盘后结束进程）。

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

function findBrowser(): string | null {
  for (const p of BROWSER_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export interface DesktopWindowResult {
  /** 是否成功以应用窗口打开（false = 已回退到默认浏览器） */
  appWindow: boolean;
}

/**
 * 打开应用窗口。找不到 Edge/Chrome 时回退为默认浏览器（此时不接管退出）。
 * onClose 仅在应用窗口模式下于窗口关闭时调用。
 */
export function openDesktopWindow(url: string, onClose: () => void): DesktopWindowResult {
  const browser = findBrowser();
  if (!browser) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return { appWindow: false };
  }

  // 独立 user-data-dir：确保新开进程而非并入用户已开的浏览器
  // （并入的话子进程会立即退出，误判为窗口关闭），也避免与日常浏览会话串扰。
  const profileDir = path.join(os.tmpdir(), 'clawpm-app-window');
  const child = spawn(
    browser,
    [
      `--app=${url}`,
      `--user-data-dir=${profileDir}`,
      '--window-size=1440,900',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
    ],
    { stdio: 'ignore' }
  );
  child.on('exit', onClose);
  child.on('error', () => {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  });
  return { appWindow: true };
}
