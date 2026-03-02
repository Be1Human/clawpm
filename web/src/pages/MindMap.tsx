/**
 * 思维导图视图 v2
 * UX 规则：
 *  - 只有根节点（无父节点）可以自由拖拽；整个子树跟随
 *  - 非根节点位置由自动布局算法决定，不可独立拖拽
 *  - 快捷键：Tab=子节点 Enter=同级 Delete=删除 双击=改名
 *  - 节点可折叠（双击图标或右键）
 *  - 显示关联线（blocks/precedes/relates），可按类型开关
 *  - 右键菜单：添加关联、折叠/展开、删除、改父节点
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps, type EdgeProps,
  Handle, Position, Panel,
  BaseEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import CreateTaskModal from '@/components/CreateTaskModal';

// ── 布局常量 ──────────────────────────────────────────────────────
const NODE_W  = 190;
const NODE_H  = 68;
const H_GAP   = 76;
const V_GAP   = 10;
const ROOT_GAP = 52;

// ── 标签色系 ──────────────────────────────────────────────────────
const LABEL_COLORS: Record<string, { border: string; bg: string; pill: string; text: string }> = {
  epic:    { border: '#8b5cf6', bg: '#faf5ff', pill: '#ede9fe', text: '#7c3aed' },
  feature: { border: '#3b82f6', bg: '#eff6ff', pill: '#dbeafe', text: '#1d4ed8' },
  bug:     { border: '#ef4444', bg: '#fef2f2', pill: '#fee2e2', text: '#b91c1c' },
  spike:   { border: '#f97316', bg: '#fff7ed', pill: '#ffedd5', text: '#c2410c' },
  chore:   { border: '#64748b', bg: '#f8fafc', pill: '#f1f5f9', text: '#475569' },
};
const DEFAULT_COLORS = { border: '#94a3b8', bg: '#f8fafc', pill: '#f1f5f9', text: '#64748b' };

function getLabelColors(task: any) {
  const labels: string[] = (() => { try { return JSON.parse(task.labels ?? '[]'); } catch { return []; } })();
  const first = labels[0] || null;
  return { colors: LABEL_COLORS[first as string] ?? DEFAULT_COLORS, labels, firstLabel: first };
}

const STATUS_DOT: Record<string, string> = {
  backlog: '#94a3b8', planned: '#3b82f6', active: '#6366f1',
  review: '#d97706', done: '#10b981',
};

// ── 进度计算（简单：直接子节点 done 数 / 总数） ──────────────────
function calcProgress(node: any): number {
  const children = node.children ?? [];
  if (!children.length) return node.status === 'done' ? 100 : 0;
  const doneCount = children.filter((c: any) => c.status === 'done').length;
  return Math.round((doneCount / children.length) * 100);
}

// ── SVG 进度圆环 ─────────────────────────────────────────────────
function ProgressRing({ progress, size = 20 }: { progress: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = Math.PI * 2 * r;
  const filled = (progress / 100) * c;
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={2.5} />
      {progress > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={progress === 100 ? '#10b981' : '#6366f1'}
          strokeWidth={2.5}
          strokeDasharray={`${filled} ${c - filled}`}
          strokeDashoffset={c / 4}
          strokeLinecap="round"
        />
      )}
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={size <= 20 ? 6 : 7} fontWeight="700" fill="#6b7280">
        {progress}
      </text>
    </svg>
  );
}

// ── 关联线样式 ────────────────────────────────────────────────────
const LINK_STYLE: Record<string, { stroke: string; dash: string; label: string; arrow: boolean }> = {
  blocks:   { stroke: '#ef4444', dash: '6 3', label: '阻塞', arrow: true },
  precedes: { stroke: '#f97316', dash: '4 3', label: '顺序', arrow: true },
  relates:  { stroke: '#3b82f6', dash: '3 3', label: '关联', arrow: false },
};

// ── 布局算法 ──────────────────────────────────────────────────────
function subtreeH(node: any, collapsed: Set<string>): number {
  if (collapsed.has(node.taskId) || !node.children?.length) return NODE_H;
  const total = node.children.reduce((s: number, c: any, i: number) =>
    s + subtreeH(c, collapsed) + (i > 0 ? V_GAP : 0), 0);
  return Math.max(NODE_H, total);
}

function computeLayout(roots: any[], collapsed: Set<string>): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  function layout(node: any, depth: number, startY: number) {
    const children = collapsed.has(node.taskId) ? [] : (node.children ?? []);
    if (!children.length) {
      pos.set(node.taskId, { x: depth * (NODE_W + H_GAP), y: startY });
      return;
    }
    let cy = startY;
    for (const child of children) {
      layout(child, depth + 1, cy);
      cy += subtreeH(child, collapsed) + V_GAP;
    }
    const firstY = pos.get(children[0].taskId)!.y;
    const lastY  = pos.get(children[children.length - 1].taskId)!.y;
    pos.set(node.taskId, {
      x: depth * (NODE_W + H_GAP),
      y: (firstY + lastY + NODE_H) / 2 - NODE_H / 2,
    });
  }

  let rootY = 0;
  for (const root of roots) {
    layout(root, 0, rootY);
    rootY += subtreeH(root, collapsed) + ROOT_GAP;
  }
  return pos;
}

function getDescendants(nodeId: string, edges: Edge[]): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const e of edges) {
      if (e.source === cur && !result.has(e.target)) {
        result.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return result;
}

function nodeMatchesFilters(node: any, fieldFilters: Record<number, string>, fieldDefs: any[]): boolean {
  if (!Object.keys(fieldFilters).length) return true;
  const cf: Record<string, string> = node.customFields || {};
  for (const [fieldIdStr, filterVal] of Object.entries(fieldFilters)) {
    if (!filterVal) continue;
    const fieldId = Number(fieldIdStr);
    const fd = fieldDefs.find((f: any) => f.id === fieldId);
    if (!fd) continue;
    const fieldName = fd.name;
    const nodeVal = cf[fieldName] || '';
    const fieldType = fd.fieldType || fd.field_type;

    if (fieldType === 'select') {
      if (nodeVal !== filterVal) return false;
    } else if (fieldType === 'multi_select') {
      let selected: string[] = [];
      try { selected = JSON.parse(nodeVal || '[]'); } catch { if (nodeVal) selected = [nodeVal]; }
      if (!selected.includes(filterVal)) return false;
    } else if (fieldType === 'text') {
      if (!nodeVal.toLowerCase().includes(filterVal.toLowerCase())) return false;
    } else {
      if (nodeVal !== filterVal) return false;
    }
  }
  return true;
}

function hasVisibleDescendant(node: any, fieldFilters: Record<number, string>, fieldDefs: any[]): boolean {
  if (nodeMatchesFilters(node, fieldFilters, fieldDefs)) return true;
  for (const child of node.children ?? []) {
    if (hasVisibleDescendant(child, fieldFilters, fieldDefs)) return true;
  }
  return false;
}

function precomputeProgress(node: any): Map<string, number> {
  const map = new Map<string, number>();
  function walk(n: any) {
    map.set(n.taskId, calcProgress(n));
    for (const c of n.children ?? []) walk(c);
  }
  walk(node);
  return map;
}

function buildFlow(
  treeData: any[],
  positions: Map<string, { x: number; y: number }>,
  collapsed: Set<string>,
  callbacks: any,
  reqLinks: any[],
  linkVisibility: Record<string, boolean>,
  highlightDomains: string[],
  fieldFilters: Record<number, string> = {},
  fieldDefs: any[] = [],
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const hasFilters = Object.values(fieldFilters).some(v => !!v);

  const progressMap = new Map<string, number>();
  for (const root of treeData) {
    const pm = precomputeProgress(root);
    pm.forEach((v, k) => progressMap.set(k, v));
  }

  function walk(node: any, isRoot: boolean) {
    if (hasFilters && !hasVisibleDescendant(node, fieldFilters, fieldDefs)) return;

    const progress = progressMap.get(node.taskId) ?? calcProgress(node);
    nodes.push({
      id: node.taskId,
      type: 'taskNode',
      position: positions.get(node.taskId) ?? { x: 0, y: 0 },
      draggable: isRoot,
      selectable: true,
      data: { task: node, isRoot, isCollapsed: collapsed.has(node.taskId), progress, highlightDomains, ...callbacks },
    });
    if (!collapsed.has(node.taskId)) {
      for (const child of node.children ?? []) {
        if (hasFilters && !hasVisibleDescendant(child, fieldFilters, fieldDefs)) continue;
        edges.push({
          id: `tree:${node.taskId}→${child.taskId}`,
          source: node.taskId,
          target: child.taskId,
          type: 'treeEdge',
          data: {},
        });
        walk(child, false);
      }
    }
  }
  treeData.forEach(root => walk(root, true));

  // 关联线
  for (const link of reqLinks) {
    const ltype = link.linkType as string;
    if (!linkVisibility[ltype]) continue;
    const style = LINK_STYLE[ltype] || LINK_STYLE.relates;
    edges.push({
      id: `link:${link.id}`,
      source: link.sourceTaskStrId,
      target: link.targetTaskStrId,
      type: 'assocEdge',
      data: { linkType: ltype, linkId: link.id, style, onDeleteLink: callbacks.onDeleteLink },
      markerEnd: style.arrow ? { type: 'arrow' as any, color: style.stroke } : undefined,
    });
  }

  return { nodes, edges };
}

// ── 自定义树形边 ────────────────────────────────────────────────
function TreeEdge({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const dx = (targetX - sourceX) * 0.55;
  const d = `M ${sourceX},${sourceY} C ${sourceX + dx},${sourceY} ${targetX - dx},${targetY} ${targetX},${targetY}`;
  return <path d={d} fill="none" stroke="#d1d5db" strokeWidth={1.5} />;
}

// ── 自定义关联边 ────────────────────────────────────────────────
function AssocEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps) {
  const s = (data as any)?.style || LINK_STYLE.relates;
  const dx = (targetX - sourceX) * 0.4;
  const d = `M ${sourceX},${sourceY} C ${sourceX + dx},${sourceY} ${targetX - dx},${targetY} ${targetX},${targetY}`;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2 - 10;

  return (
    <g>
      <path d={d} fill="none" stroke={s.stroke} strokeWidth={1.5} strokeDasharray={s.dash} opacity={0.7} />
      <text x={midX} y={midY} textAnchor="middle" fontSize={9} fill={s.stroke} fontWeight="600" opacity={0.8}>
        {s.label}
      </text>
    </g>
  );
}

// ── 右键菜单 ─────────────────────────────────────────────────────
function ContextMenu({
  x, y, task, onClose, onAddChild, onAddSibling, onDelete, onToggleCollapse, isCollapsed, hasChildren,
  onAddLink,
}: any) {
  return (
    <div
      className="fixed z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[160px] text-sm"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <button onClick={() => { onAddChild(task.taskId); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
        ＋ 添加子节点
      </button>
      {task.parentTaskId && (
        <button onClick={() => { onAddSibling(task); onClose(); }}
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
          ＋ 添加同级
        </button>
      )}
      {hasChildren && (
        <button onClick={() => { onToggleCollapse(task.taskId); onClose(); }}
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
          {isCollapsed ? '展开子树' : '折叠子树'}
        </button>
      )}
      <div className="my-1 border-t border-gray-100" />
      <button onClick={() => { onAddLink(task.taskId); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-indigo-600">
        🔗 添加关联
      </button>
      <div className="my-1 border-t border-gray-100" />
      <button onClick={() => { onDelete(task.taskId, task.title); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-500">
        🗑 删除
      </button>
    </div>
  );
}

// ── 添加关联弹窗 ──────────────────────────────────────────────────
function AddLinkModal({ sourceTaskId, onClose, onConfirm }: { sourceTaskId: string; onClose: () => void; onConfirm: (target: string, type: string) => void }) {
  const [target, setTarget] = useState('');
  const [type, setType] = useState('relates');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-4">添加关联</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">目标节点 ID</label>
            <input value={target} onChange={e => setTarget(e.target.value)}
              placeholder="如 U-001"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">关联类型</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="relates">弱关联（互相有关系，无依赖）</option>
              <option value="precedes">顺序依赖（先做源节点，再做目标）</option>
              <option value="blocks">阻塞依赖（源节点阻塞目标节点）</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={() => { if (target.trim()) onConfirm(target.trim(), type); }}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">确认</button>
        </div>
      </div>
    </div>
  );
}

// ── 自定义节点 ────────────────────────────────────────────────────
function TaskNode({ data, selected }: NodeProps) {
  const task = (data as any).task;
  const { colors, labels, firstLabel } = getLabelColors(task);
  const isRoot = (data as any).isRoot;
  const isCollapsed = (data as any).isCollapsed;
  const progress: number = (data as any).progress;
  const hasChildren = (task.children ?? []).length > 0;
  const domain = task.domain as { id: number; name: string; color: string } | null;
  const highlightDomains: string[] = (data as any).highlightDomains ?? [];
  const isHighlighted = highlightDomains.length > 0 && !!domain && highlightDomains.includes(domain.name);
  const hlColor = isHighlighted ? domain!.color : null;

  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commitEdit() {
    setEditing(false);
    const v = editVal.trim();
    if (v && v !== task.title) (data as any).onRename(task.taskId, v);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    (data as any).onContextMenu(e.clientX, e.clientY, task);
  }

  const boxShadow = (() => {
    const base = selected ? `0 0 0 3px ${colors.border}28, 0 4px 12px rgba(0,0,0,0.1)` : '0 1px 4px rgba(0,0,0,0.06)';
    if (isHighlighted) return `${base}, 0 0 14px 3px ${hlColor}35`;
    return base;
  })();

  const borderColor = (() => {
    if (selected) return colors.border;
    if (isHighlighted) return `${hlColor}90`;
    return '#e2e8f0';
  })();

  const bgColor = (() => {
    if (isHighlighted) return `${hlColor}08`;
    if (selected) return colors.bg;
    return '#fff';
  })();

  return (
    <div
      className="relative rounded-xl select-none"
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        border: `2px solid ${borderColor}`,
        boxShadow,
        backgroundColor: bgColor,
        transition: 'box-shadow 0.3s, border-color 0.3s, background-color 0.3s',
      }}
      onDoubleClick={() => { setEditVal(task.title); setEditing(true); }}
      onContextMenu={handleContextMenu}
    >
      {/* 左侧色条 */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: isHighlighted ? hlColor! : colors.border }} />

      {/* 根节点拖拽把手 */}
      {isRoot && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing opacity-30 hover:opacity-70" title="拖拽整个子树">
          {[0, 1, 2].map(i => <div key={i} className="w-1 h-1 bg-gray-400 rounded-full" />)}
        </div>
      )}

      <div className="pl-5 pr-8 pt-2.5 pb-2.5">
        {/* 标签 */}
        {firstLabel && (
          <span className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full mb-1.5"
            style={{ backgroundColor: colors.pill, color: colors.text }}>
            {firstLabel}{labels.length > 1 ? ` +${labels.length - 1}` : ''}
          </span>
        )}

        {/* 标题 */}
        {editing ? (
          <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { setEditing(false); setEditVal(task.title); }
            }}
            className="w-full text-[13px] font-semibold text-gray-800 bg-transparent border-b border-indigo-300 outline-none pb-0.5" />
        ) : (
          <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{task.title}</p>
        )}

        {/* 底部 meta */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] font-mono text-gray-400">{task.taskId}</span>
          <div className="flex items-center gap-1.5">
            {task.owner && <span className="text-[10px] text-gray-400 truncate max-w-[60px]">{task.owner}</span>}
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_DOT[task.status] ?? '#cbd5e1' }} title={task.status} />
          </div>
        </div>
      </div>

      {/* 进度圆环（右下角） */}
      <div className="absolute right-1.5 bottom-1.5">
        <ProgressRing progress={progress} size={20} />
      </div>

      {/* 右侧：有子节点时显示展开/收缩，否则不显示 */}
      {hasChildren && (
        <button
          className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 flex items-center justify-center text-[10px] shadow-sm z-10 transition-colors"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); (data as any).onToggleCollapse(task.taskId); }}
          title={isCollapsed ? '展开' : '折叠'}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
      )}

      {/* 选中时显示的操作按钮 */}
      {selected && (
        <>
          {/* 右侧添加子节点 */}
          <button
            className="absolute -right-3.5 -bottom-3.5 w-6 h-6 rounded-full bg-indigo-500 border-2 border-white text-white hover:bg-indigo-600 flex items-center justify-center text-sm shadow-md z-20 transition-colors"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); (data as any).onAddChild(task.taskId); }}
            title="添加子节点 (Tab)"
          >
            +
          </button>
          {/* 下方添加同级 */}
          {!isRoot && (
            <button
              className="absolute left-1/2 -translate-x-1/2 -bottom-3.5 w-6 h-6 rounded-full bg-white border-2 border-indigo-400 text-indigo-500 hover:bg-indigo-50 flex items-center justify-center text-sm shadow-md z-20 transition-colors"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); (data as any).onAddSibling(task); }}
              title="添加同级 (Enter)"
            >
              +
            </button>
          )}
        </>
      )}

      {/* 子节点计数气泡（折叠时显示） */}
      {isCollapsed && hasChildren && (
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 rounded-full text-white"
          style={{ backgroundColor: colors.border }}
        >
          {task.children.length}
        </div>
      )}

      <Handle type="target" position={Position.Left}  style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}

const NODE_TYPES = { taskNode: TaskNode };
const EDGE_TYPES = { treeEdge: TreeEdge, assocEdge: AssocEdge };

// ── localStorage 持久化 ──────────────────────────────────────────
const STORAGE_KEY = 'clawpm-mindmap';

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function saveState(key: string, value: any) {
  try { localStorage.setItem(`${STORAGE_KEY}-${key}`, JSON.stringify(value)); } catch {}
}

// ── 主画布 ─────────────────────────────────────────────────────────
function MindMapCanvas() {
  const qc = useQueryClient();
  const [activeDomain, setActiveDomain] = useState(() => loadState('activeDomain', ''));

  const { data: domainList = [] } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.getDomains(),
  });

  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.getCustomFields(),
  });

  const { data: treeData = [] } = useQuery({
    queryKey: ['task-tree', activeDomain],
    queryFn: () => api.getTaskTree(activeDomain ? { domain: activeDomain } : undefined),
  });

  const { data: reqLinks = [] } = useQuery({
    queryKey: ['req-links'],
    queryFn: () => api.getReqLinks(),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadState('selectedId', null));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(loadState<string[]>('collapsed', [])));
  const [createModal, setCreateModal] = useState<{ parentId?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; title: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: any } | null>(null);
  const [addLinkModal, setAddLinkModal] = useState<{ sourceId: string } | null>(null);
  const [linkVisibility, setLinkVisibility] = useState<Record<string, boolean>>(() =>
    loadState('linkVisibility', { blocks: true, precedes: true, relates: false })
  );
  const [highlightDomains, setHighlightDomains] = useState<Set<string>>(() => new Set(loadState<string[]>('highlightDomains', [])));
  const [fieldFilters, setFieldFilters] = useState<Record<number, string>>(() => loadState('fieldFilters', {}));

  // 持久化状态到 localStorage
  useEffect(() => { saveState('activeDomain', activeDomain); }, [activeDomain]);
  useEffect(() => { saveState('collapsed', [...collapsed]); }, [collapsed]);
  useEffect(() => { saveState('linkVisibility', linkVisibility); }, [linkVisibility]);
  useEffect(() => { saveState('highlightDomains', [...highlightDomains]); }, [highlightDomains]);
  useEffect(() => { saveState('fieldFilters', fieldFilters); }, [fieldFilters]);
  useEffect(() => { saveState('selectedId', selectedId); }, [selectedId]);

  const dragSnap = useRef(new Map<string, { x: number; y: number }>());
  const edgesRef = useRef<Edge[]>([]);
  const nodeDataMap = useRef(new Map<string, any>());

  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const callbacks = useMemo(() => ({
    onAddChild: (parentId: string) => setCreateModal({ parentId }),
    onAddSibling: (task: any) => {
      const curEdges = edgesRef.current;
      const parentEdge = curEdges.find(ed => ed.target === task.taskId && ed.type === 'treeEdge');
      setCreateModal(parentEdge ? { parentId: parentEdge.source } : {});
    },
    onRename: (taskId: string, title: string) => renameMut.mutate({ taskId, title }),
    onDelete: (taskId: string, title: string) => setDeleteConfirm({ taskId, title }),
    onToggleCollapse: (taskId: string) => setCollapsed(prev => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    }),
    onContextMenu: (x: number, y: number, task: any) => setContextMenu({ x, y, task }),
    onDeleteLink: (linkId: number) => deleteLinkMut.mutate(linkId),
  }), []);

  const renameMut = useMutation({
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) => api.updateTask(taskId, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-tree'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(taskId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-tree'] }); setDeleteConfirm(null); },
  });

  const addLinkMut = useMutation({
    mutationFn: ({ source, target, type }: { source: string; target: string; type: string }) =>
      api.createReqLink(source, target, type),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['req-links'] }); setAddLinkModal(null); },
    onError: (e: any) => alert(e.message || '创建关联失败'),
  });

  const deleteLinkMut = useMutation({
    mutationFn: (linkId: number) => api.deleteReqLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['req-links'] }),
  });

  // 重建图
  useEffect(() => {
    if (!(treeData as any[]).length) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const positions = computeLayout(treeData as any[], collapsed);
    const hlArr = [...highlightDomains];
    const { nodes: ns, edges: es } = buildFlow(
      treeData as any[], positions, collapsed, callbacks,
      reqLinks as any[], linkVisibility, hlArr,
      fieldFilters, customFieldDefs as any[],
    );
    nodeDataMap.current.clear();
    ns.forEach(n => nodeDataMap.current.set(n.id, (n.data as any).task));
    setNodes(ns);
    setEdges(es);
  }, [treeData, collapsed, reqLinks, linkVisibility, highlightDomains, fieldFilters, customFieldDefs]);

  // 拖拽：父节点移，子树跟随
  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    const snap = new Map<string, { x: number; y: number }>();
    setNodes(curr => { curr.forEach(n => snap.set(n.id, { ...n.position })); return curr; });
    dragSnap.current = snap;
  }, []);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    const start = dragSnap.current.get(node.id);
    if (!start) return;
    const dx = node.position.x - start.x;
    const dy = node.position.y - start.y;
    if (!dx && !dy) return;
    const descendants = getDescendants(node.id, edgesRef.current);
    if (!descendants.size) return;
    setNodes(prev => prev.map(n => {
      if (n.id === node.id) return n;
      if (descendants.has(n.id)) {
        const ns = dragSnap.current.get(n.id);
        if (!ns) return n;
        return { ...n, position: { x: ns.x + dx, y: ns.y + dy } };
      }
      return n;
    }));
  }, []);

  // 键盘快捷键
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        setCreateModal({ parentId: selectedId });
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const parentEdge = edgesRef.current.find(ed => ed.target === selectedId && ed.type === 'treeEdge');
        setCreateModal(parentEdge ? { parentId: parentEdge.source } : {});
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const task = nodeDataMap.current.get(selectedId);
        if (task) setDeleteConfirm({ taskId: selectedId, title: task.title });
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedId]);

  return (
    <div className="w-full h-full relative" onClick={() => setContextMenu(null)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onSelectionChange={({ nodes: sel }) => setSelectedId(sel.length === 1 ? sel[0].id : null)}
        deleteKeyCode={null}
        defaultViewport={loadState('viewport', undefined)}
        fitView={!loadState('viewport', null)}
        fitViewOptions={{ padding: 0.2 }}
        onMoveEnd={(_e, vp) => saveState('viewport', vp)}
        style={{ backgroundColor: '#f0f2f5' }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#dde1e7" gap={24} />
        <Controls className="!bg-white !border-gray-200 !rounded-xl !shadow-sm" />
        <MiniMap
          nodeColor={n => {
            const task = nodeDataMap.current.get(n.id);
            if (!task) return '#94a3b8';
            const { colors } = getLabelColors(task);
            return colors.border;
          }}
          className="!bg-white !border-gray-200 !rounded-xl !shadow-sm"
        />

        {/* 右侧控制面板 */}
        <Panel position="top-right">
          <div className="flex flex-col gap-2">
            {/* 关联线可见性 */}
            <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">显示关联线</p>
              {Object.entries(LINK_STYLE).map(([key, s]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer mb-1.5">
                  <input
                    type="checkbox"
                    checked={linkVisibility[key] ?? false}
                    onChange={ev => setLinkVisibility(prev => ({ ...prev, [key]: ev.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-xs font-medium" style={{ color: s.stroke }}>{s.label}</span>
                  <span className="text-[10px] text-gray-400">
                    {key === 'blocks' ? '（阻塞依赖）' : key === 'precedes' ? '（顺序依赖）' : '（弱关联）'}
                  </span>
                </label>
              ))}
            </div>

            {/* 板块高亮 */}
            {activeDomain === '' && (domainList as any[]).length > 0 && (
              <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">板块高亮</p>
                <div className="flex flex-wrap gap-1.5">
                  {(domainList as any[]).map((d: any) => {
                    const active = highlightDomains.has(d.name);
                    return (
                      <button
                        key={d.id}
                        onClick={() => setHighlightDomains(prev => {
                          const next = new Set(prev);
                          next.has(d.name) ? next.delete(d.name) : next.add(d.name);
                          return next;
                        })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={active
                          ? { backgroundColor: `${d.color}18`, color: d.color, boxShadow: `0 0 8px 2px ${d.color}30, inset 0 0 0 1.5px ${d.color}50` }
                          : { color: '#6b7280' }
                        }
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-shadow"
                          style={{
                            backgroundColor: d.color,
                            boxShadow: active ? `0 0 6px 2px ${d.color}50` : 'none',
                          }}
                        />
                        {d.taskPrefix || d.task_prefix}
                      </button>
                    );
                  })}
                  {highlightDomains.size > 0 && (
                    <button
                      onClick={() => setHighlightDomains(new Set())}
                      className="px-2 py-1.5 rounded-lg text-[10px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 自定义字段筛选 */}
            {(customFieldDefs as any[]).length > 0 && (
              <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500">字段筛选</p>
                  {Object.values(fieldFilters).some(v => !!v) && (
                    <button
                      onClick={() => setFieldFilters({})}
                      className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      清除全部
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {(customFieldDefs as any[]).map((fd: any) => {
                    const fieldType = fd.fieldType || fd.field_type;
                    const options: string[] = typeof fd.options === 'string' ? JSON.parse(fd.options || '[]') : (fd.options || []);
                    const currentFilter = fieldFilters[fd.id] || '';

                    return (
                      <div key={fd.id}>
                        <label className="text-[11px] text-gray-500 mb-0.5 block">{fd.name}</label>
                        {fieldType === 'select' ? (
                          <select
                            value={currentFilter}
                            onChange={e => setFieldFilters(prev => ({ ...prev, [fd.id]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                          >
                            <option value="">全部</option>
                            {options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : fieldType === 'multi_select' ? (
                          <div className="flex flex-wrap gap-1">
                            {options.map(o => {
                              const isOn = currentFilter === o;
                              return (
                                <button
                                  key={o}
                                  onClick={() => setFieldFilters(prev => ({ ...prev, [fd.id]: isOn ? '' : o }))}
                                  className={cn('text-[10px] px-1.5 py-0.5 rounded-full border transition-all',
                                    isOn ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100 hover:text-gray-600')}
                                >
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        ) : fieldType === 'date' ? (
                          <input
                            type="date"
                            value={currentFilter}
                            onChange={e => setFieldFilters(prev => ({ ...prev, [fd.id]: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                          />
                        ) : fieldType === 'number' ? (
                          <input
                            type="number"
                            value={currentFilter}
                            onChange={e => setFieldFilters(prev => ({ ...prev, [fd.id]: e.target.value }))}
                            placeholder="输入数值"
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                          />
                        ) : (
                          <input
                            type="text"
                            value={currentFilter}
                            onChange={e => setFieldFilters(prev => ({ ...prev, [fd.id]: e.target.value }))}
                            placeholder="搜索..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* 域页签 + 新建按钮 */}
        <Panel position="top-left">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm p-1 gap-0.5">
              <button
                onClick={() => setActiveDomain('')}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  activeDomain === '' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100')}
              >
                全部
              </button>
              {(domainList as any[]).map((d: any) => (
                <button
                  key={d.id}
                  onClick={() => setActiveDomain(d.name)}
                  className={cn('flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    activeDomain === d.name ? 'text-white' : 'text-gray-600 hover:bg-gray-100')}
                  style={activeDomain === d.name ? { backgroundColor: d.color } : undefined}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: activeDomain === d.name ? '#fff' : d.color }} />
                  {d.taskPrefix || d.task_prefix}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCreateModal({})}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
            >
              + 新建根节点
            </button>
          </div>
        </Panel>

        {/* 快捷键提示 */}
        <Panel position="bottom-center">
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur border border-gray-200 px-4 py-2 rounded-full shadow-sm text-xs text-gray-500">
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Tab</kbd> 添加子节点</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Enter</kbd> 添加同级</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Del</kbd> 删除</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">双击</kbd> 改名</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">右键</kbd> 更多操作</span>
          </div>
        </Panel>
      </ReactFlow>

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} task={contextMenu.task}
          isCollapsed={collapsed.has(contextMenu.task.taskId)}
          hasChildren={(contextMenu.task.children ?? []).length > 0}
          onClose={() => setContextMenu(null)}
          onAddChild={(id: string) => setCreateModal({ parentId: id })}
          onAddSibling={(task: any) => {
            const parentEdge = edgesRef.current.find(ed => ed.target === task.taskId && ed.type === 'treeEdge');
            setCreateModal(parentEdge ? { parentId: parentEdge.source } : {});
          }}
          onToggleCollapse={callbacks.onToggleCollapse}
          onDelete={(taskId: string, title: string) => setDeleteConfirm({ taskId, title })}
          onAddLink={(id: string) => setAddLinkModal({ sourceId: id })}
        />
      )}

      {/* 创建节点弹窗 */}
      {createModal !== null && (
        <CreateTaskModal
          defaultParentId={createModal.parentId}
          onClose={() => {
            setCreateModal(null);
            qc.invalidateQueries({ queryKey: ['task-tree'] });
          }}
        />
      )}

      {/* 添加关联弹窗 */}
      {addLinkModal && (
        <AddLinkModal
          sourceTaskId={addLinkModal.sourceId}
          onClose={() => setAddLinkModal(null)}
          onConfirm={(target, type) => addLinkMut.mutate({ source: addLinkModal.sourceId, target, type })}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">
              将删除 <span className="font-medium text-gray-800">「{deleteConfirm.title}」</span> 及其所有子节点。
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.taskId)}
                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg"
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? '处理中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MindMap() {
  return (
    <div className="h-full">
      <ReactFlowProvider>
        <MindMapCanvas />
      </ReactFlowProvider>
    </div>
  );
}
