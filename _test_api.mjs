const r = await fetch('http://localhost:3210/api/v1/tasks/tree?projectId=1', {
  headers: { Authorization: 'Bearer dev-token' }
});
const d = await r.json();
if (!d.length) { console.log('empty tree'); process.exit(0); }
const first = d[0];
console.log('root taskId:', first.taskId, '| title:', first.title);
console.log('root children count:', first.children ? first.children.length : 'NO children field');
if (first.children && first.children.length > 0) {
  const c = first.children[0];
  console.log('first child taskId:', c.taskId, '| title:', c.title);
  console.log('first child children:', c.children ? c.children.length : 'NO children field');
  if (c.children && c.children.length > 0) {
    console.log('grandchild:', c.children[0].taskId, '| title:', c.children[0].title);
  }
}
