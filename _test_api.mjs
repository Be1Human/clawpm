/**
 * ClawPM 全面 API 测试脚本
 * 覆盖所有 CRUD 端点，循环运行直到所有测试通过
 * 
 * 用法: node _test_api.mjs [--loop] [--fix-only]
 *   --loop: 循环运行，每轮间隔 60 秒
 *   --fix-only: 只运行之前失败过的测试
 */

const BASE = 'http://localhost:3210';
const TOKEN = 'dev-token';
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  'X-ClawPM-User': 'test-user',
};

// ─── Test Infrastructure ────────────────────────────────────────────
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
const testTimings = [];

async function api(method, path, body = null, extraHeaders = {}) {
  const headers = { ...HEADERS, ...extraHeaders };
  // Fastify 会拒绝带 Content-Type: application/json 但 body 为空的请求
  // 所以当不需要发送 body 时，移除 Content-Type
  if (!body || method === 'GET') {
    delete headers['Content-Type'];
  }
  const opts = { method, headers };
  if (body && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, opts);
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e.message };
  }
}

async function test(name, fn) {
  totalTests++;
  const start = Date.now();
  try {
    await fn();
    passedTests++;
    const ms = Date.now() - start;
    testTimings.push({ name, ms });
    console.log(`  ✅ ${name} (${ms}ms)`);
  } catch (e) {
    failedTests++;
    const ms = Date.now() - start;
    testTimings.push({ name, ms, failed: true });
    const msg = e.message || String(e);
    failures.push({ name, error: msg });
    console.log(`  ❌ ${name}: ${msg} (${ms}ms)`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(arr, item, message) {
  if (!Array.isArray(arr) || !arr.includes(item)) {
    throw new Error(`${message || 'assertIncludes'}: ${JSON.stringify(item)} not found in array`);
  }
}

// ─── Test Context (shared state between tests) ─────────────────────
const ctx = {
  projectSlug: null,
  projectId: null,
  taskIds: [],       // created task taskId strings
  backlogIds: [],
  domainId: null,
  domainName: null,
  milestoneId: null,
  milestoneName: null,
  memberId: null,
  memberIdentifier: null,
  iterationId: null,
  intakeId: null,
  customFieldId: null,
  attachmentId: null,
  reqLinkId: null,
  goalId: null,
  objectiveId: null,
  noteId: null,
  notificationId: null,
  accountToken: null,
  accountUsername: null,
};

// ─── Helper: unique suffix ──────────────────────────────────────────
const UID = Date.now().toString(36);

// ═══════════════════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════════════════

async function testServerHealth() {
  console.log('\n📦 [1/16] Server Health');
  await test('Server is reachable', async () => {
    const r = await api('GET', '/api/v1/projects');
    assert(r.status !== 0, `Server not reachable: ${r.error}`);
  });
}

// ── Projects ────────────────────────────────────────────────────────
async function testProjects() {
  console.log('\n📁 [2/16] Projects');

  await test('List projects (should include default)', async () => {
    const r = await api('GET', '/api/v1/projects');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.length >= 1, 'should have at least default project');
    assert(r.data.some(p => p.slug === 'default'), 'should include default');
  });

  await test('Create project', async () => {
    ctx.projectSlug = `test-${UID}`;
    const r = await api('POST', '/api/v1/projects', {
      name: `Test Project ${UID}`,
      slug: ctx.projectSlug,
      description: 'Auto-test project',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.id, 'should have id');
    ctx.projectId = r.data.id;
  });

  await test('Get project by slug', async () => {
    const r = await api('GET', `/api/v1/projects/${ctx.projectSlug}`);
    assertEqual(r.status, 200, 'get status');
    assertEqual(r.data.slug, ctx.projectSlug, 'slug match');
  });

  await test('Update project', async () => {
    const r = await api('PATCH', `/api/v1/projects/${ctx.projectSlug}`, {
      description: 'Updated description',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.description, 'Updated description', 'description updated');
  });

  await test('Create project without name → 400', async () => {
    const r = await api('POST', '/api/v1/projects', { slug: 'no-name' });
    assertEqual(r.status, 400, 'should be 400');
  });

  await test('Get non-existent project → 404', async () => {
    const r = await api('GET', '/api/v1/projects/definitely-not-exist-xxx');
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Domains ─────────────────────────────────────────────────────────
async function testDomains() {
  console.log('\n🏷️  [3/16] Domains');

  await test('Create domain', async () => {
    ctx.domainName = `TestDom-${UID}`;
    const pfx = `TD${UID.toUpperCase().slice(0, 4)}`;
    const r = await api('POST', '/api/v1/domains', {
      name: ctx.domainName,
      task_prefix: pfx,
      keywords: ['test', 'auto'],
      color: '#ff5733',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.id, 'should have id');
    ctx.domainId = r.data.id;
  });

  await test('List domains', async () => {
    const r = await api('GET', '/api/v1/domains');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.some(d => d.id === ctx.domainId), 'should include created domain');
  });

  await test('Update domain', async () => {
    const r = await api('PATCH', `/api/v1/domains/${ctx.domainId}`, {
      color: '#00ff00',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.color, '#00ff00', 'color updated');
  });

  await test('Update non-existent domain → 404', async () => {
    const r = await api('PATCH', '/api/v1/domains/99999', { color: '#000' });
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Milestones ──────────────────────────────────────────────────────
async function testMilestones() {
  console.log('\n🎯 [4/16] Milestones');

  await test('Create milestone', async () => {
    ctx.milestoneName = `MS-${UID}`;
    const r = await api('POST', '/api/v1/milestones', {
      name: ctx.milestoneName,
      target_date: '2026-06-01',
      description: 'Test milestone',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.id, 'should have id');
    ctx.milestoneId = r.data.id;
  });

  await test('List milestones', async () => {
    const r = await api('GET', '/api/v1/milestones');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.some(m => m.id === ctx.milestoneId), 'should include created milestone');
  });

  await test('Update milestone', async () => {
    const r = await api('PATCH', `/api/v1/milestones/${ctx.milestoneId}`, {
      description: 'Updated MS description',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.description, 'Updated MS description', 'description updated');
  });

  await test('Update non-existent milestone → 404', async () => {
    const r = await api('PATCH', '/api/v1/milestones/99999', { name: 'x' });
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Members ─────────────────────────────────────────────────────────
async function testMembers() {
  console.log('\n👤 [5/16] Members');

  await test('Create member (human)', async () => {
    ctx.memberIdentifier = `mem-${UID}`;
    const r = await api('POST', '/api/v1/members', {
      name: `Test Member ${UID}`,
      identifier: ctx.memberIdentifier,
      type: 'human',
      role: 'dev',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.id, 'should have id');
    ctx.memberId = r.data.id;
  });

  await test('List members', async () => {
    const r = await api('GET', '/api/v1/members');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.some(m => m.identifier === ctx.memberIdentifier), 'should include created member');
  });

  await test('Get member by identifier', async () => {
    const r = await api('GET', `/api/v1/members/${ctx.memberIdentifier}`);
    assertEqual(r.status, 200, 'get status');
    assertEqual(r.data.identifier, ctx.memberIdentifier, 'identifier match');
  });

  await test('Update member', async () => {
    const r = await api('PATCH', `/api/v1/members/${ctx.memberIdentifier}`, {
      description: 'Updated member',
      role: 'pm',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.description, 'Updated member', 'description updated');
  });

  await test('Get non-existent member → 404', async () => {
    const r = await api('GET', '/api/v1/members/definitely-not-exist-xxx');
    assertEqual(r.status, 404, 'should be 404');
  });

  await test('Check identifier availability (taken)', async () => {
    const r = await api('GET', `/api/v1/members/check-identifier?identifier=${ctx.memberIdentifier}`);
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.available, false, 'should be taken');
  });

  await test('Check identifier availability (free)', async () => {
    const r = await api('GET', `/api/v1/members/check-identifier?identifier=random-${Date.now()}`);
    assertEqual(r.status, 200, 'status');
    assertEqual(r.data.available, true, 'should be available');
  });

  // Create a second member for permission tests later
  await test('Create second member for permission tests', async () => {
    const r = await api('POST', '/api/v1/members', {
      name: `Permission Test Member ${UID}`,
      identifier: `perm-mem-${UID}`,
      type: 'human',
    });
    assertEqual(r.status, 201, 'create status');
  });
}

// ── Tasks CRUD ──────────────────────────────────────────────────────
async function testTasksCRUD() {
  console.log('\n📋 [6/16] Tasks CRUD');

  // Create root task
  await test('Create root task', async () => {
    const r = await api('POST', '/api/v1/tasks', {
      title: `Root Task ${UID}`,
      description: 'Test root task',
      priority: 'P1',
      owner: 'test-user',
      labels: ['feature'],
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.taskId, 'should have taskId');
    ctx.taskIds.push(r.data.taskId);
  });

  // Create child task
  await test('Create child task', async () => {
    const r = await api('POST', '/api/v1/tasks', {
      title: `Child Task ${UID}`,
      parent_task_id: ctx.taskIds[0],
      priority: 'P2',
      owner: 'test-user',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.taskId, 'should have taskId');
    assert(r.data.parentTaskId !== null, 'should have parent');
    ctx.taskIds.push(r.data.taskId);
  });

  // Create task with domain
  await test('Create task with domain', async () => {
    const r = await api('POST', '/api/v1/tasks', {
      title: `Domain Task ${UID}`,
      domain: ctx.domainName,
      priority: 'P0',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.domain !== null, 'should have domain');
    ctx.taskIds.push(r.data.taskId);
  });

  // Create task with milestone
  await test('Create task with milestone', async () => {
    const r = await api('POST', '/api/v1/tasks', {
      title: `Milestone Task ${UID}`,
      milestone: ctx.milestoneName,
      status: 'active',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.milestone !== null, 'should have milestone');
    ctx.taskIds.push(r.data.taskId);
  });

  // Create task with assignee and start_date
  await test('Create task with assignee and start_date', async () => {
    const r = await api('POST', '/api/v1/tasks', {
      title: `Assigned Task ${UID}`,
      assignee: ctx.memberIdentifier,
      start_date: '2026-04-01',
      due_date: '2026-05-01',
    });
    assertEqual(r.status, 201, 'create status');
    ctx.taskIds.push(r.data.taskId);
  });

  // List tasks
  await test('List tasks', async () => {
    const r = await api('GET', '/api/v1/tasks');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.length >= 5, `should have at least 5 tasks, got ${r.data.length}`);
  });

  // Get single task
  await test('Get task by taskId', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}`);
    assertEqual(r.status, 200, 'get status');
    assertEqual(r.data.taskId, ctx.taskIds[0], 'taskId match');
  });

  // Get non-existent task
  await test('Get non-existent task → 404', async () => {
    const r = await api('GET', '/api/v1/tasks/ZZZZZ-999');
    assertEqual(r.status, 404, 'should be 404');
  });

  // Update task
  await test('Update task title', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}`, {
      title: `Updated Root Task ${UID}`,
      description: 'Updated desc',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.title, `Updated Root Task ${UID}`, 'title updated');
  });

  // Update task status
  await test('Update task status', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}`, {
      status: 'active',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.status, 'active', 'status changed');
  });

  // Update task labels
  await test('Update task labels', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}`, {
      labels: ['feature', 'urgent'],
    });
    assertEqual(r.status, 200, 'update status');
    assert(r.data.labels.includes('feature'), 'should have feature label');
    assert(r.data.labels.includes('urgent'), 'should have urgent label');
  });

  // Update task assignee
  await test('Update task assignee', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}`, {
      assignee: ctx.memberIdentifier,
    });
    assertEqual(r.status, 200, 'update status');
  });

  // Update task priority
  await test('Update task priority', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}`, {
      priority: 'P0',
    });
    assertEqual(r.status, 200, 'update status');
    assertEqual(r.data.priority, 'P0', 'priority changed');
  });

  // Update task tags
  await test('Update task tags', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}`, {
      tags: ['api-test', 'auto'],
    });
    assertEqual(r.status, 200, 'update status');
    assert(r.data.tags.includes('api-test'), 'should have tag');
  });

  // Update non-existent task → 404
  await test('Update non-existent task → 404', async () => {
    const r = await api('PATCH', '/api/v1/tasks/ZZZZZ-999', { title: 'nope' });
    assertEqual(r.status, 404, 'should be 404');
  });

  // Filter tasks by status
  await test('Filter tasks by status', async () => {
    const r = await api('GET', '/api/v1/tasks?status=active');
    assertEqual(r.status, 200, 'filter status');
    assert(Array.isArray(r.data), 'should be array');
    for (const t of r.data) assertEqual(t.status, 'active', 'all should be active');
  });

  // Filter tasks by priority
  await test('Filter tasks by priority', async () => {
    const r = await api('GET', '/api/v1/tasks?priority=P0');
    assertEqual(r.status, 200, 'filter status');
    for (const t of r.data) assertEqual(t.priority, 'P0', 'all should be P0');
  });

  // Multiple fast creates to test ID uniqueness
  await test('Rapid task creation (5x) - no UNIQUE constraint failures', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(api('POST', '/api/v1/tasks', {
        title: `Rapid Task ${i}-${UID}`,
        priority: 'P2',
      }));
    }
    const results = await Promise.all(promises);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      assert(r.status === 201, `Rapid task ${i}: expected 201, got ${r.status} - ${JSON.stringify(r.data)}`);
      ctx.taskIds.push(r.data.taskId);
    }
    // Verify all IDs are unique
    const ids = results.map(r => r.data.taskId);
    const uniqueIds = new Set(ids);
    assertEqual(uniqueIds.size, ids.length, `All IDs should be unique: ${ids.join(', ')}`);
  });
}

// ── Tasks Tree ──────────────────────────────────────────────────────
async function testTasksTree() {
  console.log('\n🌲 [7/16] Tasks Tree');

  await test('Get task tree', async () => {
    const r = await api('GET', '/api/v1/tasks/tree');
    assertEqual(r.status, 200, 'tree status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.length >= 1, 'should have root nodes');
    // Check that root nodes have children array
    for (const node of r.data) {
      assert('children' in node, 'root nodes should have children');
    }
  });

  await test('Get task children', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/children`);
    assertEqual(r.status, 200, 'children status');
    assert(Array.isArray(r.data), 'should be array');
  });

  await test('Get task context', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[1]}/context`);
    assertEqual(r.status, 200, 'context status');
    assert(r.data.current, 'should have current');
    assert(Array.isArray(r.data.ancestors), 'should have ancestors');
    assert(Array.isArray(r.data.siblings), 'should have siblings');
    assert(Array.isArray(r.data.children), 'should have children');
  });

  await test('Get context for non-existent task → 404', async () => {
    const r = await api('GET', '/api/v1/tasks/ZZZZZ-999/context');
    assertEqual(r.status, 404, 'should be 404');
  });

  // Reparent
  await test('Reparent task (move child to root)', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[1]}/reparent`, {
      new_parent_task_id: null,
    });
    assertEqual(r.status, 200, 'reparent status');
  });

  await test('Reparent task (move back to parent)', async () => {
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[1]}/reparent`, {
      new_parent_task_id: ctx.taskIds[0],
    });
    assertEqual(r.status, 200, 'reparent status');
  });

  // Reparent cycle detection
  await test('Reparent task into own subtree → 400', async () => {
    // Try to move parent into its own child
    const r = await api('PATCH', `/api/v1/tasks/${ctx.taskIds[0]}/reparent`, {
      new_parent_task_id: ctx.taskIds[1],
    });
    assertEqual(r.status, 400, 'should be 400 for cycle');
  });

  await test('Reparent non-existent task → 404', async () => {
    const r = await api('PATCH', '/api/v1/tasks/ZZZZZ-999/reparent', {
      new_parent_task_id: null,
    });
    assertEqual(r.status, 404, 'should be 404');
  });

  // Reorder children
  await test('Reorder children', async () => {
    const children = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/children`);
    if (children.data && children.data.length > 0) {
      const childIds = children.data.map(c => c.taskId);
      const r = await api('PATCH', '/api/v1/tasks/reorder-children', {
        parent_task_id: ctx.taskIds[0],
        ordered_child_ids: childIds,
      });
      assertEqual(r.status, 200, 'reorder status');
      assert(r.data.ok === true, 'should return ok');
    }
  });
}

// ── Task Progress/Complete/Blocker ──────────────────────────────────
async function testTaskProgress() {
  console.log('\n📊 [8/16] Task Progress & Completion');

  await test('Update progress', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/progress`, {
      progress: 50,
      summary: 'Half done',
    });
    assertEqual(r.status, 200, 'progress status');
    assertEqual(r.data.progress, 50, 'progress should be 50');
  });

  await test('Get progress history', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/history`);
    assertEqual(r.status, 200, 'history status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.length >= 1, 'should have at least one entry');
  });

  await test('Report blocker', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/blocker`, {
      blocker: 'Waiting for API review',
    });
    assertEqual(r.status, 200, 'blocker status');
    assertEqual(r.data.blocker, 'Waiting for API review', 'blocker set');
  });

  await test('Complete task', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[3]}/complete`, {
      summary: 'All done',
    });
    assertEqual(r.status, 200, 'complete status');
    assertEqual(r.data.status, 'done', 'should be done');
    assertEqual(r.data.progress, 100, 'should be 100%');
  });

  await test('Progress on non-existent task → 404', async () => {
    const r = await api('POST', '/api/v1/tasks/ZZZZZ-999/progress', {
      progress: 50,
    });
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Task Notes ──────────────────────────────────────────────────────
async function testTaskNotes() {
  console.log('\n📝 [9/16] Task Notes');

  await test('Add note', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/notes`, {
      content: 'This is a test note',
      author: 'test-user',
    });
    assertEqual(r.status, 201, 'note create status');
    assert(r.data.id, 'should have id');
    ctx.noteId = r.data.id;
  });

  await test('List notes', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/notes`);
    assertEqual(r.status, 200, 'notes list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.length >= 1, 'should have at least one note');
  });

  await test('Add note to non-existent task → 404', async () => {
    const r = await api('POST', '/api/v1/tasks/ZZZZZ-999/notes', {
      content: 'nope',
    });
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Batch Operations ────────────────────────────────────────────────
async function testBatchOps() {
  console.log('\n🔄 [10/16] Batch Operations');

  await test('Batch update status', async () => {
    const idsToUpdate = ctx.taskIds.slice(0, 3);
    const r = await api('PATCH', '/api/v1/tasks/batch', {
      task_ids: idsToUpdate,
      updates: { status: 'planned' },
    });
    assertEqual(r.status, 200, 'batch status');
    assert(Array.isArray(r.data), 'should be array');
    for (const t of r.data) {
      assertEqual(t.status, 'planned', `task ${t.taskId} should be planned`);
    }
  });

  await test('Batch update priority', async () => {
    const idsToUpdate = ctx.taskIds.slice(0, 2);
    const r = await api('PATCH', '/api/v1/tasks/batch', {
      task_ids: idsToUpdate,
      updates: { priority: 'P1' },
    });
    assertEqual(r.status, 200, 'batch status');
    for (const t of r.data) assertEqual(t.priority, 'P1', 'should be P1');
  });

  await test('Batch with empty task_ids → 400', async () => {
    const r = await api('PATCH', '/api/v1/tasks/batch', {
      task_ids: [],
      updates: { status: 'active' },
    });
    assertEqual(r.status, 400, 'should be 400');
  });

  await test('Batch with no updates → 400', async () => {
    const r = await api('PATCH', '/api/v1/tasks/batch', {
      task_ids: [ctx.taskIds[0]],
    });
    assertEqual(r.status, 400, 'should be 400');
  });
}

// ── Archive ─────────────────────────────────────────────────────────
async function testArchive() {
  console.log('\n📦 [11/16] Archive');

  // Use a fresh task for archive tests
  let archiveTaskId;
  await test('Create task for archive test', async () => {
    const r = await api('POST', '/api/v1/tasks', {
      title: `Archive Test ${UID}`,
    });
    assertEqual(r.status, 201, 'create status');
    archiveTaskId = r.data.taskId;
  });

  await test('Archive task', async () => {
    const r = await api('POST', `/api/v1/tasks/${archiveTaskId}/archive`);
    assertEqual(r.status, 200, 'archive status');
    assert(r.data.archivedAt !== null, 'should have archivedAt');
  });

  await test('List archived tasks', async () => {
    const r = await api('GET', '/api/v1/tasks/archived');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.some(t => t.taskId === archiveTaskId), 'should include archived task');
  });

  await test('Archived task not in regular tree', async () => {
    const r = await api('GET', '/api/v1/tasks/tree');
    assertEqual(r.status, 200, 'tree status');
    // Recursively check that archived task is not in tree
    function findInTree(nodes, targetId) {
      for (const n of nodes) {
        if (n.taskId === targetId) return true;
        if (n.children && findInTree(n.children, targetId)) return true;
      }
      return false;
    }
    assert(!findInTree(r.data, archiveTaskId), 'archived task should not be in tree');
  });

  await test('Unarchive task', async () => {
    const r = await api('POST', `/api/v1/tasks/${archiveTaskId}/unarchive`);
    assertEqual(r.status, 200, 'unarchive status');
    assert(r.data.archivedAt === null || r.data.archivedAt === undefined, 'should not have archivedAt');
  });

  await test('Archive non-existent task → 404', async () => {
    const r = await api('POST', '/api/v1/tasks/ZZZZZ-999/archive');
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Backlog ─────────────────────────────────────────────────────────
async function testBacklog() {
  console.log('\n📋 [12/16] Backlog');

  await test('Create backlog item', async () => {
    const r = await api('POST', '/api/v1/backlog', {
      title: `Backlog Item ${UID}`,
      description: 'Test backlog item',
      priority: 'P1',
      source: 'auto-test',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.backlogId, 'should have backlogId');
    ctx.backlogIds.push(r.data.backlogId);
  });

  await test('Create child backlog item', async () => {
    const r = await api('POST', '/api/v1/backlog', {
      title: `Child Backlog ${UID}`,
      parent_backlog_id: ctx.backlogIds[0],
    });
    assertEqual(r.status, 201, 'create status');
    ctx.backlogIds.push(r.data.backlogId);
  });

  await test('List backlog items', async () => {
    const r = await api('GET', '/api/v1/backlog');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.some(b => b.backlogId === ctx.backlogIds[0]), 'should include created item');
  });

  await test('List backlog tree', async () => {
    const r = await api('GET', '/api/v1/backlog/tree');
    assertEqual(r.status, 200, 'tree status');
    assert(Array.isArray(r.data), 'should be array');
  });

  await test('Update backlog item', async () => {
    const r = await api('PATCH', `/api/v1/backlog/${ctx.backlogIds[0]}`, {
      description: 'Updated backlog desc',
    });
    assertEqual(r.status, 200, 'update status');
  });

  await test('Update non-existent backlog → 404', async () => {
    const r = await api('PATCH', '/api/v1/backlog/BL-ZZZZZ', { title: 'nope' });
    assertEqual(r.status, 404, 'should be 404');
  });

  await test('Schedule backlog item → creates task', async () => {
    const r = await api('POST', `/api/v1/backlog/${ctx.backlogIds[0]}/schedule`, {
      owner: 'test-user',
      priority: 'P1',
    });
    assertEqual(r.status, 200, 'schedule status');
    assert(r.data.taskId, 'should return a task with taskId');
  });
}

// ── Iterations ──────────────────────────────────────────────────────
async function testIterations() {
  console.log('\n🔁 [13/16] Iterations');

  await test('Create iteration', async () => {
    const r = await api('POST', '/api/v1/iterations', {
      name: `Sprint ${UID}`,
      description: 'Test iteration',
      start_date: '2026-03-18',
      end_date: '2026-04-01',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.id, 'should have id');
    ctx.iterationId = r.data.id;
  });

  await test('List iterations', async () => {
    const r = await api('GET', '/api/v1/iterations');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
  });

  await test('Get iteration by id', async () => {
    const r = await api('GET', `/api/v1/iterations/${ctx.iterationId}`);
    assertEqual(r.status, 200, 'get status');
    assert(r.data.tasks !== undefined, 'should have tasks array');
  });

  await test('Update iteration', async () => {
    const r = await api('PATCH', `/api/v1/iterations/${ctx.iterationId}`, {
      description: 'Updated iteration',
    });
    assertEqual(r.status, 200, 'update status');
  });

  await test('Add task to iteration', async () => {
    const r = await api('POST', `/api/v1/iterations/${ctx.iterationId}/tasks`, {
      task_id: ctx.taskIds[0],
    });
    assertEqual(r.status, 200, 'add task status');
    assert(r.data.ok === true, 'should return ok');
  });

  await test('Add same task to iteration again (should not crash)', async () => {
    // Depending on implementation, this might succeed silently or error
    const r = await api('POST', `/api/v1/iterations/${ctx.iterationId}/tasks`, {
      task_id: ctx.taskIds[0],
    });
    // We just check it doesn't crash with 500
    assert(r.status < 500, `should not be 500, got ${r.status}`);
  });

  await test('Add non-existent task to iteration → 404', async () => {
    const r = await api('POST', `/api/v1/iterations/${ctx.iterationId}/tasks`, {
      task_id: 'ZZZZZ-999',
    });
    assertEqual(r.status, 404, 'should be 404');
  });

  await test('Remove task from iteration', async () => {
    const r = await api('DELETE', `/api/v1/iterations/${ctx.iterationId}/tasks/${ctx.taskIds[0]}`);
    assertEqual(r.status, 200, 'remove status');
  });

  await test('Create iteration without name → 400', async () => {
    const r = await api('POST', '/api/v1/iterations', {
      description: 'No name',
    });
    assertEqual(r.status, 400, 'should be 400');
  });

  await test('Get non-existent iteration → 404', async () => {
    const r = await api('GET', '/api/v1/iterations/99999');
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ── Notifications ───────────────────────────────────────────────────
async function testNotifications() {
  console.log('\n🔔 [14/16] Notifications');

  await test('Get notifications (may be empty)', async () => {
    const r = await api('GET', '/api/v1/notifications');
    assertEqual(r.status, 200, 'status');
    assert(Array.isArray(r.data), 'should be array');
    if (r.data.length > 0) ctx.notificationId = r.data[0].id;
  });

  await test('Get unread count', async () => {
    const r = await api('GET', '/api/v1/notifications/unread-count');
    assertEqual(r.status, 200, 'status');
    assert(typeof r.data.count === 'number', 'count should be number');
  });

  if (ctx.notificationId) {
    await test('Mark notification as read', async () => {
      const r = await api('PATCH', `/api/v1/notifications/${ctx.notificationId}/read`);
      assertEqual(r.status, 200, 'status');
    });
  }

  await test('Mark all as read', async () => {
    const r = await api('POST', '/api/v1/notifications/read-all');
    assertEqual(r.status, 200, 'status');
  });

  await test('Notifications without user header → 400', async () => {
    const r = await api('GET', '/api/v1/notifications', null, { 'X-ClawPM-User': '' });
    // Without user, should be 400
    assertEqual(r.status, 400, 'should be 400');
  });
}

// ── Custom Fields, Attachments, Goals, ReqLinks, Intake, Permissions, Dashboard ──
async function testMiscEndpoints() {
  console.log('\n🧩 [15/16] Misc: CustomFields, Attachments, Goals, ReqLinks, Intake, Permissions, Dashboard');

  // ── Custom Fields ──
  await test('Create custom field', async () => {
    const r = await api('POST', '/api/v1/custom-fields', {
      name: `TestField-${UID}`,
      field_type: 'text',
    });
    assertEqual(r.status, 201, 'create status');
    ctx.customFieldId = r.data.id;
  });

  await test('List custom fields', async () => {
    const r = await api('GET', '/api/v1/custom-fields');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
  });

  await test('Update custom field', async () => {
    const r = await api('PATCH', `/api/v1/custom-fields/${ctx.customFieldId}`, {
      name: `Updated-${UID}`,
    });
    assertEqual(r.status, 200, 'update status');
  });

  await test('Get task field values', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/fields`);
    assertEqual(r.status, 200, 'fields status');
    assert(Array.isArray(r.data), 'should be array');
  });

  await test('Set task field value', async () => {
    const r = await api('PUT', `/api/v1/tasks/${ctx.taskIds[0]}/fields`, {
      [ctx.customFieldId]: 'test-value',
    });
    assertEqual(r.status, 200, 'set field status');
  });

  // ── Attachments ──
  await test('Add attachment', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/attachments`, {
      type: 'doc',
      title: `Doc ${UID}`,
      content: 'Test document content',
      created_by: 'test-user',
    });
    assertEqual(r.status, 201, 'create status');
    ctx.attachmentId = r.data.id;
  });

  await test('List attachments', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/attachments`);
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    assert(r.data.length >= 1, 'should have at least one');
  });

  await test('Get attachment by id', async () => {
    const r = await api('GET', `/api/v1/attachments/${ctx.attachmentId}`);
    assertEqual(r.status, 200, 'get status');
  });

  await test('Update attachment', async () => {
    const r = await api('PATCH', `/api/v1/attachments/${ctx.attachmentId}`, {
      title: `Updated Doc ${UID}`,
    });
    assertEqual(r.status, 200, 'update status');
  });

  await test('Add attachment to non-existent task → 404', async () => {
    const r = await api('POST', '/api/v1/tasks/ZZZZZ-999/attachments', {
      type: 'doc',
      title: 'x',
      content: 'x',
    });
    assertEqual(r.status, 404, 'should be 404');
  });

  // ── Goals & Objectives ──
  await test('Create goal', async () => {
    const r = await api('POST', '/api/v1/goals', {
      title: `Goal ${UID}`,
      description: 'Test goal',
      objectives: [{ title: `Obj ${UID}`, weight: 1.0 }],
    });
    assertEqual(r.status, 201, 'create status');
    ctx.goalId = r.data.id;
  });

  await test('List goals', async () => {
    const r = await api('GET', '/api/v1/goals');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
    const goal = r.data.find(g => g.id === ctx.goalId);
    assert(goal, 'should include created goal');
    if (goal && goal.objectives && goal.objectives.length > 0) {
      ctx.objectiveId = goal.objectives[0].id;
    }
  });

  if (ctx.objectiveId) {
    await test('Link task to objective', async () => {
      const r = await api('POST', `/api/v1/goals/${ctx.goalId}/link-task`, {
        objective_id: ctx.objectiveId,
        task_id: ctx.taskIds[0],
      });
      assertEqual(r.status, 200, 'link status');
    });
  }

  // ── Req Links ──
  await test('Create req link', async () => {
    const r = await api('POST', '/api/v1/req-links', {
      source_task_id: ctx.taskIds[0],
      target_task_id: ctx.taskIds[2],
      link_type: 'relates',
    });
    assertEqual(r.status, 201, 'create status');
    ctx.reqLinkId = r.data.id;
  });

  await test('List req links', async () => {
    const r = await api('GET', '/api/v1/req-links');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
  });

  // ── Intake ──
  await test('Submit intake item', async () => {
    const r = await api('POST', '/api/v1/intake', {
      title: `Intake ${UID}`,
      description: 'Test intake item',
      submitter: 'external-user',
      category: 'bug',
    });
    assertEqual(r.status, 201, 'create status');
    assert(r.data.intakeId, 'should have intakeId');
    ctx.intakeId = r.data.intakeId;
  });

  await test('List intake items', async () => {
    const r = await api('GET', '/api/v1/intake');
    assertEqual(r.status, 200, 'list status');
    assert(Array.isArray(r.data), 'should be array');
  });

  await test('Get intake stats', async () => {
    const r = await api('GET', '/api/v1/intake/stats');
    assertEqual(r.status, 200, 'stats status');
    assert(typeof r.data.total === 'number', 'should have total');
  });

  await test('Get intake by intakeId', async () => {
    const r = await api('GET', `/api/v1/intake/${ctx.intakeId}`);
    assertEqual(r.status, 200, 'get status');
  });

  await test('Submit intake without title → 400', async () => {
    const r = await api('POST', '/api/v1/intake', {
      submitter: 'x',
    });
    assertEqual(r.status, 400, 'should be 400');
  });

  await test('Submit intake without submitter → 400', async () => {
    const r = await api('POST', '/api/v1/intake', {
      title: 'x',
    });
    assertEqual(r.status, 400, 'should be 400');
  });

  await test('Review intake (accept)', async () => {
    const r = await api('POST', `/api/v1/intake/${ctx.intakeId}/review`, {
      action: 'accept',
      reviewed_by: 'test-user',
      review_note: 'Looks good',
    });
    assertEqual(r.status, 200, 'review status');
  });

  // Create another intake for defer/reopen test
  let deferIntakeId;
  await test('Submit and defer intake', async () => {
    const r1 = await api('POST', '/api/v1/intake', {
      title: `Defer Test ${UID}`,
      submitter: 'ext-user',
    });
    assertEqual(r1.status, 201, 'create status');
    deferIntakeId = r1.data.intakeId;

    const r2 = await api('POST', `/api/v1/intake/${deferIntakeId}/review`, {
      action: 'defer',
      reviewed_by: 'test-user',
    });
    assertEqual(r2.status, 200, 'defer status');
  });

  await test('Reopen deferred intake', async () => {
    const r = await api('POST', `/api/v1/intake/${deferIntakeId}/reopen`);
    assertEqual(r.status, 200, 'reopen status');
  });

  await test('Get non-existent intake → 404', async () => {
    const r = await api('GET', '/api/v1/intake/IN-ZZZZZ');
    assertEqual(r.status, 404, 'should be 404');
  });

  // ── Permissions ──
  await test('Get task permissions', async () => {
    const r = await api('GET', `/api/v1/tasks/${ctx.taskIds[0]}/permissions`);
    assertEqual(r.status, 200, 'status');
    assert(r.data.taskId, 'should have taskId');
    assert(Array.isArray(r.data.permissions), 'should have permissions array');
  });

  await test('Grant permission', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/permissions`, {
      grantee: `perm-mem-${UID}`,
      level: 'edit',
    });
    // Owner check: test-user is the owner, so this should work
    assert(r.status === 200 || r.status === 201, `grant status should be 200/201, got ${r.status}`);
  });

  await test('Grant permission without grantee → 400', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/permissions`, {
      level: 'edit',
    });
    assertEqual(r.status, 400, 'should be 400');
  });

  await test('Grant permission with invalid level → 400', async () => {
    const r = await api('POST', `/api/v1/tasks/${ctx.taskIds[0]}/permissions`, {
      grantee: `perm-mem-${UID}`,
      level: 'admin',
    });
    assertEqual(r.status, 400, 'should be 400');
  });

  // ── Dashboard ──
  await test('Get dashboard overview', async () => {
    const r = await api('GET', '/api/v1/dashboard/overview');
    assertEqual(r.status, 200, 'status');
    assert(typeof r.data.total === 'number', 'should have total');
  });

  await test('Get dashboard risks', async () => {
    const r = await api('GET', '/api/v1/dashboard/risks');
    assertEqual(r.status, 200, 'status');
  });

  await test('Get dashboard resources', async () => {
    const r = await api('GET', '/api/v1/dashboard/resources');
    assertEqual(r.status, 200, 'status');
    assert(r.data.byOwner !== undefined, 'should have byOwner');
  });

  // ── My Overview ──
  await test('Get my overview', async () => {
    const r = await api('GET', '/api/v1/my/overview');
    assertEqual(r.status, 200, 'status');
    assert(typeof r.data.total === 'number', 'should have total');
  });

  await test('My overview without user → 400', async () => {
    const r = await api('GET', '/api/v1/my/overview', null, { 'X-ClawPM-User': '' });
    assertEqual(r.status, 400, 'should be 400');
  });

  // ── Gantt ──
  await test('Get gantt data', async () => {
    const r = await api('GET', '/api/v1/gantt');
    assertEqual(r.status, 200, 'status');
    assert(Array.isArray(r.data.tasks), 'should have tasks array');
    assert(Array.isArray(r.data.milestones), 'should have milestones array');
  });
}

// ── Auth (Registration / Login / Session) ───────────────────────────
async function testAuth() {
  console.log('\n🔐 [16/16] Auth');

  ctx.accountUsername = `testuser-${UID}`;

  await test('Register account', async () => {
    const r = await api('POST', '/api/v1/auth/register', {
      username: ctx.accountUsername,
      password: 'TestPass123!',
      display_name: `Test User ${UID}`,
    });
    assertEqual(r.status, 201, 'register status');
    assert(r.data.token, 'should have token');
    ctx.accountToken = r.data.token;
  });

  await test('Login', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      username: ctx.accountUsername,
      password: 'TestPass123!',
    });
    assertEqual(r.status, 200, 'login status');
    assert(r.data.token, 'should have token');
  });

  await test('Login with wrong password → 401', async () => {
    const r = await api('POST', '/api/v1/auth/login', {
      username: ctx.accountUsername,
      password: 'WrongPass!',
    });
    assertEqual(r.status, 401, 'should be 401');
  });

  await test('Get me (with session token)', async () => {
    const r = await api('GET', '/api/v1/auth/me', null, {
      'Authorization': `Bearer ${ctx.accountToken}`,
    });
    assertEqual(r.status, 200, 'me status');
    assert(r.data.account, 'should have account');
    assertEqual(r.data.account.username, ctx.accountUsername, 'username match');
  });

  await test('Logout', async () => {
    const r = await api('POST', '/api/v1/auth/logout', null, {
      'Authorization': `Bearer ${ctx.accountToken}`,
    });
    assertEqual(r.status, 200, 'logout status');
  });

  await test('Register duplicate username → 400', async () => {
    const r = await api('POST', '/api/v1/auth/register', {
      username: ctx.accountUsername,
      password: 'Test123!',
      display_name: 'Dupe',
    });
    assertEqual(r.status, 400, 'should be 400 for duplicate');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n🧹 Cleanup');

  // Delete attachments
  if (ctx.attachmentId) {
    await test('Delete attachment', async () => {
      const r = await api('DELETE', `/api/v1/attachments/${ctx.attachmentId}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete custom field
  if (ctx.customFieldId) {
    await test('Delete custom field', async () => {
      const r = await api('DELETE', `/api/v1/custom-fields/${ctx.customFieldId}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete req link
  if (ctx.reqLinkId) {
    await test('Delete req link', async () => {
      const r = await api('DELETE', `/api/v1/req-links/${ctx.reqLinkId}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete iteration
  if (ctx.iterationId) {
    await test('Delete iteration', async () => {
      const r = await api('DELETE', `/api/v1/iterations/${ctx.iterationId}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete tasks (parent after children)
  const reversedTaskIds = [...ctx.taskIds].reverse();
  for (const tid of reversedTaskIds) {
    await test(`Delete task ${tid}`, async () => {
      const r = await api('DELETE', `/api/v1/tasks/${tid}`);
      // May be 200 or 404 (if already deleted as child)
      assert(r.status === 200 || r.status === 404, `delete ${tid}: expected 200/404, got ${r.status}`);
    });
  }

  // Delete member
  if (ctx.memberIdentifier) {
    await test('Delete member', async () => {
      const r = await api('DELETE', `/api/v1/members/${ctx.memberIdentifier}`);
      assertEqual(r.status, 200, 'delete status');
    });
    await test('Delete perm member', async () => {
      const r = await api('DELETE', `/api/v1/members/perm-mem-${UID}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete domain
  if (ctx.domainId) {
    await test('Delete domain', async () => {
      const r = await api('DELETE', `/api/v1/domains/${ctx.domainId}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete milestone
  if (ctx.milestoneId) {
    await test('Delete milestone', async () => {
      const r = await api('DELETE', `/api/v1/milestones/${ctx.milestoneId}`);
      assertEqual(r.status, 200, 'delete status');
    });
  }

  // Delete project (last because others depend on it)
  if (ctx.projectSlug) {
    await test('Delete test project', async () => {
      const r = await api('DELETE', `/api/v1/projects/${ctx.projectSlug}`);
      assertEqual(r.status, 200, 'delete status');
    });

    await test('Cannot delete default project', async () => {
      const r = await api('DELETE', '/api/v1/projects/default');
      assertEqual(r.status, 400, 'should be 400');
    });
  }

  // Delete non-existent resources
  await test('Delete non-existent task → 404', async () => {
    const r = await api('DELETE', '/api/v1/tasks/ZZZZZ-999');
    assertEqual(r.status, 404, 'should be 404');
  });

  await test('Delete non-existent attachment → 404', async () => {
    const r = await api('DELETE', '/api/v1/attachments/99999');
    assertEqual(r.status, 404, 'should be 404');
  });
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log(`🚀 ClawPM API Test Suite - ${new Date().toLocaleString()}`);
  console.log(`   UID: ${UID} | Base: ${BASE}`);
  console.log('═══════════════════════════════════════════════════');

  totalTests = 0;
  passedTests = 0;
  failedTests = 0;
  failures.length = 0;
  testTimings.length = 0;
  // Reset ctx
  ctx.taskIds = [];
  ctx.backlogIds = [];
  ctx.projectSlug = null;
  ctx.projectId = null;
  ctx.domainId = null;
  ctx.domainName = null;
  ctx.milestoneId = null;
  ctx.milestoneName = null;
  ctx.memberId = null;
  ctx.memberIdentifier = null;
  ctx.iterationId = null;
  ctx.intakeId = null;
  ctx.customFieldId = null;
  ctx.attachmentId = null;
  ctx.reqLinkId = null;
  ctx.goalId = null;
  ctx.objectiveId = null;
  ctx.noteId = null;
  ctx.notificationId = null;
  ctx.accountToken = null;
  ctx.accountUsername = null;

  const startTime = Date.now();

  try {
    await testServerHealth();
    await testProjects();
    await testDomains();
    await testMilestones();
    await testMembers();
    await testTasksCRUD();
    await testTasksTree();
    await testTaskProgress();
    await testTaskNotes();
    await testBatchOps();
    await testArchive();
    await testBacklog();
    await testIterations();
    await testNotifications();
    await testMiscEndpoints();
    await testAuth();
    await cleanup();
  } catch (e) {
    console.error(`\n💥 Fatal error: ${e.message}`);
    console.error(e.stack);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`📊 Results: ${passedTests}/${totalTests} passed, ${failedTests} failed (${elapsed}s)`);
  console.log('═══════════════════════════════════════════════════');

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    for (const f of failures) {
      console.log(`  • ${f.name}: ${f.error}`);
    }
  } else {
    console.log('\n✅ ALL TESTS PASSED! 🎉');
  }

  // Show slowest tests
  const sorted = [...testTimings].sort((a, b) => b.ms - a.ms);
  if (sorted.length > 5) {
    console.log('\n⏱️  Slowest tests:');
    for (const t of sorted.slice(0, 5)) {
      console.log(`  ${t.ms}ms - ${t.name}`);
    }
  }

  return { total: totalTests, passed: passedTests, failed: failedTests, failures };
}

// ── Loop mode ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const loopMode = args.includes('--loop');
const MAX_DURATION_MS = 60 * 60 * 1000; // 1 hour

async function main() {
  if (!loopMode) {
    await runAllTests();
    process.exit(failedTests > 0 ? 1 : 0);
  }

  // Loop mode: run tests every 60 seconds
  console.log('🔄 Loop mode enabled. Will run for up to 1 hour.\n');
  const loopStart = Date.now();
  let round = 0;

  while (Date.now() - loopStart < MAX_DURATION_MS) {
    round++;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔄 ROUND ${round} — ${new Date().toLocaleString()}`);
    console.log(`${'═'.repeat(60)}`);

    const result = await runAllTests();

    if (result.failed === 0) {
      console.log(`\n🎉 ALL ${result.total} TESTS PASSED in round ${round}! Exiting loop.`);
      process.exit(0);
    }

    const elapsed = ((Date.now() - loopStart) / 1000 / 60).toFixed(1);
    console.log(`\n⏳ Round ${round} done. ${result.failed} failures. Elapsed: ${elapsed} min. Waiting 60s...`);

    // Wait 60 seconds
    await new Promise(r => setTimeout(r, 60000));
  }

  console.log('\n⏰ 1 hour time limit reached. Exiting.');
  process.exit(1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
