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

/** 启动后这么快退出，只可能是没起来（正常用户关窗口不会这么快） */
const LAUNCH_FAILURE_MS = 3000;

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

/**
 * 清掉 profile 里的陈旧单例锁。
 *
 * Edge/Chrome 用 SingletonLock 等文件保证一个 profile 只有一个实例。进程被强杀
 * （崩溃、任务管理器、Stop-Process）时锁会残留，之后再用该 profile 启动会报
 * 「Lock file can not be created! Error code: 32」并直接退出 —— 表现为「双击没反应」。
 * 本 profile 由 clawpm 独占（每库一个），走到这里说明本库没有窗口在跑，锁必是陈旧的。
 */
function clearStaleProfileLocks(profileDir: string): void {
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      fs.rmSync(path.join(profileDir, name), { force: true, recursive: true });
    } catch {
      /* 锁不存在或删不掉都不阻断启动，Edge 起不来时下面有回退 */
    }
  }
}

export interface DesktopWindowResult {
  /** 是否成功以应用窗口打开（false = 已回退到默认浏览器） */
  appWindow: boolean;
}

export interface DesktopWindowOptions {
  /** 开完窗口即与之脱离（不等待关闭）。用于「库已在运行、只补开一个窗口」的场景，
   *  避免启动器进程白白滞留。此时不会回调 onClose。 */
  detach?: boolean;
  /**
   * profile 区分键（同时开多个需求库时必须各不相同）。
   *
   * Edge/Chrome 对同一 user-data-dir 只保留一个浏览器进程：第二次启动会把 URL 交给
   * 已有实例后立即退出，其退出会被误判成「窗口已关闭」而连带关掉刚起的服务。
   * 每个库用独立 profile 即可各自成为独立进程，窗口生命周期与服务一一对应。
   */
  profileKey?: string;
}

/**
 * 打开应用窗口。找不到 Edge/Chrome 时回退为默认浏览器（此时不接管退出）。
 * onClose 仅在应用窗口模式且未 detach 时，于窗口关闭时调用。
 */
export function openDesktopWindow(
  url: string,
  onClose: () => void,
  opts: DesktopWindowOptions = {}
): DesktopWindowResult {
  const browser = findBrowser();
  if (!browser) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return { appWindow: false };
  }

  // 独立 user-data-dir：确保新开进程而非并入用户已开的浏览器
  // （并入的话子进程会立即退出，误判为窗口关闭），也避免与日常浏览会话串扰。
  // profileKey 再按需求库细分，使多库并存时各自独立（见 DesktopWindowOptions.profileKey）。
  const profileDir = path.join(os.tmpdir(), 'clawpm-app-window', opts.profileKey ?? 'default');
  fs.mkdirSync(profileDir, { recursive: true });
  clearStaleProfileLocks(profileDir);

  const openedAt = Date.now();
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
    { stdio: 'ignore', detached: opts.detach === true }
  );

  const fallbackToBrowser = () => {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  };
  child.on('error', fallbackToBrowser);

  if (opts.detach) {
    child.unref(); // 不阻塞本进程退出
  } else {
    child.on('exit', () => {
      // 秒退＝根本没起来（profile 被占、Edge 异常等），不是用户关窗口。
      // 若按「窗口已关闭」处理会把刚起的服务一起关掉，用户看到的就是「双击没反应」。
      if (Date.now() - openedAt < LAUNCH_FAILURE_MS) {
        console.warn('[desktop] 应用窗口启动失败，改用默认浏览器打开');
        fallbackToBrowser();
        return;
      }
      onClose();
    });
  }
  return { appWindow: true };
}
