import Database from 'better-sqlite3';
const db = new Database('data/clawpm.db', { readonly: true });

// 1. 行数总览（关注 7/18 之后是否被重置）
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
const counts = {};
for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
console.log('--- table counts ---');
console.log(JSON.stringify(counts, null, 1));

// 2. 关键内容
console.log('--- projects ---');
console.log(JSON.stringify(db.prepare('SELECT id, slug, name, archived, created_at, updated_at FROM projects ORDER BY id').all(), null, 1));
console.log('--- tasks latest ---');
console.log(JSON.stringify(db.prepare('SELECT id, project_id, title, status, created_at, updated_at FROM tasks ORDER BY updated_at DESC LIMIT 5').all(), null, 1));

// 3. 启动时有什么在写库（看最近的通知 / 审计日志）
for (const t of ['notifications', 'auth_audit_logs', 'accounts', 'account_sessions']) {
  if (!tables.includes(t)) continue;
  const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
  const orderCol = ['updated_at', 'created_at', 'timestamp', 'time'].find(c => cols.includes(c));
  if (!orderCol) continue;
  console.log(`--- ${t} latest by ${orderCol} ---`);
  console.log(JSON.stringify(db.prepare(`SELECT * FROM "${t}" ORDER BY "${orderCol}" DESC LIMIT 3`).all(), null, 1));
}
