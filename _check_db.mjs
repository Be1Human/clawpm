import Database from 'better-sqlite3';
const db = new Database('data/clawpm.db', { readonly: true });
console.log('project 802:', JSON.stringify(db.prepare('SELECT * FROM projects WHERE id = 802').all()));
console.log('tasks in 802:', db.prepare('SELECT COUNT(*) c FROM tasks WHERE project_id = 802').get().c);
console.log('max project id:', db.prepare('SELECT MAX(id) m FROM projects').get().m);
console.log('project ids > 100:', JSON.stringify(db.prepare('SELECT id, slug, name, created_at FROM projects WHERE id > 100 ORDER BY id').all(), null, 1));
console.log('orphan task project_ids:', JSON.stringify(db.prepare(`
  SELECT t.project_id, COUNT(*) c FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
  WHERE p.id IS NULL GROUP BY t.project_id
`).all()));
console.log('tasks total:', db.prepare('SELECT COUNT(*) c FROM tasks').get().c);
