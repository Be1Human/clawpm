// 把 dist-portable 打包成一个 Windows 安装程序 clawpm-setup.exe。
//
// 双击 setup.exe → 静默解压到 %LOCALAPPDATA%\Programs\clawpm、建桌面/开始菜单快捷方式、
// 注册到「设置 > 应用」（可正常卸载）、自动启动。用户级安装，无需管理员。
//
// 为什么用 IExpress（Windows 自带）而不是 Inno Setup / NSIS / 7z-SFX：
// - Inno/NSIS 要额外下载安装（本机 winget 无网络）。
// - 7-Zip 自带的 7z.sfx 是交互式 GUI（弹「7-Zip self-extracting archive」窗口要点击），
//   完全静默需 LZMA SDK 的 7zSD.sfx，同样要下载。
// - IExpress 随 Windows 分发，ShowInstallProgramWindow=0 + 空 InstallPrompt 即静默，
//   且它只能带平铺文件，故先把 dist-portable 压成一个 payload.zip，由 install.ps1 用
//   .NET ZipFile 解压 —— 无第三方运行时依赖。
//
// 前置：先跑 build-portable.mjs 生成 dist-portable。
// 用法：node scripts/build-installer.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(serverDir, 'dist-portable');
const installerSrc = path.join(serverDir, 'installer');
const outDir = path.join(serverDir, 'dist-installer');

const log = (m) => console.log(`[installer] ${m}`);

function findSevenZip() {
  for (const p of ['C:/Program Files/7-Zip/7z.exe', 'C:/Program Files (x86)/7-Zip/7z.exe']) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('未找到 7z.exe（需要 7-Zip 来生成 payload.zip）');
}

if (!fs.existsSync(path.join(distDir, 'clawpm.exe'))) {
  throw new Error('缺少 dist-portable/clawpm.exe，请先运行 node scripts/build-portable.mjs');
}

const sevenZip = findSevenZip();
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. payload.zip = dist-portable 内容 + uninstall.ps1（标准 zip，供 .NET 解压）
log('打包 payload.zip');
const payload = path.join(outDir, 'payload.zip');
execFileSync(sevenZip, ['a', '-tzip', payload, '.', '-mx=5', '-xr!data', '-xr!.clawpm', '-xr!*.tmp-*'], {
  cwd: distDir,
  stdio: 'ignore',
});
execFileSync(sevenZip, ['a', '-tzip', payload, path.join(installerSrc, 'uninstall.ps1')], {
  stdio: 'ignore',
});

// 2. install.ps1 与 payload.zip 并列（IExpress 的两个源文件）
fs.copyFileSync(path.join(installerSrc, 'install.ps1'), path.join(outDir, 'install.ps1'));

// 3. 生成 IExpress SED 配置
const target = path.join(outDir, 'clawpm-setup.exe');
const sed = [
  '[Version]',
  'Class=IEXPRESS',
  'SEDVersion=3',
  '[Options]',
  'PackagePurpose=InstallApp',
  'ShowInstallProgramWindow=0',
  'HideExtractAnimation=1',
  'UseLongFileName=1',
  'InsideCompressed=0',
  'CAB_FixedSize=0',
  'CAB_ResvCodeSigning=0',
  'RebootMode=N',
  'InstallPrompt=%InstallPrompt%',
  'DisplayLicense=%DisplayLicense%',
  'FinishMessage=%FinishMessage%',
  'TargetName=%TargetName%',
  'FriendlyName=%FriendlyName%',
  'AppLaunched=%AppLaunched%',
  'PostInstallCmd=%PostInstallCmd%',
  'AdminQuietInstCmd=',
  'UserQuietInstCmd=',
  'SourceFiles=SourceFiles',
  '[Strings]',
  'InstallPrompt=',
  'DisplayLicense=',
  'FinishMessage=',
  `TargetName=${target}`,
  'FriendlyName=clawpm',
  'AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File install.ps1',
  'PostInstallCmd=<None>',
  'FILE0="payload.zip"',
  'FILE1="install.ps1"',
  '[SourceFiles]',
  `SourceFiles0=${outDir}`,
  '[SourceFiles0]',
  '%FILE0%=',
  '%FILE1%=',
].join('\r\n');
const sedPath = path.join(outDir, 'clawpm.sed');
fs.writeFileSync(sedPath, sed + '\r\n', 'utf8');

// 4. iexpress 编译（/N 构建 /Q 静默）
log('iexpress 编译 setup.exe');
execFileSync('iexpress.exe', ['/N', '/Q', sedPath], { stdio: 'ignore' });

if (!fs.existsSync(target)) throw new Error('iexpress 未生成 setup.exe');
const mb = (fs.statSync(target).size / 1048576).toFixed(1);
// 中间产物清理，只留 setup.exe
for (const f of ['payload.zip', 'install.ps1', 'clawpm.sed']) {
  fs.rmSync(path.join(outDir, f), { force: true });
}
log(`完成 → ${target}（${mb} MB）`);
log('双击即安装：解压到 %LOCALAPPDATA%\\Programs\\clawpm，建快捷方式，可从「设置 > 应用」卸载');
