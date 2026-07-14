// VaultStore 集成测试：export 真实数据 → open vault → 内存改写 → flush → 验证落盘 → 重开验证持久化
// 运行: pnpm exec tsx scripts/test-vault-store.ts

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportVault } from '../src/store/export-vault.js';
import { VaultStore } from '../src/store/vault-store.js';
import { loadVault } from '../src/store/files.js';

const REAL_DB = path.resolve('../data/clawpm.db');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpm-vs-'));
const vaultDir = path.join(tmp, 'vault');

function main(): void {
  // 1. 准备：真实 default 项目导出为 vault
  const exp = exportVault({ dbPath: REAL_DB, projectSlug: 'default', outDir: vaultDir });
  console.log(`  准备: 导出 ${exp.tasks} 任务到测试 vault`);

  // 2. 打开 VaultStore（:memory: 完整 schema + 加载）
  const store = VaultStore.open(vaultDir, 'default');
  const count = (store.sqlite.prepare('SELECT COUNT(*) c FROM tasks').get() as { c: number }).c;
  assert.equal(count, exp.tasks, '内存库任务数应等于 vault 任务数');

  // 3. 取一个任务，内存改写 progress + status
  const sample = store.sqlite
    .prepare('SELECT id, task_id, progress FROM tasks ORDER BY id LIMIT 1')
    .get() as { id: number; task_id: string; progress: number };
  const newProgress = (sample.progress + 37) % 100 || 41;
  store.sqlite
    .prepare("UPDATE tasks SET progress = ?, status = 'active' WHERE id = ?")
    .run(newProgress, sample.id);
  store.markDirty();

  // 4. flush 落盘
  store.flush();

  // 5. 直接读 vault 文本，确认变更已持久化
  const reloaded = loadVault(vaultDir);
  const t = reloaded.tasks.find((x) => x.id === sample.task_id);
  assert.ok(t, `落盘的 vault 应含任务 ${sample.task_id}`);
  assert.equal(t!.progress, newProgress, 'progress 应已落盘');
  assert.equal(t!.status, 'active', 'status 应已落盘');
  console.log(`  验证: 任务 ${sample.task_id} progress=${newProgress}/status=active 已落盘`);

  store.close();

  // 6. 重开 VaultStore（模拟重启），确认持久化生效
  const store2 = VaultStore.open(vaultDir, 'default');
  const t2 = store2.sqlite
    .prepare('SELECT progress, status FROM tasks WHERE task_id = ?')
    .get(sample.task_id) as { progress: number; status: string };
  assert.equal(t2.progress, newProgress, '重启后 progress 应持久');
  assert.equal(t2.status, 'active', '重启后 status 应持久');
  console.log('  验证: 重开 VaultStore 后改动持久保留');

  // 7. 删除一个任务的所有子任务再删自己 → 验证孤儿分片清理
  //    这里改测：删除某 domain 全部任务，验证分片文件消失
  const domainRow = store2.sqlite
    .prepare(
      `SELECT d.id, d.task_prefix FROM domains d
       JOIN tasks t ON t.domain_id = d.id GROUP BY d.id ORDER BY COUNT(*) ASC LIMIT 1`
    )
    .get() as { id: number; task_prefix: string } | undefined;
  if (domainRow) {
    const shardFile = path.join(vaultDir, 'tasks', `${domainRow.task_prefix}.json`);
    const existedBefore = fs.existsSync(shardFile);
    // 先解除 req_links / 子引用再删（简化：直接删该 domain 的叶子任务）
    store2.sqlite.exec('PRAGMA foreign_keys = OFF');
    store2.sqlite.prepare('DELETE FROM tasks WHERE domain_id = ?').run(domainRow.id);
    store2.sqlite.exec('PRAGMA foreign_keys = ON');
    store2.markDirty();
    store2.flush();
    if (existedBefore) {
      assert.ok(!fs.existsSync(shardFile), `清空 domain 后孤儿分片 ${domainRow.task_prefix}.json 应被删除`);
      console.log(`  验证: 清空 domain '${domainRow.task_prefix}' 后孤儿分片已清理`);
    }
  }

  store2.close();
  console.log('✅ VaultStore 集成测试通过');
}

try {
  main();
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
