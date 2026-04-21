/**
 * 思维导图视图 v3
 * UX 规则：
 *  - 所有节点均可拖拽：拖到另一节点上松手 → 变为其子节点；拖到空白 → 变为根节点
 *  - 拖拽过程中目标节点高亮显示放置提示
 *  - 快捷键：Tab=子节点 Enter=同级 Delete=删除 双击=详情
 *  - 节点可折叠（双击图标或右键）
 *  - 显示关联线（blocks/precedes/relates），可按类型开关
 *  - 右键菜单：添加关联、折叠/展开、删除、改父节点、变为根节点
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Node, type Edge, type NodeProps, type EdgeProps,
  Handle, Position, Panel,
  BaseEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';


import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { useActiveProject } from '@/lib/useActiveProject';
import CreateTaskModal from '@/components/CreateTaskModal';
import TaskDetail from '@/pages/TaskDetail';

// ── 布局常量 ──────────────────────────────────────────────────────
const NODE_W  = 280;
const NODE_H  = 64;
const H_GAP   = 60;
const V_GAP   = 10;
const ROOT_GAP = 28;
const PROJECT_NODE_W = 140;
const PROJECT_NODE_H = 48;
const PROJECT_NODE_ID = '__project_root__';

// ── 标签色系 ──────────────────────────────────────────────────────
const LABEL_COLORS: Record<string, { border: string; bg: string; pill: string; text: string }> = {
  epic:    { border: '#8b5cf6', bg: '#faf5ff', pill: '#ede9fe', text: '#7c3aed' },
  feature: { border: '#3b82f6', bg: '#eff6ff', pill: '#dbeafe', text: '#1d4ed8' },
  bug:     { border: '#ef4444', bg: '#fef2f2', pill: '#fee2e2', text: '#b91c1c' },
  spike:   { border: '#f97316', bg: '#fff7ed', pill: '#ffedd5', text: '#c2410c' },
  chore:   { border: '#64748b', bg: '#f8fafc', pill: '#f1f5f9', text: '#475569' },
};
const DEFAULT_COLORS = { border: '#94a3b8', bg: '#f8fafc', pill: '#f1f5f9', text: '#64748b' };

// ── 节点样式个性化（v2.3）─────────────────────────────────────────
interface NodeStyle {
  bgColor?: string;
  borderColor?: string;
  textColor?: string;
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  emoji?: string;
}

const PRESET_BG_COLORS = [
  '', '#ffffff', '#fef3c7', '#dcfce7', '#dbeafe', '#ede9fe',
  '#fce7f3', '#fee2e2', '#ffedd5', '#f0fdf4', '#f0f9ff',
  '#fdf4ff', '#fef9c3', '#ecfccb', '#ccfbf1', '#e0e7ff',
];
const PRESET_BORDER_COLORS = [
  '', '#e2e8f0', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#ef4444', '#f97316', '#14b8a6', '#6366f1',
  '#d946ef', '#84cc16', '#06b6d4', '#f43f5e', '#a855f7',
];
const PRESET_EMOJIS = ['', '🎯', '🔥', '💡', '⭐', '🚀', '🎨', '🔧', '📌', '💎', '🏆', '✅', '⚡', '🧩', '📦', '🛡️'];

// ── 分组框（GroupBox）──────────────────────────────────────────────
interface GroupBox {
  id: string;
  label: string;
  color: string;           // 主题色
  x: number;
  y: number;
  width: number;
  height: number;
}

const GROUP_BOX_COLORS = [
  { value: '#6366f1', label: '靛蓝' },
  { value: '#8b5cf6', label: '紫色' },
  { value: '#ec4899', label: '粉色' },
  { value: '#ef4444', label: '红色' },
  { value: '#f97316', label: '橙色' },
  { value: '#eab308', label: '黄色' },
  { value: '#22c55e', label: '绿色' },
  { value: '#14b8a6', label: '青色' },
  { value: '#3b82f6', label: '蓝色' },
  { value: '#64748b', label: '灰色' },
];
const GROUP_BOX_MIN_W = 200;
const GROUP_BOX_MIN_H = 120;

let _groupBoxSeq = Date.now();
function nextGroupBoxId() { return `gb_${_groupBoxSeq++}`; }

function getLabelColors(task: any) {
  const labels: string[] = (() => { try { return JSON.parse(task.labels ?? '[]'); } catch { return []; } })();
  const first = labels[0] || null;
  return { colors: LABEL_COLORS[first as string] ?? DEFAULT_COLORS, labels, firstLabel: first };
}

const STATUS_DOT: Record<string, string> = {
  backlog: '#94a3b8', planned: '#3b82f6', active: '#6366f1',
  review: '#d97706', done: '#10b981',
};
const STATUS_LABEL_CN: Record<string, string> = {
  backlog: '未排期', planned: '未开始', active: '进行中',
  review: '验收中', done: '已完成',
};

// ── 节点贴纸（Sticker）配置 ──────────────────────────────────────
// 优先级贴纸 — 左上角小旗标
const PRIORITY_STICKER: Record<string, { emoji: string; color: string; bg: string; label: string } | null> = {
  P0: { emoji: '🔥', color: '#dc2626', bg: '#fef2f2', label: '紧急' },
  P1: { emoji: '🟠', color: '#ea580c', bg: '#fff7ed', label: '重要' },
  P2: null, // 默认优先级不显示
  P3: { emoji: '🌿', color: '#16a34a', bg: '#f0fdf4', label: '低优' },
};

// 截止时间贴纸工具函数
function getDueDateSticker(dueDate: string | null | undefined) {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / 86400000);

  // 格式化日期：M月D日
  const month = due.getMonth() + 1;
  const day = due.getDate();
  const dateStr = `${month}月${day}日`;

  if (diffDays < 0) {
    // 已过期
    const overDays = Math.abs(diffDays);
    return {
      emoji: '💥',
      text: `${dateStr}`,
      sub: `超期${overDays}天`,
      color: '#dc2626',
      bg: 'linear-gradient(135deg, #fef2f2, #fee2e2)',
      border: '#fca5a5',
      urgent: 'overdue' as const,
    };
  } else if (diffDays === 0) {
    return {
      emoji: '⏰',
      text: `${dateStr}`,
      sub: '今天到期',
      color: '#ea580c',
      bg: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
      border: '#fdba74',
      urgent: 'today' as const,
    };
  } else if (diffDays <= 3) {
    return {
      emoji: '⚡',
      text: `${dateStr}`,
      sub: `剩${diffDays}天`,
      color: '#d97706',
      bg: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
      border: '#fcd34d',
      urgent: 'soon' as const,
    };
  } else if (diffDays <= 7) {
    return {
      emoji: '📅',
      text: `${dateStr}`,
      sub: `剩${diffDays}天`,
      color: '#2563eb',
      bg: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
      border: '#93c5fd',
      urgent: 'normal' as const,
    };
  } else {
    return {
      emoji: '🗓️',
      text: `${dateStr}`,
      sub: `剩${diffDays}天`,
      color: '#64748b',
      bg: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
      border: '#cbd5e1',
      urgent: 'far' as const,
    };
  }
}

// 标签颜色池（彩虹色，可爱柔和）
const TAG_COLORS = [
  { bg: '#fce7f3', color: '#be185d', border: '#f9a8d4' },  // 粉
  { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' },  // 紫
  { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },  // 蓝
  { bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' },  // 青
  { bg: '#dcfce7', color: '#15803d', border: '#86efac' },  // 绿
  { bg: '#fef9c3', color: '#a16207', border: '#fde047' },  // 黄
  { bg: '#ffedd5', color: '#c2410c', border: '#fdba74' },  // 橙
  { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },  // 红
];
function getTagColor(idx: number) { return TAG_COLORS[idx % TAG_COLORS.length]; }

// 节点贴纸可见性配置（可扩展）
interface StickerVisibility {
  showDueDate: boolean;
  showPriority: boolean;
  showTags: boolean;
  showOwner: boolean;
  showStartDate: boolean;
}

// ── 进度计算 ─────────────────────────────────────────────────────
// 优先使用节点自身的 progress 字段（由后端 API 维护），
// 对于有子节点且自身 progress 为 0 的父节点，回退到按子节点完成数计算。
function calcProgress(node: any): number {
  // 叶子节点：直接使用 API 返回的 progress 值
  const children = node.children ?? [];
  if (!children.length) {
    if (typeof node.progress === 'number' && node.progress > 0) return node.progress;
    return node.status === 'done' ? 100 : 0;
  }
  // 父节点：如果自身有手动设置的 progress，优先使用
  if (typeof node.progress === 'number' && node.progress > 0) return node.progress;
  // 否则根据子节点状态自动计算
  const doneCount = children.filter((c: any) => c.status === 'done').length;
  return Math.round((doneCount / children.length) * 100);
}

// ── SVG 进度圆环 ─────────────────────────────────────────────────
function ProgressRing({ progress, size = 24 }: { progress: number; size?: number }) {
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
        fontSize={size <= 20 ? 6 : 8.5} fontWeight="700" fill="#6b7280">
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
type VisibilityFn = (node: any) => boolean;
const ALWAYS_VISIBLE: VisibilityFn = () => true;

// 获取可见的子节点列表
function visibleChildren(node: any, collapsed: Set<string>, isVisible: VisibilityFn): any[] {
  if (collapsed.has(node.taskId) || !node.children?.length) return [];
  return node.children.filter((c: any) => isVisible(c));
}

// 计算节点上方需要的空间（从节点中心到子树顶边）
function extentAbove(node: any, collapsed: Set<string>, isVisible: VisibilityFn = ALWAYS_VISIBLE): number {
  const children = visibleChildren(node, collapsed, isVisible);
  if (!children.length) return NODE_H / 2;
  const gaps = (children.length - 1) * V_GAP;
  const childHeights = children.map((c: any) => extentAbove(c, collapsed, isVisible) + extentBelow(c, collapsed, isVisible));
  const totalChildrenH = childHeights.reduce((a: number, b: number) => a + b, 0) + gaps;
  return Math.max(NODE_H / 2, totalChildrenH / 2);
}

function extentBelow(node: any, collapsed: Set<string>, isVisible: VisibilityFn = ALWAYS_VISIBLE): number {
  const children = visibleChildren(node, collapsed, isVisible);
  if (!children.length) return NODE_H / 2;
  const gaps = (children.length - 1) * V_GAP;
  const childHeights = children.map((c: any) => extentAbove(c, collapsed, isVisible) + extentBelow(c, collapsed, isVisible));
  const totalChildrenH = childHeights.reduce((a: number, b: number) => a + b, 0) + gaps;
  return Math.max(NODE_H / 2, totalChildrenH / 2);
}

// 整个子树的外接高度
function subtreeH(node: any, collapsed: Set<string>, isVisible: VisibilityFn = ALWAYS_VISIBLE): number {
  return extentAbove(node, collapsed, isVisible) + extentBelow(node, collapsed, isVisible);
}

function computeLayout(
  roots: any[],
  collapsed: Set<string>,
  isVisible: VisibilityFn = ALWAYS_VISIBLE,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  // 以节点中心坐标 (centerY) 为基准进行布局
  function layout(node: any, depth: number, centerY: number) {
    const children = visibleChildren(node, collapsed, isVisible);

    // 放置当前节点（y 为左上角 = centerY - NODE_H/2）
    pos.set(node.taskId, {
      x: depth * (NODE_W + H_GAP),
      y: centerY - NODE_H / 2,
    });

    if (!children.length) return;

    // 计算子节点的中心点位置：
    // 所有子节点中心均匀排列，整体居中于 parentCenterY
    const childExtents = children.map((c: any) => ({
      above: extentAbove(c, collapsed, isVisible),
      below: extentBelow(c, collapsed, isVisible),
    }));

    // 总高度 = sum(above_i + below_i) + gaps
    const totalH = childExtents.reduce((s: number, e: any) => s + e.above + e.below, 0)
      + (children.length - 1) * V_GAP;

    // 第一个子节点的中心 y
    let cy = centerY - totalH / 2 + childExtents[0].above;

    for (let i = 0; i < children.length; i++) {
      layout(children[i], depth + 1, cy);
      if (i < children.length - 1) {
        // 下一个子节点的中心 = 当前中心 + 当前下方 + gap + 下一个上方
        cy += childExtents[i].below + V_GAP + childExtents[i + 1].above;
      }
    }
  }

  // 只布局可见的根节点
  const visibleRoots = roots.filter(r => isVisible(r));
  let topY = 0;
  for (const root of visibleRoots) {
    const above = extentAbove(root, collapsed, isVisible);
    const centerY = topY + above;
    layout(root, 0, centerY);
    topY += subtreeH(root, collapsed, isVisible) + ROOT_GAP;
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

// ── 核心字段筛选参数 ──────────────────────────────────────────────
interface CoreFilters {
  status: Set<string>;
  priority: Set<string>;
  owner: string;
  milestone: string;
  label: string;
  dueDateFrom: string;
  dueDateTo: string;
}

const EMPTY_CORE_FILTERS: CoreFilters = {
  status: new Set(), priority: new Set(), owner: '', milestone: '', label: '', dueDateFrom: '', dueDateTo: '',
};

function hasCoreFilters(f: CoreFilters): boolean {
  return f.status.size > 0 || f.priority.size > 0 || !!f.owner || !!f.milestone || !!f.label || !!f.dueDateFrom || !!f.dueDateTo;
}

function nodeMatchesCoreFilters(node: any, f: CoreFilters): boolean {
  if (f.status.size > 0 && !f.status.has(node.status)) return false;
  if (f.priority.size > 0 && !f.priority.has(node.priority)) return false;
  if (f.owner) {
    if (f.owner === '__none__') { if (node.owner) return false; }
    else { if (node.owner !== f.owner) return false; }
  }
  if (f.milestone) {
    if (f.milestone === '__none__') { if (node.milestone) return false; }
    else { if (node.milestone?.name !== f.milestone) return false; }
  }
  if (f.label) {
    const labels: string[] = Array.isArray(node.labels) ? node.labels : [];
    if (!labels.includes(f.label)) return false;
  }
  if (f.dueDateFrom && (!node.dueDate || node.dueDate < f.dueDateFrom)) return false;
  if (f.dueDateTo && (!node.dueDate || node.dueDate > f.dueDateTo)) return false;
  return true;
}

function nodeMatchesFilters(node: any, coreFilters: CoreFilters, fieldFilters: Record<number, string>, fieldDefs: any[]): boolean {
  if (!nodeMatchesCoreFilters(node, coreFilters)) return false;
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

function hasVisibleDescendant(node: any, coreFilters: CoreFilters, fieldFilters: Record<number, string>, fieldDefs: any[]): boolean {
  if (nodeMatchesFilters(node, coreFilters, fieldFilters, fieldDefs)) return true;
  for (const child of node.children ?? []) {
    if (hasVisibleDescendant(child, coreFilters, fieldFilters, fieldDefs)) return true;
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
  coreFilters: CoreFilters = EMPTY_CORE_FILTERS,
  renamingId: string | null = null,
  nodeStyles: Record<string, NodeStyle> = {},
  dropTargetId: string | null = null,
  stickerVisibility?: StickerVisibility,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const hasFilters = hasCoreFilters(coreFilters) || Object.values(fieldFilters).some(v => !!v);

  const progressMap = new Map<string, number>();
  for (const root of treeData) {
    const pm = precomputeProgress(root);
    pm.forEach((v, k) => progressMap.set(k, v));
  }

  function walk(node: any, isRoot: boolean) {
    if (hasFilters && !hasVisibleDescendant(node, coreFilters, fieldFilters, fieldDefs)) return;

    const progress = progressMap.get(node.taskId) ?? calcProgress(node);
    nodes.push({
      id: node.taskId,
      type: 'taskNode',
      position: positions.get(node.taskId) ?? { x: 0, y: 0 },
      draggable: true,
      selectable: true,
      data: {
        task: node, isRoot, isCollapsed: collapsed.has(node.taskId), progress,
        highlightDomains, renamingId, nodeStyle: nodeStyles[node.taskId] ?? {},
        isDropTarget: dropTargetId === node.taskId,
        stickerVisibility,
        ...callbacks,
      },
    });
    if (!collapsed.has(node.taskId)) {
      for (const child of node.children ?? []) {
        if (hasFilters && !hasVisibleDescendant(child, coreFilters, fieldFilters, fieldDefs)) continue;
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
  onAddLink, onOpenDetail, onRename, onStyleEdit, onMakeRoot, onReparent,
}: any) {
  return (
    <div
      className="fixed z-50 bg-white rounded-xl border border-gray-200 shadow-lg py-1 min-w-[160px] text-sm"
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      <button onClick={() => { onOpenDetail(task.taskId); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-indigo-600 font-medium">
        📋 编辑详情
      </button>
      <button onClick={() => { onRename(task.taskId); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
        ✏️ 重命名
      </button>
      <button onClick={() => { onStyleEdit(task.taskId, task.title); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
        🎨 样式设置
      </button>
      <div className="my-1 border-t border-gray-100" />
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
      <button onClick={() => { onReparent(task.taskId); onClose(); }}
        className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700">
        📎 改父节点
      </button>
      {task.parentTaskId && (
        <button onClick={() => { onMakeRoot(task.taskId); onClose(); }}
          className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-orange-600">
          ⬆ 变为根节点
        </button>
      )}
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

// ── 改父节点弹窗 ──────────────────────────────────────────────────
function ReparentModal({ taskId, onClose, onConfirm }: { taskId: string; onClose: () => void; onConfirm: (targetId: string) => void }) {
  const [target, setTarget] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-4">改父节点</h3>
        <p className="text-xs text-gray-500 mb-3">
          将 <span className="font-mono font-medium text-gray-700">{taskId}</span> 移动到指定节点下方。留空则变为根节点。
        </p>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">目标父节点 ID</label>
          <input value={target} onChange={e => setTarget(e.target.value)}
            placeholder="如 U-001（留空变为根节点）"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        </div>
        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={() => onConfirm(target.trim())}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">确认</button>
        </div>
      </div>
    </div>
  );
}

// ── 节点样式设置弹窗 ──────────────────────────────────────────────
function NodeStyleModal({ taskId, taskTitle, current, onSave, onClose }: {
  taskId: string; taskTitle: string; current: NodeStyle;
  onSave: (taskId: string, style: NodeStyle | null) => void; onClose: () => void;
}) {
  const [style, setStyle] = useState<NodeStyle>({ ...current });

  const hasCustom = !!(style.bgColor || style.borderColor || style.textColor || style.emoji
    || (style.borderWidth && style.borderWidth !== 2) || (style.borderStyle && style.borderStyle !== 'solid'));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">节点样式 — {taskTitle}</h3>
          <span className="text-xs font-mono text-gray-400">{taskId}</span>
        </div>

        {/* 预览 */}
        <div className="mb-5 flex justify-center">
          <div
            className="rounded-xl px-5 py-3 min-w-[180px] text-center transition-all"
            style={{
              backgroundColor: style.bgColor || '#fff',
              border: `${style.borderWidth || 2}px ${style.borderStyle || 'solid'} ${style.borderColor || '#e2e8f0'}`,
              color: style.textColor || '#1f2937',
            }}
          >
            <span className="text-sm font-semibold">
              {style.emoji && <span className="mr-1">{style.emoji}</span>}
              {taskTitle}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {/* 前缀 Emoji */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">前缀图标</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_EMOJIS.map((em, i) => (
                <button key={i} onClick={() => setStyle(s => ({ ...s, emoji: em || undefined }))}
                  className={cn('w-8 h-8 rounded-lg border text-sm flex items-center justify-center transition-all hover:scale-110',
                    (style.emoji ?? '') === em ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-gray-200 hover:border-gray-300')}
                >
                  {em || <span className="text-[10px] text-gray-300">无</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 背景色 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">背景色</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_BG_COLORS.map((c, i) => (
                <button key={i} onClick={() => setStyle(s => ({ ...s, bgColor: c || undefined }))}
                  className={cn('w-7 h-7 rounded-lg border transition-all hover:scale-110',
                    (style.bgColor ?? '') === c ? 'ring-2 ring-indigo-400 ring-offset-1' : '')}
                  style={{ backgroundColor: c || '#fff', borderColor: c ? `${c}80` : '#e2e8f0' }}
                  title={c || '默认'}
                >
                  {!c && <span className="text-[8px] text-gray-400 block">默认</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 边框色 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">边框色</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_BORDER_COLORS.map((c, i) => (
                <button key={i} onClick={() => setStyle(s => ({ ...s, borderColor: c || undefined }))}
                  className={cn('w-7 h-7 rounded-lg transition-all hover:scale-110',
                    (style.borderColor ?? '') === c ? 'ring-2 ring-indigo-400 ring-offset-1' : '')}
                  style={{ backgroundColor: c || '#f8fafc', border: `2px solid ${c || '#e2e8f0'}` }}
                  title={c || '默认'}
                >
                  {!c && <span className="text-[8px] text-gray-400 block">默认</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 文字色 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">文字色</label>
            <div className="flex flex-wrap gap-1.5">
              {['', '#1f2937', '#991b1b', '#9a3412', '#854d0e', '#166534', '#1e40af', '#5b21b6', '#9d174d', '#6b7280'].map((c, i) => (
                <button key={i} onClick={() => setStyle(s => ({ ...s, textColor: c || undefined }))}
                  className={cn('w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center transition-all hover:scale-110',
                    (style.textColor ?? '') === c ? 'ring-2 ring-indigo-400 ring-offset-1' : '')}
                  title={c || '默认'}
                >
                  {c ? <span className="text-sm font-bold" style={{ color: c }}>A</span>
                    : <span className="text-[8px] text-gray-400">默认</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 边框样式 */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">边框样式</label>
              <div className="flex gap-1.5">
                {(['solid', 'dashed', 'dotted'] as const).map(bs => (
                  <button key={bs} onClick={() => setStyle(s => ({ ...s, borderStyle: bs === 'solid' ? undefined : bs }))}
                    className={cn('flex-1 py-1.5 rounded-lg border text-[10px] font-medium transition-all',
                      (style.borderStyle ?? 'solid') === bs ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
                  >
                    {bs === 'solid' ? '实线' : bs === 'dashed' ? '虚线' : '点线'}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">边框粗细</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(w => (
                  <button key={w} onClick={() => setStyle(s => ({ ...s, borderWidth: w === 2 ? undefined : w }))}
                    className={cn('flex-1 py-1.5 rounded-lg border text-[10px] font-medium transition-all',
                      (style.borderWidth ?? 2) === w ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => { onSave(taskId, null); onClose(); }}
            className={cn('text-xs px-3 py-1.5 rounded-lg transition-colors',
              hasCustom ? 'text-red-500 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed')}
            disabled={!hasCustom}
          >
            恢复默认
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button onClick={() => { onSave(taskId, hasCustom ? style : null); onClose(); }}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">应用</button>
          </div>
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
  const nodeStyle: NodeStyle = (data as any).nodeStyle ?? {};
  const isDropTarget: boolean = (data as any).isDropTarget ?? false;
  const stickerVis: StickerVisibility = (data as any).stickerVisibility ?? {
    showDueDate: true, showPriority: true, showTags: true, showOwner: true, showStartDate: false,
  };

  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const renamingId: string | null = (data as any).renamingId ?? null;

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  // 右键菜单"重命名"触发
  useEffect(() => {
    if (renamingId === task.taskId && !editing) {
      setEditVal(task.title);
      setEditing(true);
      (data as any).onClearRenaming?.();
    }
  }, [renamingId]);

  function commitEdit() {
    setEditing(false);
    const v = editVal.trim();
    if (v && v !== task.title) (data as any).onRename(task.taskId, v);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    (data as any).onContextMenu(e.clientX, e.clientY, task);
  }

  // 计算贴纸数据
  const dueDateSticker = stickerVis.showDueDate && task.status !== 'done'
    ? getDueDateSticker(task.dueDate) : null;
  const prioritySticker = stickerVis.showPriority
    ? PRIORITY_STICKER[task.priority] ?? null : null;
  const tags: string[] = Array.isArray(task.tags) ? task.tags : [];
  const showTags = stickerVis.showTags && tags.length > 0;
  const hasStickers = !!dueDateSticker || showTags;

  // 样式优先级：放置目标 > 用户自定义 > domain高亮 > label色系 > 默认
  const resolvedBorder = isDropTarget ? '#6366f1'
    : nodeStyle.borderColor
    || (selected ? colors.border : isHighlighted ? `${hlColor}90` : '#e2e8f0');
  const resolvedBg = isDropTarget ? '#eef2ff'
    : nodeStyle.bgColor
    || (isHighlighted ? `${hlColor}08` : selected ? colors.bg : '#fff');
  const resolvedTextColor = nodeStyle.textColor || '#1f2937';
  const resolvedBorderWidth = isDropTarget ? 3 : (nodeStyle.borderWidth ?? 2);
  const resolvedBorderStyle = isDropTarget ? 'dashed' as const : (nodeStyle.borderStyle ?? 'solid');
  const barColor = nodeStyle.borderColor || (isHighlighted ? hlColor! : colors.border);

  const boxShadow = (() => {
    if (isDropTarget) return '0 0 0 4px rgba(99,102,241,0.2), 0 8px 24px rgba(99,102,241,0.15)';
    const base = selected ? `0 0 0 3px ${resolvedBorder}28, 0 4px 12px rgba(0,0,0,0.1)` : '0 1px 4px rgba(0,0,0,0.06)';
    if (isHighlighted && !nodeStyle.borderColor) return `${base}, 0 0 14px 3px ${hlColor}35`;
    return base;
  })();

  return (
    <div
      className="relative select-none"
      style={{ width: NODE_W }}
    >
      {/* ====== 主卡片 ====== */}
      <div
        className="relative rounded-xl"
        style={{
          minHeight: NODE_H,
          border: `${resolvedBorderWidth}px ${resolvedBorderStyle} ${resolvedBorder}`,
          boxShadow,
          backgroundColor: resolvedBg,
          transition: 'box-shadow 0.3s, border-color 0.3s, background-color 0.3s',
        }}
        onDoubleClick={() => { (data as any).onOpenDetail(task.taskId); }}
        onContextMenu={handleContextMenu}
      >
        {/* 左侧色条 */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: barColor }} />

        {/* 🔥 优先级旗标贴纸（左上角，像小贴纸一样翘起来） */}
        {prioritySticker && (
          <div
            className="absolute -top-2.5 left-3 flex items-center gap-0.5 px-1.5 py-0.5 rounded-b-md rounded-t-sm z-20"
            style={{
              background: prioritySticker.bg,
              border: `1.5px solid ${prioritySticker.color}40`,
              boxShadow: `0 2px 6px ${prioritySticker.color}20`,
              transform: 'rotate(-2deg)',
            }}
            title={`优先级: ${task.priority} ${prioritySticker.label}`}
          >
            <span className="text-[10px]">{prioritySticker.emoji}</span>
            <span className="text-[8px] font-bold" style={{ color: prioritySticker.color }}>{task.priority}</span>
          </div>
        )}

        {/* 调度类型小耳朵徽标（右上角） */}
        {task.scheduleMode && task.scheduleMode !== 'once' && (() => {
          const badgeCfg: Record<string, { icon: string; bg: string; border: string; title: string }> = {
            recurring:        { icon: '🔄', bg: '#ede9fe', border: '#8b5cf6', title: '周期循环' },
            scheduled:        { icon: '⏰', bg: '#fef3c7', border: '#f59e0b', title: '定时触发' },
            milestone_driven: { icon: '🏁', bg: '#dcfce7', border: '#22c55e', title: '里程碑驱动' },
            on_demand:        { icon: '⚡', bg: '#ffedd5', border: '#f97316', title: '按需触发' },
          };
          const cfg = badgeCfg[task.scheduleMode];
          if (!cfg) return null;
          return (
            <div
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] z-20 shadow-sm"
              style={{ backgroundColor: cfg.bg, border: `2px solid ${cfg.border}` }}
              title={cfg.title}
            >
              {cfg.icon}
            </div>
          );
        })()}

        {/* 拖拽把手 */}
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing opacity-25 hover:opacity-60" title="拖拽移动">
          {[0, 1].map(i => <div key={i} className="w-0.5 h-0.5 bg-gray-400 rounded-full" />)}
        </div>

        {/* 放置目标提示 */}
        {isDropTarget && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shadow-md z-30">
            放置为子节点
          </div>
        )}

        <div className="pl-5 pr-8 py-1.5">
          {/* 上行：标签 + 标题 */}
          <div className="flex items-center gap-1.5">
            {firstLabel && (
              <span className="flex-shrink-0 text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: colors.pill, color: colors.text }}>
                {firstLabel}{labels.length > 1 ? `+${labels.length - 1}` : ''}
              </span>
            )}
            <div className="flex-1 min-w-0">
              {editing ? (
                <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                    if (e.key === 'Escape') { setEditing(false); setEditVal(task.title); }
                  }}
                  className="w-full text-[12px] font-semibold text-gray-800 bg-transparent border-b border-indigo-300 outline-none" />
              ) : (
                <p className="text-[12px] font-semibold leading-tight line-clamp-2" style={{ color: resolvedTextColor }} title={task.title}>
                  {nodeStyle.emoji && <span className="mr-0.5">{nodeStyle.emoji}</span>}
                  {task.title}
                </p>
              )}
            </div>
          </div>

          {/* 下行：meta 信息 */}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] font-mono text-indigo-400 flex-shrink-0">{task.taskId}</span>
            {(task.attachmentCount ?? 0) > 0 && (
              <span className="text-[9px] text-gray-400" title={`${task.attachmentCount} 个附件`}>📎{task.attachmentCount}</span>
            )}
            {task.owner && <span className="text-[9px] text-gray-400 truncate max-w-[60px]">{task.owner}</span>}
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_DOT[task.status] ?? '#cbd5e1' }} title={task.status} />
          </div>
        </div>

        {/* 进度圆环（右侧居中） */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
          <ProgressRing progress={progress} size={24} />
        </div>

        {/* 右侧：有子节点时显示展开/收缩 */}
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
            <button
              className="absolute -right-3.5 -bottom-3.5 w-6 h-6 rounded-full bg-indigo-500 border-2 border-white text-white hover:bg-indigo-600 flex items-center justify-center text-sm shadow-md z-20 transition-colors"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); (data as any).onAddChild(task.taskId); }}
              title="添加子节点 (Tab)"
            >
              +
            </button>
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
        {isCollapsed && hasChildren && !hasStickers && (
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

      {/* ====== 贴纸区（主卡片下方，像便利贴一样贴在卡片底部） ====== */}
      {hasStickers && (
        <div className="flex flex-wrap items-start gap-1 mt-1 px-1" style={{ maxWidth: NODE_W }}>
          {/* 📅 截止时间贴纸 — 小票根样式 */}
          {dueDateSticker && (
            <div
              className="inline-flex items-center gap-1 px-2 py-[3px] rounded-lg text-[9px] font-medium select-none"
              style={{
                background: dueDateSticker.bg,
                border: `1.5px solid ${dueDateSticker.border}`,
                color: dueDateSticker.color,
                boxShadow: `0 1px 4px ${dueDateSticker.color}15`,
                ...(dueDateSticker.urgent === 'overdue' ? {
                  animation: 'sticker-shake 0.5s ease-in-out infinite alternate',
                } : {}),
              }}
              title={`截止日期: ${task.dueDate}${dueDateSticker.sub ? ` (${dueDateSticker.sub})` : ''}`}
            >
              <span className="text-[11px] leading-none">{dueDateSticker.emoji}</span>
              <span className="font-semibold">{dueDateSticker.text}</span>
              <span className="opacity-70 text-[8px]">{dueDateSticker.sub}</span>
            </div>
          )}

          {/* 🏷️ 自定义标签贴纸 — 彩色圆角小药丸 */}
          {showTags && tags.slice(0, 4).map((tag: string, idx: number) => {
            const tc = getTagColor(idx);
            return (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-1.5 py-[2px] rounded-full text-[8px] font-semibold select-none"
                style={{
                  backgroundColor: tc.bg,
                  color: tc.color,
                  border: `1px solid ${tc.border}`,
                  boxShadow: `0 1px 2px ${tc.color}10`,
                }}
                title={tag}
              >
                <span className="text-[9px]">✦</span>
                {tag.length > 6 ? tag.slice(0, 6) + '…' : tag}
              </span>
            );
          })}
          {showTags && tags.length > 4 && (
            <span className="text-[8px] text-gray-400 leading-none self-center">+{tags.length - 4}</span>
          )}

          {/* 折叠子节点计数（贴纸区有内容时移到这里） */}
          {isCollapsed && hasChildren && (
            <span
              className="inline-flex items-center px-1.5 py-[2px] rounded-full text-[8px] font-bold text-white select-none"
              style={{ backgroundColor: colors.border }}
            >
              {task.children.length}子节点
            </span>
          )}
        </div>
      )}

      {/* 过期抖动动画 CSS（注入 style 标签，只注入一次） */}
      {dueDateSticker?.urgent === 'overdue' && (
        <style>{`
          @keyframes sticker-shake {
            0% { transform: translateX(-0.5px) rotate(-0.5deg); }
            100% { transform: translateX(0.5px) rotate(0.5deg); }
          }
        `}</style>
      )}
    </div>
  );
}

// ── 项目虚拟根节点 ──────────────────────────────────────────────────
// ── 分组框节点 ─────────────────────────────────────────────────────
function GroupBoxNode({ data, selected }: NodeProps) {
  const gb = (data as any).groupBox as GroupBox;
  const onEditGroupBox = (data as any).onEditGroupBox as (id: string) => void;
  const onDeleteGroupBox = (data as any).onDeleteGroupBox as (id: string) => void;
  const onResizeGroupBox = (data as any).onResizeGroupBox as (id: string, w: number, h: number) => void;
  const color = gb.color || '#6366f1';

  // 拖拽 resize handle
  const resizing = useRef(false);
  const startPos = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    startPos.current = { x: e.clientX, y: e.clientY, w: gb.width, h: gb.height };

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const dw = ev.clientX - startPos.current.x;
      const dh = ev.clientY - startPos.current.y;
      const newW = Math.max(GROUP_BOX_MIN_W, startPos.current.w + dw);
      const newH = Math.max(GROUP_BOX_MIN_H, startPos.current.h + dh);
      onResizeGroupBox(gb.id, newW, newH);
    };
    const onUp = () => {
      resizing.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [gb.id, gb.width, gb.height, onResizeGroupBox]);

  return (
    <div
      className="relative group/gbox"
      style={{
        width: gb.width,
        height: gb.height,
        borderRadius: 16,
        border: `2px ${selected ? 'solid' : 'dashed'} ${color}`,
        backgroundColor: `${color}08`,
        boxShadow: selected ? `0 0 0 3px ${color}30` : 'none',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* 标题栏 */}
      <div
        className="absolute -top-0.5 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-b-lg"
        style={{ backgroundColor: `${color}18`, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }}
      >
        <span className="text-xs font-semibold" style={{ color }}>{gb.label || '分组'}</span>
        {/* 操作按钮 - 悬停显示 */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/gbox:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEditGroupBox(gb.id); }}
            className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-white/60 transition-colors"
            style={{ color }}
            title="编辑分组框"
          >✏️</button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteGroupBox(gb.id); }}
            className="w-5 h-5 flex items-center justify-center rounded text-[10px] hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
            title="删除分组框"
          >✕</button>
        </div>
      </div>

      {/* 右下角 resize 拖柄 */}
      <div
        className="absolute bottom-1 right-1 w-4 h-4 cursor-nwse-resize opacity-0 group-hover/gbox:opacity-60 transition-opacity"
        onMouseDown={onResizeMouseDown}
        style={{ color }}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-full h-full">
          <path d="M14 14H10V13H13V10H14V14ZM14 8H13V6H14V8ZM8 14H6V13H8V14Z" />
        </svg>
      </div>
    </div>
  );
}

// ── 分组框编辑弹窗 ────────────────────────────────────────────────
function GroupBoxEditModal({ groupBox, onSave, onClose }: {
  groupBox: GroupBox;
  onSave: (gb: GroupBox) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(groupBox.label);
  const [color, setColor] = useState(groupBox.color);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-gray-900 mb-4">编辑分组框</h3>

        <div className="space-y-4">
          {/* 标题 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">标题</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="分组名称"
              autoFocus
            />
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">颜色</label>
            <div className="flex flex-wrap gap-2">
              {GROUP_BOX_COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={cn('w-8 h-8 rounded-lg transition-all hover:scale-110',
                    color === c.value ? 'ring-2 ring-offset-2' : '')}
                  style={{ backgroundColor: c.value, ['--tw-ring-color' as any]: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* 预览 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">预览</label>
            <div
              className="rounded-xl px-4 py-3 min-h-[60px] flex items-start"
              style={{
                border: `2px dashed ${color}`,
                backgroundColor: `${color}08`,
              }}
            >
              <span className="text-xs font-semibold" style={{ color }}>{label || '分组'}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button
            onClick={() => { onSave({ ...groupBox, label, color }); onClose(); }}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
          >确认</button>
        </div>
      </div>
    </div>
  );
}

function ProjectRootNode({ data }: NodeProps) {
  const projectName = (data as any).projectName || '项目';
  return (
    <div
      className="relative flex items-center justify-center rounded-2xl select-none"
      style={{
        width: PROJECT_NODE_W,
        height: PROJECT_NODE_H,
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        boxShadow: '0 4px 16px rgba(99,102,241,0.3), 0 0 0 3px rgba(99,102,241,0.1)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-white/90 text-lg">🏠</span>
        <span className="text-white text-sm font-bold truncate max-w-[90px]">{projectName}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}

const NODE_TYPES = { taskNode: TaskNode, projectRoot: ProjectRootNode, groupBox: GroupBoxNode };
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
  const activeProject = useActiveProject();
  const { screenToFlowPosition } = useReactFlow();
  const [activeDomain, setActiveDomain] = useState(() => loadState('activeDomain', ''));

  const { data: domainList = [] } = useQuery({
    queryKey: ['domains', activeProject],
    queryFn: () => api.getDomains(),
  });

  const { data: customFieldDefs = [] } = useQuery({
    queryKey: ['custom-fields', activeProject],
    queryFn: () => api.getCustomFields(),
  });

  const { data: treeData = [] } = useQuery({
    queryKey: ['task-tree', activeProject, activeDomain],
    queryFn: () => api.getTaskTree(activeDomain ? { domain: activeDomain } : undefined),
  });

  const { data: reqLinks = [] } = useQuery({
    queryKey: ['req-links', activeProject],
    queryFn: () => api.getReqLinks(),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadState('selectedId', null));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(loadState<string[]>('collapsed', [])));
  const [createModal, setCreateModal] = useState<{ parentId?: string; domain?: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; title: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: any } | null>(null);
  const [addLinkModal, setAddLinkModal] = useState<{ sourceId: string } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [nodeStyles, setNodeStyles] = useState<Record<string, NodeStyle>>(() => loadState('nodeStyles', {}));
  const [styleModal, setStyleModal] = useState<{ taskId: string; title: string } | null>(null);
  const [groupBoxes, setGroupBoxes] = useState<GroupBox[]>(() => loadState('groupBoxes', []));
  const [editGroupBoxId, setEditGroupBoxId] = useState<string | null>(null);
  const [linkVisibility, setLinkVisibility] = useState<Record<string, boolean>>(() =>
    loadState('linkVisibility', { blocks: true, precedes: true, relates: false })
  );
  const [highlightDomains, setHighlightDomains] = useState<Set<string>>(() => new Set(loadState<string[]>('highlightDomains', [])));
  const [fieldFilters, setFieldFilters] = useState<Record<number, string>>(() => loadState('fieldFilters', {}));
  const [stickerVisibility, setStickerVisibility] = useState<StickerVisibility>(() =>
    loadState('stickerVisibility', { showDueDate: true, showPriority: true, showTags: true, showOwner: true, showStartDate: false })
  );

  // 核心字段筛选
  const [coreFilters, setCoreFilters] = useState<CoreFilters>(() => {
    const saved = loadState<any>('coreFilters', null);
    if (!saved) return { ...EMPTY_CORE_FILTERS };
    return {
      status: new Set<string>(saved.status ?? []),
      priority: new Set<string>(saved.priority ?? []),
      owner: saved.owner ?? '',
      milestone: saved.milestone ?? '',
      label: saved.label ?? '',
      dueDateFrom: saved.dueDateFrom ?? '',
      dueDateTo: saved.dueDateTo ?? '',
    };
  });

  const { data: memberList = [] } = useQuery({
    queryKey: ['members', activeProject],
    queryFn: () => api.getMembers(),
  });

  const { data: milestoneList = [] } = useQuery({
    queryKey: ['milestones', activeProject],
    queryFn: () => api.getMilestones(),
  });

  // 从树数据中收集所有 labels
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    function collect(node: any) {
      const labels: string[] = Array.isArray(node.labels) ? node.labels : [];
      labels.forEach(l => set.add(l));
      for (const child of node.children ?? []) collect(child);
    }
    (treeData as any[]).forEach(collect);
    return [...set].sort();
  }, [treeData]);

  // 从树数据中收集所有 owner
  const allOwners = useMemo(() => {
    const set = new Set<string>();
    function collect(node: any) {
      if (node.owner) set.add(node.owner);
      for (const child of node.children ?? []) collect(child);
    }
    (treeData as any[]).forEach(collect);
    return [...set].sort();
  }, [treeData]);

  // 持久化状态到 localStorage
  useEffect(() => { saveState('activeDomain', activeDomain); }, [activeDomain]);
  useEffect(() => { saveState('collapsed', [...collapsed]); }, [collapsed]);
  useEffect(() => { saveState('linkVisibility', linkVisibility); }, [linkVisibility]);
  useEffect(() => { saveState('highlightDomains', [...highlightDomains]); }, [highlightDomains]);
  useEffect(() => { saveState('fieldFilters', fieldFilters); }, [fieldFilters]);
  useEffect(() => { saveState('selectedId', selectedId); }, [selectedId]);
  useEffect(() => { saveState('nodeStyles', nodeStyles); }, [nodeStyles]);
  useEffect(() => { saveState('stickerVisibility', stickerVisibility); }, [stickerVisibility]);
  useEffect(() => { saveState('groupBoxes', groupBoxes); }, [groupBoxes]);
  useEffect(() => {
    saveState('coreFilters', {
      status: [...coreFilters.status],
      priority: [...coreFilters.priority],
      owner: coreFilters.owner,
      milestone: coreFilters.milestone,
      label: coreFilters.label,
      dueDateFrom: coreFilters.dueDateFrom,
      dueDateTo: coreFilters.dueDateTo,
    });
  }, [coreFilters]);

  const dragSnap = useRef(new Map<string, { x: number; y: number }>());
  const edgesRef = useRef<Edge[]>([]);
  const nodesRef = useRef<Node[]>([]);
  const nodeDataMap = useRef(new Map<string, any>());
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const [reparentModal, setReparentModal] = useState<{ taskId: string } | null>(null);
  const draggingNodeId = useRef<string | null>(null);

  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  const callbacks = useMemo(() => ({
    onAddChild: (parentId: string) => setCreateModal({ parentId, domain: activeDomain }),
    onAddSibling: (task: any) => {
      const curEdges = edgesRef.current;
      const parentEdge = curEdges.find(ed => ed.target === task.taskId && ed.type === 'treeEdge');
      setCreateModal(parentEdge ? { parentId: parentEdge.source, domain: activeDomain } : { domain: activeDomain });
    },
    onRename: (taskId: string, title: string) => renameMut.mutate({ taskId, title }),
    onDelete: (taskId: string, title: string) => setDeleteConfirm({ taskId, title }),
    onOpenDetail: (taskId: string) => setDetailTaskId(taskId),
    onStartRename: (taskId: string) => setRenamingId(taskId),
    onClearRenaming: () => setRenamingId(null),
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

  const reparentMut = useMutation({
    mutationFn: ({ taskId, newParentId }: { taskId: string; newParentId: string | null }) =>
      api.reparentTask(taskId, newParentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-tree'] }),
    onError: (e: any) => alert(e.message || '移动节点失败（可能会形成循环引用）'),
  });

  const reorderMut = useMutation({
    mutationFn: ({ parentTaskId, orderedChildIds }: { parentTaskId: string | null; orderedChildIds: string[] }) =>
      api.reorderChildren(parentTaskId, orderedChildIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-tree'] }),
    onError: (e: any) => alert(e.message || '排序失败'),
  });

  // 重建图
  useEffect(() => {
    if (!(treeData as any[]).length) {
      setNodes([]);
      setEdges([]);
      return;
    }
    // 构造可见性判断函数：筛选条件激活时，只布局可见节点
    const hasFilters = hasCoreFilters(coreFilters) || Object.values(fieldFilters).some(v => !!v);
    const isVisible: VisibilityFn = hasFilters
      ? (node: any) => hasVisibleDescendant(node, coreFilters, fieldFilters, customFieldDefs as any[])
      : ALWAYS_VISIBLE;
    const positions = computeLayout(treeData as any[], collapsed, isVisible);
    const hlArr = [...highlightDomains];
    const { nodes: ns, edges: es } = buildFlow(
      treeData as any[], positions, collapsed, callbacks,
      reqLinks as any[], linkVisibility, hlArr,
      fieldFilters, customFieldDefs as any[], coreFilters, renamingId, nodeStyles,
      null, // dropTargetId 由独立 effect 处理
      stickerVisibility,
    );

    // 注入虚拟项目根节点：连接所有实际根节点
    const visibleRoots = (treeData as any[]).filter(r => isVisible(r));
    if (visibleRoots.length > 0) {
      // 计算所有根节点的纵向中心
      let minY = Infinity, maxY = -Infinity;
      for (const root of visibleRoots) {
        const pos = positions.get(root.taskId);
        if (pos) {
          minY = Math.min(minY, pos.y);
          maxY = Math.max(maxY, pos.y + NODE_H);
        }
      }
      const centerY = (minY + maxY) / 2;
      const projectRootX = -(PROJECT_NODE_W + H_GAP);
      const projectRootY = centerY - PROJECT_NODE_H / 2;

      ns.unshift({
        id: PROJECT_NODE_ID,
        type: 'projectRoot',
        position: { x: projectRootX, y: projectRootY },
        draggable: false,
        selectable: false,
        data: { projectName: activeProject === 'default' ? 'ClawPM' : activeProject },
      });

      for (const root of visibleRoots) {
        es.unshift({
          id: `project-root→${root.taskId}`,
          source: PROJECT_NODE_ID,
          target: root.taskId,
          type: 'treeEdge',
          data: {},
        });
      }
    }

    nodeDataMap.current.clear();
    ns.forEach(n => nodeDataMap.current.set(n.id, (n.data as any).task));

    // 注入分组框节点（最底层，zIndex 最低）
    for (const gb of groupBoxes) {
      ns.unshift({
        id: gb.id,
        type: 'groupBox',
        position: { x: gb.x, y: gb.y },
        draggable: true,
        selectable: true,
        zIndex: -10,
        style: { width: gb.width, height: gb.height },
        data: {
          groupBox: gb,
          onEditGroupBox: (id: string) => setEditGroupBoxId(id),
          onDeleteGroupBox: (id: string) => setGroupBoxes(prev => prev.filter(g => g.id !== id)),
          onResizeGroupBox: (id: string, w: number, h: number) => {
            setGroupBoxes(prev => prev.map(g => g.id === id ? { ...g, width: w, height: h } : g));
          },
        },
      });
    }

    setNodes(ns);
    setEdges(es);
  }, [treeData, collapsed, reqLinks, linkVisibility, highlightDomains, fieldFilters, customFieldDefs, coreFilters, renamingId, nodeStyles, stickerVisibility, activeProject, groupBoxes]);

  // 独立更新拖拽放置目标高亮（避免整图重建导致拖拽中断）
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      const shouldBeTarget = n.id === dropTargetId;
      const isCurrentTarget = (n.data as any).isDropTarget ?? false;
      if (shouldBeTarget === isCurrentTarget) return n;
      return { ...n, data: { ...n.data, isDropTarget: shouldBeTarget } };
    }));
  }, [dropTargetId]);

  // 拖拽：子树跟随 + 检测放置目标 / 同级排序
  // 辅助：从 treeData 中查找节点的父节点 taskId 和同级兄弟列表
  const treeDataRef = useRef<any[]>([]);
  useEffect(() => { treeDataRef.current = treeData as any[]; }, [treeData]);

  function findNodeInTree(roots: any[], taskId: string): { node: any; parent: any } | null {
    function walk(node: any, parent: any): { node: any; parent: any } | null {
      if (node.taskId === taskId) return { node, parent };
      for (const child of node.children ?? []) {
        const result = walk(child, node);
        if (result) return result;
      }
      return null;
    }
    for (const root of roots) {
      const result = walk(root, null);
      if (result) return result;
    }
    return null;
  }

  function getSiblingIds(roots: any[], taskId: string): { parentTaskId: string | null; siblingIds: string[] } | null {
    const found = findNodeInTree(roots, taskId);
    if (!found) return null;
    const parent = found.parent;
    if (!parent) {
      // 根节点的兄弟就是所有根
      return { parentTaskId: null, siblingIds: roots.map((r: any) => r.taskId) };
    }
    return { parentTaskId: parent.taskId, siblingIds: (parent.children ?? []).map((c: any) => c.taskId) };
  }

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === PROJECT_NODE_ID) return;
    if (node.id.startsWith('gb_')) return; // groupBox 不需要拖拽快照
    const snap = new Map<string, { x: number; y: number }>();
    setNodes(curr => { curr.forEach(n => snap.set(n.id, { ...n.position })); return curr; });
    dragSnap.current = snap;
    draggingNodeId.current = node.id;
  }, []);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('gb_')) return; // groupBox 不做命中检测
    const start = dragSnap.current.get(node.id);
    if (!start) return;
    const dx = node.position.x - start.x;
    const dy = node.position.y - start.y;

    // 子树跟随
    if (dx || dy) {
      const descendants = getDescendants(node.id, edgesRef.current);
      if (descendants.size) {
        setNodes(prev => prev.map(n => {
          if (n.id === node.id) return n;
          if (descendants.has(n.id)) {
            const ns = dragSnap.current.get(n.id);
            if (!ns) return n;
            return { ...n, position: { x: ns.x + dx, y: ns.y + dy } };
          }
          return n;
        }));
      }
    }

    // 检测放置目标：被拖节点中心是否落入某个其他节点的范围
    const dragCenterX = node.position.x + NODE_W / 2;
    const dragCenterY = node.position.y + NODE_H / 2;
    const descendants = getDescendants(node.id, edgesRef.current);
    let found: string | null = null;

    for (const n of nodesRef.current) {
      if (n.id === node.id) continue;
      if (n.id === PROJECT_NODE_ID) continue;
      if (n.id.startsWith('gb_')) continue; // 跳过分组框
      if (descendants.has(n.id)) continue;
      const nx = n.position.x;
      const ny = n.position.y;
      if (dragCenterX >= nx && dragCenterX <= nx + NODE_W &&
          dragCenterY >= ny && dragCenterY <= ny + NODE_H) {
        found = n.id;
        break;
      }
    }

    if (found !== dropTargetRef.current) {
      setDropTargetId(found);
      dropTargetRef.current = found;
    }
  }, []);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    // 如果是分组框节点 → 直接保存新位置
    if (node.id.startsWith('gb_')) {
      setGroupBoxes(prev => prev.map(g => g.id === node.id ? { ...g, x: node.position.x, y: node.position.y } : g));
      return;
    }

    const targetId = dropTargetRef.current;
    const dragId = draggingNodeId.current;
    setDropTargetId(null);
    dropTargetRef.current = null;
    draggingNodeId.current = null;

    if (!dragId) return;

    const restorePositions = () => {
      const snap = dragSnap.current;
      if (!snap.size) return;
      const descendants = getDescendants(dragId, edgesRef.current);
      setNodes(prev => prev.map(n => {
        if (n.id === dragId || descendants.has(n.id)) {
          const orig = snap.get(n.id);
          if (orig) return { ...n, position: { ...orig } };
        }
        return n;
      }));
    };

    // 情况 1：放在目标节点上 → reparent（变为子节点）
    if (targetId && targetId !== dragId) {
      const currentParentEdge = edgesRef.current.find(
        ed => ed.target === dragId && ed.type === 'treeEdge'
      );
      const currentParentId = currentParentEdge?.source ?? null;
      if (currentParentId !== targetId) {
        restorePositions();
        reparentMut.mutate({ taskId: dragId, newParentId: targetId });
        return;
      }
    }

    // 情况 2：没放在其他节点上 → 检测同级排序
    const dragStartY = dragSnap.current.get(dragId)?.y ?? 0;
    const dragEndY = node.position.y;
    const deltaY = dragEndY - dragStartY;

    // 微小拖动忽略
    if (Math.abs(deltaY) < NODE_H * 0.4) {
      restorePositions();
      return;
    }

    const sibInfo = getSiblingIds(treeDataRef.current, dragId);
    if (!sibInfo || sibInfo.siblingIds.length < 2) {
      restorePositions();
      return;
    }

    const { parentTaskId, siblingIds } = sibInfo;
    const currentIdx = siblingIds.indexOf(dragId);
    if (currentIdx < 0) { restorePositions(); return; }

    // 根据拖拽方向和距离确定新位置
    // 通过比较拖拽后中心 Y 和各兄弟原始中心 Y 来确定插入位置
    const dragCenterY = dragEndY + NODE_H / 2;
    const siblingCenters = siblingIds.map(id => {
      const snap = dragSnap.current.get(id);
      return { id, centerY: snap ? snap.y + NODE_H / 2 : 0 };
    });

    // 从列表中去掉自身，然后根据拖拽中心 Y 找到插入位置
    const others = siblingCenters.filter(s => s.id !== dragId);
    let insertIdx = others.length; // 默认放到最后
    for (let i = 0; i < others.length; i++) {
      if (dragCenterY < others[i].centerY) {
        insertIdx = i;
        break;
      }
    }

    // 重建有序列表
    const newOrder = [...others.map(s => s.id)];
    newOrder.splice(insertIdx, 0, dragId);

    // 如果顺序没变，恢复原位
    if (newOrder.every((id, i) => id === siblingIds[i])) {
      restorePositions();
      return;
    }

    // 先恢复原位，然后调用 API
    restorePositions();
    reorderMut.mutate({ parentTaskId, orderedChildIds: newOrder });
  }, []);

  // 键盘快捷键
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!selectedId) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        setCreateModal({ parentId: selectedId, domain: activeDomain });
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const parentEdge = edgesRef.current.find(ed => ed.target === selectedId && ed.type === 'treeEdge');
        setCreateModal(parentEdge ? { parentId: parentEdge.source, domain: activeDomain } : { domain: activeDomain });
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
        onNodeDragStop={onNodeDragStop}
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
          <div className="flex flex-col gap-2 w-[240px] max-h-[calc(100vh-120px)] overflow-y-auto">
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

            {/* 🏷️ 节点贴纸开关 */}
            <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 mb-2">🏷️ 节点贴纸</p>
              {([
                { key: 'showDueDate'  as const, emoji: '📅', label: '截止时间', desc: '显示 deadline 贴纸' },
                { key: 'showPriority' as const, emoji: '🔥', label: '优先级旗标', desc: '左上角优先级标记' },
                { key: 'showTags'     as const, emoji: '✦', label: '自定义标签', desc: '彩色标签药丸' },
              ]).map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer mb-1.5 group">
                  <input
                    type="checkbox"
                    checked={stickerVisibility[item.key]}
                    onChange={ev => setStickerVisibility(prev => ({ ...prev, [item.key]: ev.target.checked }))}
                    className="rounded accent-indigo-500"
                  />
                  <span className="text-[11px]">{item.emoji}</span>
                  <span className="text-xs font-medium text-gray-700">{item.label}</span>
                  <span className="text-[10px] text-gray-400 hidden group-hover:inline">({item.desc})</span>
                </label>
              ))}
            </div>

            {/* 核心字段筛选 */}
            <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-sm px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500">筛选</p>
                {hasCoreFilters(coreFilters) && (
                  <button
                    onClick={() => setCoreFilters({ ...EMPTY_CORE_FILTERS, status: new Set(), priority: new Set() })}
                    className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    清除全部
                  </button>
                )}
              </div>
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                {/* 状态 */}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">状态</label>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(STATUS_DOT).map(([s, color]) => {
                      const on = coreFilters.status.has(s);
                      return (
                        <button key={s} onClick={() => setCoreFilters(prev => {
                          const next = new Set(prev.status);
                          on ? next.delete(s) : next.add(s);
                          return { ...prev, status: next };
                        })}
                          className={cn('flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all',
                            on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-500 border-gray-100 hover:text-gray-700')}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                          {STATUS_LABEL_CN[s] ?? s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 优先级 */}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">优先级</label>
                  <div className="flex flex-wrap gap-1">
                    {['P0', 'P1', 'P2', 'P3'].map(p => {
                      const on = coreFilters.priority.has(p);
                      const pColor: Record<string, string> = { P0: '#ef4444', P1: '#f97316', P2: '#3b82f6', P3: '#94a3b8' };
                      return (
                        <button key={p} onClick={() => setCoreFilters(prev => {
                          const next = new Set(prev.priority);
                          on ? next.delete(p) : next.add(p);
                          return { ...prev, priority: next };
                        })}
                          className={cn('text-[10px] px-2 py-1 rounded-full border transition-all font-medium',
                            on ? 'border-indigo-200' : 'bg-gray-50 border-gray-100 hover:text-gray-700')}
                          style={on ? { backgroundColor: `${pColor[p]}15`, color: pColor[p], borderColor: `${pColor[p]}40` } : { color: pColor[p] }}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 负责人 */}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">负责人</label>
                  <select
                    value={coreFilters.owner}
                    onChange={e => setCoreFilters(prev => ({ ...prev, owner: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  >
                    <option value="">全部</option>
                    <option value="__none__">（未指定）</option>
                    {allOwners.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                {/* 里程碑 */}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">里程碑</label>
                  <select
                    value={coreFilters.milestone}
                    onChange={e => setCoreFilters(prev => ({ ...prev, milestone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  >
                    <option value="">全部</option>
                    <option value="__none__">（无里程碑）</option>
                    {(milestoneList as any[]).map((m: any) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>

                {/* 标签 */}
                {allLabels.length > 0 && (
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">标签</label>
                    <div className="flex flex-wrap gap-1">
                      {allLabels.map(l => {
                        const on = coreFilters.label === l;
                        const lc = LABEL_COLORS[l] ?? DEFAULT_COLORS;
                        return (
                          <button key={l} onClick={() => setCoreFilters(prev => ({ ...prev, label: on ? '' : l }))}
                            className={cn('text-[10px] px-2 py-1 rounded-full border transition-all',
                              on ? 'border-indigo-200' : 'border-gray-100 hover:text-gray-600')}
                            style={on ? { backgroundColor: lc.pill, color: lc.text, borderColor: `${lc.border}40` } : { color: lc.text, backgroundColor: `${lc.pill}60` }}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 截止日期范围 */}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">截止日期</label>
                  <div className="flex items-center gap-1">
                    <input type="date" value={coreFilters.dueDateFrom}
                      onChange={e => setCoreFilters(prev => ({ ...prev, dueDateFrom: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    <span className="text-[10px] text-gray-400">~</span>
                    <input type="date" value={coreFilters.dueDateTo}
                      onChange={e => setCoreFilters(prev => ({ ...prev, dueDateTo: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                  </div>
                </div>
              </div>
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
              onClick={() => setCreateModal({ domain: activeDomain })}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
            >
              + 新建根节点
            </button>
            <button
              onClick={() => {
                const container = document.querySelector('.react-flow') as HTMLElement;
                const rect = container?.getBoundingClientRect();
                const screenCenter = rect
                  ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
                  : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                const flowPos = screenToFlowPosition(screenCenter);
                const newGB: GroupBox = {
                  id: nextGroupBoxId(),
                  label: '分组',
                  color: '#6366f1',
                  x: flowPos.x - 180,
                  y: flowPos.y - 120,
                  width: 360,
                  height: 240,
                };
                setGroupBoxes(prev => [...prev, newGB]);
                setEditGroupBoxId(newGB.id);
              }}
              className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-xs font-medium px-3 py-2 rounded-xl shadow-sm transition-colors"
              title="在画布上添加一个分组框，框住多个节点"
            >
              ▢ 分组框
            </button>
          </div>
        </Panel>

        {/* 快捷键提示 */}
        <Panel position="bottom-center">
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur border border-gray-200 px-4 py-2 rounded-full shadow-sm text-xs text-gray-500">
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">拖拽</kbd> 移动到目标节点下</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Tab</kbd> 添加子节点</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Enter</kbd> 添加同级</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Del</kbd> 删除</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">双击</kbd> 打开详情</span>
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
          onAddChild={(id: string) => setCreateModal({ parentId: id, domain: activeDomain })}
          onAddSibling={(task: any) => {
            const parentEdge = edgesRef.current.find(ed => ed.target === task.taskId && ed.type === 'treeEdge');
            setCreateModal(parentEdge ? { parentId: parentEdge.source, domain: activeDomain } : { domain: activeDomain });
          }}
          onToggleCollapse={callbacks.onToggleCollapse}
          onDelete={(taskId: string, title: string) => setDeleteConfirm({ taskId, title })}
          onAddLink={(id: string) => setAddLinkModal({ sourceId: id })}
          onOpenDetail={(taskId: string) => setDetailTaskId(taskId)}
          onRename={(taskId: string) => setRenamingId(taskId)}
          onStyleEdit={(taskId: string, title: string) => setStyleModal({ taskId, title })}
          onMakeRoot={(taskId: string) => reparentMut.mutate({ taskId, newParentId: null })}
          onReparent={(taskId: string) => setReparentModal({ taskId })}
        />
      )}

      {/* 创建节点弹窗 */}
      {createModal !== null && (
        <CreateTaskModal
          defaultParentId={createModal.parentId}
          defaultDomain={createModal.domain}
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

      {/* 任务详情悬浮窗 */}
      {detailTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDetailTaskId(null)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl border border-gray-200 shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <TaskDetail taskId={detailTaskId} onClose={() => setDetailTaskId(null)} />
          </div>
        </div>
      )}

      {/* 节点样式设置弹窗 */}
      {styleModal && (
        <NodeStyleModal
          taskId={styleModal.taskId}
          taskTitle={styleModal.title}
          current={nodeStyles[styleModal.taskId] ?? {}}
          onSave={(taskId, style) => {
            setNodeStyles(prev => {
              const next = { ...prev };
              if (style) next[taskId] = style;
              else delete next[taskId];
              return next;
            });
          }}
          onClose={() => setStyleModal(null)}
        />
      )}

      {/* 改父节点弹窗 */}
      {reparentModal && (
        <ReparentModal
          taskId={reparentModal.taskId}
          onClose={() => setReparentModal(null)}
          onConfirm={(targetId) => {
            reparentMut.mutate({ taskId: reparentModal.taskId, newParentId: targetId || null });
            setReparentModal(null);
          }}
        />
      )}

      {/* 分组框编辑弹窗 */}
      {editGroupBoxId && (() => {
        const gb = groupBoxes.find(g => g.id === editGroupBoxId);
        if (!gb) return null;
        return (
          <GroupBoxEditModal
            groupBox={gb}
            onSave={(updated) => setGroupBoxes(prev => prev.map(g => g.id === updated.id ? updated : g))}
            onClose={() => setEditGroupBoxId(null)}
          />
        );
      })()}

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
    <div className="w-full flex-1 min-h-0">
      <ReactFlowProvider>
        <MindMapCanvas />
      </ReactFlowProvider>
    </div>
  );
}
