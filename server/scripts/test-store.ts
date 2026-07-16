// store/ 模块单元测试（node:assert，无测试框架依赖）
// 运行: pnpm exec tsx scripts/test-store.ts

import assert from 'node:assert/strict';
import {
  compareRanks,
  firstRank,
  rankAfter,
  rankBetween,
  RankError,
  spreadRanks,
} from '../src/store/rank.js';
import {
  isOmittedTaskValue,
  joinDescription,
  naturalCompare,
  parseTaskShard,
  splitDescription,
  stableStringify,
  stringifyConfig,
  stringifyDomains,
  stringifyLinks,
  stringifyTaskShard,
} from '../src/store/canonical.js';
import { DEFAULT_WORKFLOW, VAULT_FORMAT, type VaultTask } from '../src/store/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shardFileName, shardRelPath, writeVault, loadVault, syncVault, removeFile } from '../src/store/files.js';

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

// ── rank ────────────────────────────────────────────────────────

test('rankBetween 基本序', () => {
  const mid = rankBetween(null, null);
  assert.equal(mid, 'i');
  assert.ok(rankBetween(null, 'i') < 'i');
  assert.ok(rankBetween('i', null) > 'i');
  const between = rankBetween('a', 'b');
  assert.ok(between > 'a' && between < 'b');
});

test('rankBetween 相邻间隙为 1', () => {
  const r = rankBetween('a0', 'a1');
  assert.ok(r > 'a0' && r < 'a1', `'${r}' 应介于 a0 与 a1`);
});

test('rankBetween 深层紧邻（z 连续位）', () => {
  const r = rankBetween('0zz', '10');
  assert.ok(r > '0zz' && r < '10', `'${r}' 应介于 0zz 与 10`);
});

test('rankBetween 生成值末位永不为 0', () => {
  // 随机插入 500 次，校验不变式：生成值末位非 '0' 且保持全序
  let ranks = spreadRanks(5);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 500; i++) {
    const pos = Math.floor(rand() * (ranks.length + 1));
    const lo = pos === 0 ? null : ranks[pos - 1];
    const hi = pos === ranks.length ? null : ranks[pos];
    const r = rankBetween(lo, hi);
    assert.ok(!r.endsWith('0'), `生成值 '${r}' 末位为 0`);
    if (lo !== null) assert.ok(r > lo, `'${r}' <= '${lo}'`);
    if (hi !== null) assert.ok(r < hi, `'${r}' >= '${hi}'`);
    ranks.splice(pos, 0, r);
  }
  const sorted = [...ranks].sort();
  assert.deepEqual(ranks, sorted, '插入后应保持全序');
  assert.equal(new Set(ranks).size, ranks.length, '不应产生重复 rank');
});

test('rankBetween 非法输入抛 RankError', () => {
  assert.throws(() => rankBetween('b', 'a'), RankError);
  assert.throws(() => rankBetween('a', 'a'), RankError);
  assert.throws(() => rankBetween('a1', 'a10'), RankError); // hi = lo + "0"，区间为空
});

test('spreadRanks 定宽、有序、无重复', () => {
  for (const n of [1, 2, 5, 36, 298, 1000]) {
    const ranks = spreadRanks(n);
    assert.equal(ranks.length, n);
    assert.equal(new Set(ranks).size, n);
    const width = ranks[0].length;
    for (const r of ranks) assert.equal(r.length, width, `spreadRanks(${n}) 应定宽`);
    assert.deepEqual([...ranks].sort(), ranks, `spreadRanks(${n}) 应有序`);
  }
  assert.deepEqual(spreadRanks(0), []);
});

test('spreadRanks 后可继续 rankBetween 插入', () => {
  const ranks = spreadRanks(298);
  const head = rankBetween(null, ranks[0]);
  const tail = rankAfter(ranks[ranks.length - 1]);
  const mid = rankBetween(ranks[0], ranks[1]);
  assert.ok(head < ranks[0]);
  assert.ok(tail > ranks[ranks.length - 1]);
  assert.ok(mid > ranks[0] && mid < ranks[1]);
});

test('compareRanks 缺失排最后', () => {
  assert.ok(compareRanks('a', undefined) < 0);
  assert.ok(compareRanks(undefined, 'a') > 0);
  assert.equal(compareRanks(undefined, undefined), 0);
  assert.ok(compareRanks('a', 'b') < 0);
});

// ── naturalCompare ──────────────────────────────────────────────

test('naturalCompare 数字段按数值比较', () => {
  assert.ok(naturalCompare('FEAT-2', 'FEAT-10') < 0);
  assert.ok(naturalCompare('FEAT-WEBUI-10', 'FEAT-WEBUI-2') > 0);
  assert.ok(naturalCompare('AI-001', 'AI-002') < 0);
  assert.ok(naturalCompare('a', 'b') < 0);
  assert.equal(naturalCompare('x-1', 'x-1'), 0);
  assert.ok(naturalCompare('x-01', 'x-1') !== 0, '数值相等位数不同也需全序');
  const arr = ['B-1', 'A-10', 'A-2', 'A-2b'];
  arr.sort(naturalCompare);
  assert.deepEqual(arr, ['A-2', 'A-2b', 'A-10', 'B-1']);
});

test('naturalCompare 超长数字段确定性（parseInt 会丢精度）', () => {
  // 两个相差 1 的 20 位数字，parseInt 会判等破坏排序
  const a = 'T-12345678901234567890';
  const b = 'T-12345678901234567891';
  assert.ok(naturalCompare(a, b) < 0, '超长数字段应仍严格有序');
  assert.ok(naturalCompare(b, a) > 0);
  assert.equal(naturalCompare(a, a), 0);
  // 全序性：排序后稳定
  const arr = [b, a, 'T-9', 'T-100'];
  arr.sort(naturalCompare);
  assert.deepEqual(arr, ['T-9', 'T-100', a, b]);
});

// ── serializer ──────────────────────────────────────────────────

test('缺省值省略规则', () => {
  assert.ok(isOmittedTaskValue('type', 'task'));
  assert.ok(!isOmittedTaskValue('type', 'feat'));
  assert.ok(isOmittedTaskValue('progress', 0));
  assert.ok(!isOmittedTaskValue('progress', 40));
  assert.ok(isOmittedTaskValue('priority', 'P2'));
  assert.ok(!isOmittedTaskValue('priority', 'P0'));
  assert.ok(isOmittedTaskValue('tags', []));
  assert.ok(isOmittedTaskValue('fields', {}));
  assert.ok(isOmittedTaskValue('owner', null));
  assert.ok(isOmittedTaskValue('owner', ''));
  assert.ok(!isOmittedTaskValue('status', 'backlog'));
});

const sampleTasks: VaultTask[] = [
  {
    id: 'T-10',
    title: '后写的任务',
    status: 'backlog',
    rank: '0g',
    createdAt: '2026-01-02 00:00:00',
    updatedAt: '2026-01-02 00:00:00',
  },
  {
    id: 'T-2',
    title: '含全部字段',
    type: 'feat',
    status: 'active',
    statusNote: '进行中备注',
    progress: 40,
    priority: 'P0',
    parent: 'T-10',
    rank: '08',
    owner: 'alice',
    dueDate: '2026-07-20',
    domain: 'AI',
    labels: ['feature'],
    tags: ['ui', '看板'],
    tracking: { 评审: 'done', 代码实现: 'pending' },
    fields: { 复杂度: '高' },
    description: ['第一行', '', '第三行'],
    notes: [{ at: '2026-01-01 10:00:00', by: 'bob', text: '一条备注' }],
    history: [{ at: '2026-01-01 11:00:00', progress: 40, summary: '骨架完成' }],
    'x-agent-extra': { custom: true },
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-01-01 00:00:00',
  },
];

test('stringifyTaskShard 结构与排序', () => {
  const text = stringifyTaskShard(sampleTasks);
  assert.ok(text.endsWith('}\n'), '文件末尾应有换行');
  assert.ok(!text.includes('\r'), '不应含 CR');
  assert.ok(text.indexOf('"T-2"') < text.indexOf('"T-10"'), '应按 id 自然排序');
  assert.ok(!text.includes('"progress": 0'), '缺省 progress 应省略');
  assert.ok(text.includes('"x-agent-extra"'), '未知字段应透传');
  const lines = text.split('\n');
  const descStart = lines.findIndex((l) => l.includes('"description"'));
  assert.ok(lines[descStart + 1].trim() === '"第一行",', 'description 应每行一个元素');
});

test('parse → stringify 幂等（canonical 不动点）', () => {
  const text1 = stringifyTaskShard(sampleTasks);
  const shard = parseTaskShard(text1, 'test.json');
  const text2 = stringifyTaskShard(shard.tasks);
  assert.equal(text1, text2);
});

test('必填字段 title/status 即使为空也不省略', () => {
  const t: VaultTask = { id: 'X-1', title: '', status: '' };
  const text = stringifyTaskShard([t]);
  assert.ok(text.includes('"title": ""'), 'title="" 必须落盘，否则 import 丢任务');
  assert.ok(text.includes('"status": ""'), 'status="" 必须落盘，否则 import 崩溃');
  // round-trip 后仍在
  const back = parseTaskShard(text, 't.json').tasks;
  assert.equal(back.length, 1);
  assert.equal(back[0].title, '');
});

test('stableStringify 键序确定', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), '{"a":{"c":3,"d":2},"b":1}');
  assert.equal(stableStringify({ a: undefined, b: 1 }), '{"b":1}');
});

test('description split/join round-trip', () => {
  assert.deepEqual(splitDescription('a\nb\n\nc'), ['a', 'b', '', 'c']);
  assert.deepEqual(splitDescription('a\r\nb'), ['a', 'b']);
  assert.equal(splitDescription(''), undefined);
  assert.equal(splitDescription(null), undefined);
  assert.equal(joinDescription(['a', 'b', '', 'c']), 'a\nb\n\nc');
  assert.equal(joinDescription(undefined), null);
  assert.equal(joinDescription(splitDescription('多行\n文本')), '多行\n文本');
});

test('stringifyConfig 可解析且含 workflow', () => {
  const text = stringifyConfig({ format: VAULT_FORMAT, name: '测试', workflow: DEFAULT_WORKFLOW });
  const parsed = JSON.parse(text);
  assert.equal(parsed.format, VAULT_FORMAT);
  assert.equal(parsed.workflow.statuses.length, 5);
  assert.ok(text.endsWith('\n'));
});

test('stringifyDomains / stringifyLinks 排序与省略', () => {
  const domains = stringifyDomains([
    { code: 'B', name: 'b域', keywords: [] },
    { code: 'A', name: 'a域', color: '#fff' },
  ]);
  assert.ok(domains.indexOf('"A"') < domains.indexOf('"B"'));
  assert.ok(!domains.includes('keywords'), '空 keywords 应省略');
  const links = stringifyLinks([
    { source: 'B-1', target: 'C-1', type: 'blocks' },
    { source: 'A-1', target: 'C-1', type: 'relates' },
  ]);
  assert.ok(links.indexOf('A-1') < links.indexOf('B-1'), 'links 应按 source 排序');
});

// ── files ───────────────────────────────────────────────────────

test('shardFileName 处理非法字符与保留名', () => {
  assert.equal(shardFileName('WEBUI'), 'WEBUI.json');
  assert.equal(shardFileName('用户认证'), '用户认证.json');
  assert.equal(shardFileName('a/b:c'), 'a_b_c.json');
  assert.equal(shardFileName('末尾点.'), '末尾点.json');
  assert.equal(shardFileName(''), '_unnamed.json');
});

test('shardRelPath 归档与 inbox 归属', () => {
  assert.equal(shardRelPath({ id: 'x', title: 'x', status: 'done', domain: 'AI' }), 'tasks/AI.json');
  assert.equal(shardRelPath({ id: 'x', title: 'x', status: 'done' }), 'tasks/_inbox.json');
  assert.equal(
    shardRelPath({ id: 'x', title: 'x', status: 'done', domain: 'AI', archivedAt: '2026-01-01' }),
    'archive/AI.json'
  );
});

test('writeVault 拦截大小写不敏感的分片名冲突', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpm-collide-'));
  try {
    assert.throws(
      () =>
        writeVault(tmp, {
          config: { format: VAULT_FORMAT, name: 't', workflow: DEFAULT_WORKFLOW },
          domains: [],
          milestones: [],
          fields: [],
          links: [],
          tasks: [
            { id: 'A-1', title: 'a', status: 'backlog', domain: 'AI' },
            { id: 'B-1', title: 'b', status: 'backlog', domain: 'ai' },
          ],
        }),
      /大小写/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadVault 容错：null 元素、空 title、悬空 parent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpm-load-'));
  try {
    fs.writeFileSync(path.join(tmp, 'clawpm.json'), stringifyConfig({
      format: VAULT_FORMAT, name: 't', workflow: DEFAULT_WORKFLOW,
    }));
    fs.mkdirSync(path.join(tmp, 'tasks'));
    // 手工构造含 null、缺 title、悬空 parent 的分片
    fs.writeFileSync(
      path.join(tmp, 'tasks', 'X.json'),
      JSON.stringify({
        format: 'clawpm-tasks@1',
        tasks: [
          null,
          { id: 'X-1', status: 'active' }, // 缺 title
          { id: 'X-2', title: '正常', status: 'active', parent: 'NOPE-9' },
        ],
      })
    );
    const v = loadVault(tmp);
    assert.equal(v.tasks.length, 1, '只应载入合法任务');
    assert.equal(v.tasks[0].id, 'X-2');
    assert.ok(v.warnings.some((w) => w.includes('非对象')), '应告警 null 元素');
    assert.ok(v.warnings.some((w) => w.includes('id/title')), '应告警缺 title');
    assert.ok(v.warnings.some((w) => w.includes('NOPE-9')), '应告警悬空 parent');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('removeFile 在非 ASCII 路径下真的删除（fs.rmSync 在此静默无效）', () => {
  // Node v24 (Windows) 下路径含非 ASCII 时 fs.rmSync 删文件不报错也不生效，
  // 而 vault 路径常含中文（docs/需求管理）——孤儿分片删不掉会让已删任务复活。
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpm-rm-'));
  const dir = path.join(base, '需求管理', 'tasks');
  fs.mkdirSync(dir, { recursive: true });
  try {
    for (const name of ['plain.json', '中文文件.json']) {
      const p = path.join(dir, name);
      fs.writeFileSync(p, '{}');
      removeFile(p);
      assert.equal(fs.existsSync(p), false, `removeFile 应真正删除 ${name}`);
    }
    // 不存在的文件按 ENOENT 静默通过
    removeFile(path.join(dir, '不存在.json'));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('syncVault 清理孤儿分片（中文路径下已删任务不得复活）', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'clawpm-orphan-'));
  const dir = path.join(base, '需求管理');
  fs.mkdirSync(dir, { recursive: true });
  try {
    const config = { format: VAULT_FORMAT, name: 't', workflow: DEFAULT_WORKFLOW };
    const empty = { config, domains: [], milestones: [], fields: [], links: [] };
    writeVault(dir, { ...empty, tasks: [{ id: 'T-1', title: '待删', status: 'backlog' }] });
    assert.ok(fs.existsSync(path.join(dir, 'tasks', '_inbox.json')), '任务应落盘');

    // 删光任务后落盘：孤儿分片必须消失，否则重启会把 T-1 读回来
    const res = syncVault(dir, { ...empty, tasks: [] });
    assert.deepEqual(res.removed, ['tasks/_inbox.json'], '应报告删除孤儿分片');
    assert.equal(
      fs.existsSync(path.join(dir, 'tasks', '_inbox.json')),
      false,
      '孤儿分片必须真的从磁盘消失（报告成功但文件还在 = 任务复活）'
    );
    assert.equal(loadVault(dir).tasks.length, 0, '重新加载不应出现已删任务');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

console.log(`✅ 全部 ${passed} 个测试通过`);
