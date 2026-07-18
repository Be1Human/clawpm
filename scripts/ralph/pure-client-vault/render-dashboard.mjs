#!/usr/bin/env node
/**
 * render-dashboard.mjs — Render an autonomous-loop progress dashboard from prd.json.
 *
 * This is the single piece that keeps the PRD and the dashboard in sync: the
 * dashboard is a *projection* of prd.json, never hand-edited. An agent finishing
 * a deliverable only flips one field in prd.json, then re-runs this script.
 *
 * Usage:
 *   node render-dashboard.mjs <prd.json> [output.html]
 *
 * If output.html is omitted, it is taken from prd.json `paths.dashboard`,
 * falling back to a sibling file `<project>-progress.html`.
 *
 * Zero dependencies — only Node's built-in fs/path. Safe to copy into any repo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DEFAULT_DELIVERABLES = [
  { key: 'requirements',   label: '①需求文档' },
  { key: 'design',         label: '②设计文档' },
  { key: 'diagram',        label: '③框架图' },
  { key: 'testCases',      label: '④测试用例' },
  { key: 'implementation', label: '⑤代码实现' },
  { key: 'testReport',     label: '⑥测试报告' },
];

function fail(msg) {
  console.error(`[render-dashboard] ${msg}`);
  process.exit(1);
}

const prdPath = process.argv[2];
if (!prdPath) fail('missing argument: path to prd.json');

let prd;
try {
  prd = JSON.parse(readFileSync(resolve(prdPath), 'utf8'));
} catch (e) {
  fail(`cannot read/parse ${prdPath}: ${e.message}`);
}

const stories = Array.isArray(prd.userStories) ? prd.userStories : [];
const deliverableTypes = Array.isArray(prd.deliverableTypes) && prd.deliverableTypes.length
  ? prd.deliverableTypes
  : DEFAULT_DELIVERABLES;

const outPath = resolve(
  process.argv[3] ||
  (prd.paths && prd.paths.dashboard) ||
  join(dirname(resolve(prdPath)), `${slug(prd.project || 'project')}-progress.html`)
);

function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-+|-+$/g, '');
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- status model -----------------------------------------------------------
// A deliverable status is one of: todo | wip | done.
// reviewStatus is one of: pending | approved | rejected | needs_revision.
function deliverableStatus(story, key) {
  const d = story.deliverables && story.deliverables[key];
  if (!d) return 'todo';
  const s = (typeof d === 'string' ? d : d.status) || 'todo';
  return ['todo', 'wip', 'done'].includes(s) ? s : 'todo';
}
function deliverablePath(story, key) {
  const d = story.deliverables && story.deliverables[key];
  return d && typeof d === 'object' ? d.path || '' : '';
}

const CELL = {
  done:           { mark: '✅', cls: 'c-done' },
  wip:            { mark: '🟡', cls: 'c-wip' },
  todo:           { mark: '·',  cls: 'c-todo' },
  approved:       { mark: '✅', cls: 'c-done' },
  pending:        { mark: '🕓', cls: 'c-wip' },
  needs_revision: { mark: '🔄', cls: 'c-wip' },
  rejected:       { mark: '✖',  cls: 'c-todo' },
};

// --- per-story rollup --------------------------------------------------------
let fullyDone = 0, inProgress = 0, notStarted = 0;
const total = stories.length;

const rows = stories
  .slice()
  .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
  .map((story) => {
    const states = deliverableTypes.map((t) => deliverableStatus(story, t.key));
    const doneCount = states.filter((s) => s === 'done').length;
    const allDone = doneCount === deliverableTypes.length;
    const anyProgress = doneCount > 0 || states.some((s) => s === 'wip');
    const rowCls = allDone ? 'done' : anyProgress ? 'partial' : 'todo';
    if (allDone) fullyDone++;
    else if (anyProgress) inProgress++;
    else notStarted++;
    return { story, states, doneCount, rowCls };
  });

const reviewApproved = stories.filter((s) => (s.reviewStatus || 'pending') === 'approved').length;
const pct = total ? Math.round((fullyDone / total) * 100) : 0;

// --- HTML --------------------------------------------------------------------
const reviewGated = stories.some((s) => 'reviewStatus' in s);

function deliverableCells(states) {
  return states.map((s) => {
    const c = CELL[s] || CELL.todo;
    return `<td class="cell ${c.cls}">${c.mark}</td>`;
  }).join('');
}
function reviewCell(story) {
  const s = story.reviewStatus || 'pending';
  const c = CELL[s] || CELL.pending;
  return `<td class="cell ${c.cls}" title="${esc(s)}">${c.mark}</td>`;
}

const matrixHeader = [
  reviewGated ? '<th class="rot">⓪评审</th>' : '',
  ...deliverableTypes.map((t) => `<th class="rot">${esc(t.label)}</th>`),
  '<th>完成度</th>',
].join('');

const matrixRows = rows.map(({ story, states, doneCount, rowCls }) => {
  const ratio = `${doneCount}/${deliverableTypes.length}`;
  const note = story.notes ? `<div class="note-line">${esc(story.notes)}</div>` : '';
  return `<tr class="${rowCls}">
    <td class="id">${esc(story.id)}</td>
    <td class="title">${esc(story.title)}${note}</td>
    ${reviewGated ? reviewCell(story) : ''}
    ${deliverableCells(states)}
    <td class="ratio">${ratio}</td>
  </tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${esc(prd.project || 'Project')} · 实施进度</title>
<style>
  :root {
    --bg:#f5efe0; --panel:#fbf6e9; --panel-2:#efe7d2; --border:#d9cdb0;
    --text:#3a342a; --muted:#8a7f6a;
    --done:#6a8e4e; --partial:#c47836; --todo:#b85c4a;
    --done-bg:#e6efd9; --partial-bg:#fbe9d0; --todo-bg:#fadbd5;
    --c-blue:#4a7a9c;
  }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { padding:28px; background:var(--bg); color:var(--text); line-height:1.55;
    font-size:14px; font-family:-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:1180px; margin:0 auto; }
  h1 { font-size:24px; color:var(--done); margin-bottom:4px; }
  .sub { color:var(--muted); font-size:13px; margin-bottom:4px; }
  .meta { color:var(--muted); font-size:12px; margin-bottom:20px; }
  .bar { height:14px; background:var(--panel-2); border:1px solid var(--border);
    border-radius:7px; overflow:hidden; margin:10px 0 22px; }
  .bar > div { height:100%; background:var(--done); width:${pct}%; transition:width .3s; }
  .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:24px; }
  .card { background:var(--panel); border:2px solid var(--border); border-radius:8px; padding:14px 16px; }
  .card .num { font-size:28px; font-weight:700; }
  .card .label { font-size:12px; color:var(--muted); margin-top:2px; }
  .card.total .num { color:var(--c-blue); } .card.total { border-color:var(--c-blue); background:#e0eaf1; }
  .card.done .num { color:var(--done); } .card.done { border-color:var(--done); background:var(--done-bg); }
  .card.partial .num { color:var(--partial); } .card.partial { border-color:var(--partial); background:var(--partial-bg); }
  .card.todo .num { color:var(--todo); } .card.todo { border-color:var(--todo); background:var(--todo-bg); }
  .section { background:var(--panel); border:1px solid var(--border); border-radius:10px;
    padding:22px; margin:16px 0; position:relative; }
  .section-title { position:absolute; top:-11px; left:16px; background:var(--bg);
    padding:0 10px; font-size:14px; font-weight:700; color:var(--c-blue); }
  table { width:100%; border-collapse:collapse; font-size:13px; margin-top:4px; }
  th, td { border:1px solid var(--border); padding:7px 9px; text-align:left; vertical-align:top; }
  th { background:var(--panel-2); font-weight:700; }
  th.rot { text-align:center; width:62px; font-size:12px; }
  tr.done td { background:var(--done-bg); }
  tr.partial td { background:var(--partial-bg); }
  tr.todo td { background:var(--todo-bg); }
  td.id { font-family:Consolas,monospace; font-size:12px; white-space:nowrap; }
  td.title { font-weight:600; }
  td.cell { text-align:center; font-size:14px; }
  td.cell.c-done { color:var(--done); }
  td.cell.c-wip  { color:var(--partial); }
  td.cell.c-todo { color:var(--muted); }
  td.ratio { text-align:center; font-family:Consolas,monospace; font-weight:700; white-space:nowrap; }
  .note-line { font-size:11px; color:var(--muted); font-weight:400; margin-top:3px; }
  .legend { font-size:12px; color:var(--muted); margin-top:10px; }
  .legend b { color:var(--text); }
</style>
</head>
<body>
<div class="wrap">
  <h1>${esc(prd.project || 'Project')} · 实施进度</h1>
  <p class="sub">${esc(prd.description || '')}</p>
  <div class="meta">分支 <b>${esc(prd.branchName || '-')}</b> · 自动生成于 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · 数据源 prd.json（请勿手工编辑本页）</div>
  <div class="bar"><div></div></div>

  <div class="summary-grid">
    <div class="card total"><div class="num">${fullyDone} / ${total}</div><div class="label">总进度 ${pct}%</div></div>
    <div class="card done"><div class="num">${fullyDone}</div><div class="label">✅ 全部交付物完成</div></div>
    <div class="card partial"><div class="num">${inProgress}</div><div class="label">🟡 进行中</div></div>
    <div class="card todo"><div class="num">${notStarted}</div><div class="label">⬜ 未开始</div></div>
  </div>

  <div class="section">
    <div class="section-title">完成度矩阵 · ${total} story × ${reviewGated ? '(1 评审 + ' : '('}${deliverableTypes.length} 交付物)</div>
    <table>
      <thead><tr><th style="width:90px">ID</th><th>Story</th>${matrixHeader}</tr></thead>
      <tbody>
${matrixRows}
      </tbody>
    </table>
    <div class="legend">
      <b>一个 story 算"完成"</b>：${reviewGated ? '评审通过 + ' : ''}${deliverableTypes.length} 项交付物全部 ✅。
      只写了代码 = ${deliverableTypes.length ? `1/${deliverableTypes.length}` : '部分'}，不算这格做完。
      ${reviewGated ? `<br>评审 gate：仅 <b>approved</b>（${reviewApproved}/${total}）的 story 允许实施，pending/rejected/needs_revision 一律跳过。` : ''}
    </div>
  </div>
</div>
</body>
</html>
`;

try {
  writeFileSync(outPath, html, 'utf8');
} catch (e) {
  fail(`cannot write ${outPath}: ${e.message}`);
}
console.log(`[render-dashboard] ${fullyDone}/${total} done (${pct}%) → ${outPath}`);
