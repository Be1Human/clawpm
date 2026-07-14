// clawpm vault CLI —— Step 1「格式先行」工具：
//   export    SQLite 项目 → 文本 vault
//   import    文本 vault → 全新 SQLite
//   roundtrip export → import → 再 export，两个 vault 字节级比对
//
// 用法（server/ 目录下）：
//   pnpm exec tsx src/cli/vault.ts export --db ../data/clawpm.db --project default --out <dir>
//   pnpm exec tsx src/cli/vault.ts import --vault <dir> --db <new.db> [--project default]
//   pnpm exec tsx src/cli/vault.ts roundtrip --db ../data/clawpm.db --project default [--keep]

import fs from 'fs';
import os from 'os';
import path from 'path';
import { exportVault } from '../store/export-vault.js';
import { importVault } from '../store/import-vault.js';

function parseArgs(argv: string[]): { cmd: string; flags: Map<string, string | true> } {
  const [cmd, ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`无法识别的参数: ${a}`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, true);
    }
  }
  return { cmd: cmd ?? '', flags };
}

function requireFlag(flags: Map<string, string | true>, name: string): string {
  const v = flags.get(name);
  if (typeof v !== 'string') throw new Error(`缺少 --${name} 参数`);
  return v;
}

function printWarnings(warnings: string[]): void {
  for (const w of warnings) console.warn(`  ⚠ ${w}`);
}

/** 递归收集目录下全部文件的相对路径 */
function listFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).replace(/\\/g, '/'));
  }
  return out.sort();
}

function firstDiffLine(a: string, b: string): string {
  const la = a.split('\n');
  const lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `第 ${i + 1} 行:\n    A: ${la[i] ?? '<无>'}\n    B: ${lb[i] ?? '<无>'}`;
    }
  }
  return '（行内容相同，可能是换行/编码差异）';
}

function compareDirs(dirA: string, dirB: string): string[] {
  const filesA = listFiles(dirA);
  const filesB = listFiles(dirB);
  const diffs: string[] = [];
  const setB = new Set(filesB);
  for (const f of filesA) {
    if (!setB.has(f)) {
      diffs.push(`仅存在于 A: ${f}`);
      continue;
    }
    const ba = fs.readFileSync(path.join(dirA, f));
    const bb = fs.readFileSync(path.join(dirB, f));
    if (!ba.equals(bb)) {
      diffs.push(`内容不同: ${f} — ${firstDiffLine(ba.toString('utf8'), bb.toString('utf8'))}`);
    }
  }
  const setA = new Set(filesA);
  for (const f of filesB) {
    if (!setA.has(f)) diffs.push(`仅存在于 B: ${f}`);
  }
  return diffs;
}

function main(): number {
  const { cmd, flags } = parseArgs(process.argv.slice(2));

  if (cmd === 'export') {
    const report = exportVault({
      dbPath: requireFlag(flags, 'db'),
      projectSlug: requireFlag(flags, 'project'),
      outDir: requireFlag(flags, 'out'),
      force: flags.get('force') === true,
    });
    console.log(
      `导出完成: 项目 ${report.project} → ${report.files.length} 个文件` +
        `（任务 ${report.tasks}，其中归档 ${report.archived}；domain ${report.domains}，` +
        `milestone ${report.milestones}，字段 ${report.fields}，关联 ${report.links}）`
    );
    printWarnings(report.warnings);
    return 0;
  }

  if (cmd === 'import') {
    const report = importVault({
      vaultDir: requireFlag(flags, 'vault'),
      dbPath: requireFlag(flags, 'db'),
      projectSlug: typeof flags.get('project') === 'string' ? (flags.get('project') as string) : undefined,
      force: flags.get('force') === true,
    });
    console.log(
      `导入完成: ${report.tasks} 个任务 → 项目 ${report.project}` +
        `（domain ${report.domains}，milestone ${report.milestones}，字段 ${report.fields}，关联 ${report.links}）`
    );
    printWarnings(report.warnings);
    return 0;
  }

  if (cmd === 'roundtrip') {
    const dbPath = requireFlag(flags, 'db');
    const project = requireFlag(flags, 'project');
    const keep = flags.get('keep') === true;

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpm-roundtrip-'));
    const vault1 = path.join(tmp, 'vault1');
    const vault2 = path.join(tmp, 'vault2');
    const db2 = path.join(tmp, 'roundtrip.db');

    console.log(`[1/3] export ${dbPath} (${project}) → ${vault1}`);
    const r1 = exportVault({ dbPath, projectSlug: project, outDir: vault1 });
    printWarnings(r1.warnings);
    console.log(`[2/3] import ${vault1} → ${db2}`);
    const r2 = importVault({ vaultDir: vault1, dbPath: db2, projectSlug: project });
    printWarnings(r2.warnings);
    console.log(`[3/3] export ${db2} (${project}) → ${vault2}`);
    const r3 = exportVault({ dbPath: db2, projectSlug: project, outDir: vault2 });
    printWarnings(r3.warnings);

    const diffs = compareDirs(vault1, vault2);
    if (diffs.length === 0) {
      console.log(`✅ round-trip 通过: ${r1.tasks} 个任务、${r1.files.length} 个文件字节级一致`);
      if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
      else console.log(`保留临时目录: ${tmp}`);
      return 0;
    }
    console.error(`❌ round-trip 失败，${diffs.length} 处差异（临时目录已保留: ${tmp}）:`);
    for (const d of diffs.slice(0, 20)) console.error(`  - ${d}`);
    if (diffs.length > 20) console.error(`  …共 ${diffs.length} 处`);
    return 1;
  }

  console.error(
    '用法: vault.ts <export|import|roundtrip> [--db <path>] [--project <slug>] [--out <dir>] [--vault <dir>] [--force] [--keep]'
  );
  return 2;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`错误: ${(e as Error).message}`);
  process.exitCode = 1;
}
