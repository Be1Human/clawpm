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
import { migrateRequirements } from '../store/migrate-requirements.js';
import { isVaultDir, findVaultUp, atomicWriteFile, writeAgentsDoc, CONFIG_FILE } from '../store/files.js';
import { stringifyConfig } from '../store/canonical.js';
import { DEFAULT_WORKFLOW, VAULT_FORMAT } from '../store/types.js';

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

  if (cmd === 'init') {
    const dir = path.resolve(requireFlag(flags, 'vault'));
    if (isVaultDir(dir)) {
      console.log(`已是 vault: ${dir}（含 ${CONFIG_FILE}）`);
      return 0;
    }
    const name = typeof flags.get('name') === 'string' ? (flags.get('name') as string) : path.basename(dir);
    const config = { format: VAULT_FORMAT, name, workflow: DEFAULT_WORKFLOW };
    atomicWriteFile(path.join(dir, CONFIG_FILE), stringifyConfig(config));
    // 建库即产出给 agent 的格式说明，无需先把软件跑起来
    writeAgentsDoc(dir, config, []);
    console.log(`已初始化需求库: ${dir}`);
    console.log(`  ${CONFIG_FILE}  库标识与工作流配置`);
    console.log(`  AGENTS.md     给 AI agent 的格式说明（自动生成，勿手改）`);
    return 0;
  }

  if (cmd === 'find') {
    const start = typeof flags.get('path') === 'string' ? (flags.get('path') as string) : process.cwd();
    const found = findVaultUp(start);
    console.log(found ? `找到 vault: ${found}` : `从 ${path.resolve(start)} 向上未发现 vault`);
    return found ? 0 : 1;
  }

  if (cmd === 'migrate') {
    const report = migrateRequirements({
      fromFile: requireFlag(flags, 'from'),
      vaultDir: requireFlag(flags, 'vault'),
      force: flags.get('force') === true,
      archivedDate: typeof flags.get('archived-date') === 'string' ? (flags.get('archived-date') as string) : undefined,
    });
    console.log(
      `迁移完成: ${report.total} 条需求（活跃 ${report.active} / 归档 ${report.archived}）` +
        ` → ${report.domains} 个领域 + ${report.syntheticRoots} 个合成层根节点，共 ${report.files.length} 个文件`
    );
    if (report.unknownResolved.length) {
      console.log(`\n【unknown 状态归一 ${report.unknownResolved.length} 条】（请人工复核）:`);
      for (const u of report.unknownResolved) console.log(`  - ${u}`);
    }
    if (report.trackingOther.length) {
      console.log(`\n【tracking=other 归一 ${report.trackingOther.length} 处 → pending】（请人工复核）:`);
      for (const t of report.trackingOther) console.log(`  - ${t}`);
    }
    if (report.warnings.length) {
      console.log(`\n【告警 ${report.warnings.length} 条】:`);
      printWarnings(report.warnings);
    }
    // 报告落盘供审阅
    const reportPath = path.join(requireFlag(flags, 'vault'), '.clawpm', 'migrate-report.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      [
        `# 迁移报告`,
        ``,
        `- 来源: ${requireFlag(flags, 'from')}`,
        `- 需求总数: ${report.total}（活跃 ${report.active} / 归档 ${report.archived}）`,
        `- 领域: ${report.domains} 个；合成层根节点: ${report.syntheticRoots} 个`,
        ``,
        `## unknown 状态归一（${report.unknownResolved.length}）`,
        ...report.unknownResolved.map((u) => `- ${u}`),
        ``,
        `## tracking=other → pending（${report.trackingOther.length}）`,
        ...report.trackingOther.map((t) => `- ${t}`),
        ``,
        `## 告警（${report.warnings.length}）`,
        ...report.warnings.map((w) => `- ${w}`),
        ``,
      ].join('\n'),
      'utf8'
    );
    console.log(`\n报告已写入: ${reportPath}`);
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
    '用法: vault.ts <init|find|export|import|roundtrip|migrate>\n' +
      '  init     --vault <dir> [--name <名称>]           初始化空 vault\n' +
      '  find     [--path <dir>]                          从路径向上发现 vault\n' +
      '  export   --db <path> --project <slug> --out <dir> [--force]\n' +
      '  import   --vault <dir> --db <path> [--project <slug>] [--force]\n' +
      '  roundtrip --db <path> --project <slug> [--keep]\n' +
      '  migrate  --from <requirements.json> --vault <dir> [--archived-date <YYYY-MM-DD>] [--force]'
  );
  return 2;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`错误: ${(e as Error).message}`);
  process.exitCode = 1;
}
