import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import { useActiveProject } from '../lib/useActiveProject';
import { useCurrentUser } from '../lib/useCurrentUser';
import { sortTreeByPriority } from '@/lib/tree';
import { useI18n } from '@/lib/i18n';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const STATUS_CONFIG: Record<string, { labelKey: string; dot: string; text: string; pill: string; bg: string; border: string }> = {
  backlog: { labelKey: 'status.backlog', dot: 'bg-slate-400',   text: 'text-slate-500',  pill: 'bg-slate-100 text-slate-600', bg: '#f1f5f9', border: '#94a3b8' },
  planned: { labelKey: 'status.planned', dot: 'bg-blue-400',    text: 'text-blue-500',   pill: 'bg-blue-50 text-blue-600', bg: '#dbeafe', border: '#60a5fa' },
  active:  { labelKey: 'status.active',  dot: 'bg-indigo-500',  text: 'text-indigo-500', pill: 'bg-indigo-50 text-indigo-600', bg: '#e0e7ff', border: '#6366f1' },
  review:  { labelKey: 'status.review',  dot: 'bg-amber-500',   text: 'text-amber-500',  pill: 'bg-amber-50 text-amber-600', bg: '#fef3c7', border: '#f59e0b' },
  done:    { labelKey: 'status.done',    dot: 'bg-emerald-500', text: 'text-emerald-500', pill: 'bg-emerald-50 text-emerald-600', bg: '#d1fae5', border: '#10b981' },
};

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#ede9fe', text: '#7c3aed' },
  feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug:     { bg: '#fee2e2', text: '#b91c1c' },
  spike:   { bg: '#ffedd5', text: '#c2410c' },
  chore:   { bg: '#f1f5f9', text: '#475569' },
};

const NEXT_STATUS: Record<string, string> = {
  backlog: 'planned', planned: 'active', active: 'review', review: 'done',
};

const STATUS_ORDER = ['active', 'review', 'planned', 'backlog', 'done'];

type ViewMode = 'tree' | 'flat' | 'mindmap';
const VIEW_STORAGE_KEY = 'clawpm-my-tasks-view';

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function getLabels(node: any): string[] {
  try { return JSON.parse(node.labels || '[]'); } catch { return []; }
}

function buildBreadcrumb(node: any, allNodes: Map<number, any>): string[] {
  const path: string[] = [];
  let current = node;
  while (current?.parentTaskId) {
    const parent = allNodes.get(current.parentTaskId);
    if (parent) { path.unshift(parent.title); current = parent; } else break;
  }
  return path;
}

function collectNodes(nodes: any[], map: Map<number, any>) {
  for (const n of nodes) { map.set(n.id, n); if (n.children?.length) collectNodes(n.children, map); }
}

function countMyNodes(nodes: any[], owner: string): Record<string, number> {
  const counts: Record<string, number> = { active: 0, review: 0, planned: 0, overdue: 0, total: 0 };
  const now = new Date().toISOString().slice(0, 10);
  function walk(list: any[]) {
    for (const n of list) {
      if (n.owner === owner) {
        counts.total++;
        if (n.status === 'active') counts.active++;
        if (n.status === 'review') counts.review++;
        if (n.status === 'planned') counts.planned++;
        if (n.dueDate && n.dueDate < now && n.status !== 'done') counts.overdue++;
      }
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return counts;
}

function flattenMyNodes(nodes: any[], owner: string): any[] {
  const result: any[] = [];
  function walk(list: any[]) {
    for (const n of list) {
      if (n.owner === owner) result.push(n);
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Tree View Components (existing)
// ═══════════════════════════════════════════════════════════════════

function MyTreeNodeRow({
  node, depth, expanded, hasChildren, onToggle, isMine, breadcrumb, onAdvanceStatus, t,
}: {
  node: any; depth: number; expanded: boolean; hasChildren: boolean;
  onToggle: () => void; isMine: boolean; breadcrumb: string[]; onAdvanceStatus: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const labels = getLabels(node);
  const sc = STATUS_CONFIG[node.status] || STATUS_CONFIG.backlog;
  const canAdvance = isMine && NEXT_STATUS[node.status];

  return (
    <div className={cn('transition-all', !isMine && 'opacity-40')}>
      {isMine && breadcrumb.length > 0 && depth === 0 && (
        <div className="flex items-center gap-1 px-3 pt-1" style={{ paddingLeft: `${16 + depth * 22}px` }}>
          {breadcrumb.map((seg, i) => (
            <span key={i} className="text-[10px] text-gray-400">
              {i > 0 && <span className="mx-0.5">{'>'}</span>}
              {seg}
            </span>
          ))}
        </div>
      )}

      <div
        className={cn(
          'group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors relative',
          isMine ? 'hover:bg-indigo-50/50' : 'hover:bg-gray-50/50'
        )}
        style={{ paddingLeft: `${12 + depth * 22}px` }}
      >
        {isMine && (
          <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-indigo-500" />
        )}

        <button
          onClick={onToggle}
          className={cn(
            'w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 transition-transform text-xs cursor-pointer',
            !hasChildren && 'invisible',
            expanded && 'rotate-90'
          )}
        >
          ▶
        </button>

        <div className={cn('w-2 h-2 rounded-full flex-shrink-0', sc.dot)} />

        {labels.slice(0, 2).map((l: string) => {
          const c = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
          return (
            <span key={l} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: c.bg, color: c.text }}>
              {l}
            </span>
          );
        })}

        <Link
          to={`/tasks/${node.taskId}`}
          className={cn(
            'flex-1 text-sm truncate min-w-0 transition-colors',
            isMine ? 'text-gray-900 hover:text-indigo-600 font-medium' : 'text-gray-400'
          )}
        >
          {node.title}
        </Link>

        <span className="text-xs font-mono text-gray-400 flex-shrink-0">{node.taskId}</span>

        {isMine && node.owner && (
          <span className="text-[10px] text-gray-400 flex-shrink-0">{node.owner}</span>
        )}

        <span className={cn('text-xs flex-shrink-0 w-14 text-right', sc.text)}>
          {t(sc.labelKey)}
        </span>

        {isMine && (
          <div className="flex items-center gap-1.5 flex-shrink-0 w-16">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', node.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
                style={{ width: `${node.progress}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-400 w-7 text-right">{node.progress}%</span>
          </div>
        )}

        {canAdvance && (
          <button
            onClick={e => { e.stopPropagation(); onAdvanceStatus(); }}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-indigo-500 hover:bg-indigo-100 transition-all cursor-pointer"
            title={t('myTasks.advanceTo', { status: t(STATUS_CONFIG[NEXT_STATUS[node.status]]?.labelKey) })}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7h8M8 4l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function MyTreeNode({
  node, depth = 0, currentUser, allNodesMap, onAdvanceStatus, t,
}: {
  node: any; depth?: number; currentUser: string; allNodesMap: Map<number, any>;
  onAdvanceStatus: (taskId: string, nextStatus: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [expanded, setExpanded] = useState(true);
  const children: any[] = node.children || [];
  const hasChildren = children.length > 0;
  const isMine = node.owner === currentUser;
  const breadcrumb = isMine ? buildBreadcrumb(node, allNodesMap) : [];

  return (
    <div>
      <MyTreeNodeRow
        node={node} depth={depth} expanded={expanded} hasChildren={hasChildren}
        onToggle={() => setExpanded(v => !v)}
        isMine={isMine}
        breadcrumb={breadcrumb}
        onAdvanceStatus={() => {
          const next = NEXT_STATUS[node.status];
          if (next) onAdvanceStatus(node.taskId, next);
        }}
        t={t}
      />
      {expanded && hasChildren && (
        <div>
          {children.map((child: any) => (
            <MyTreeNode key={child.id} node={child} depth={depth + 1}
              currentUser={currentUser} allNodesMap={allNodesMap}
              onAdvanceStatus={onAdvanceStatus} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function MyTasksTreeView({
  tree, currentUser, allNodesMap, onAdvanceStatus, isLoading, t,
}: {
  tree: any[]; currentUser: string; allNodesMap: Map<number, any>;
  onAdvanceStatus: (taskId: string, nextStatus: string) => void; isLoading: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2">
      {isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
      ) : tree.length === 0 ? (
        <EmptyState currentUser={currentUser} t={t} />
      ) : (
        tree.map((node: any) => (
            <MyTreeNode
              key={node.id}
              node={node}
              depth={0}
              currentUser={currentUser}
              allNodesMap={allNodesMap}
              onAdvanceStatus={onAdvanceStatus}
              t={t}
            />
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Flat View (NEW - grouped by status)
// ═══════════════════════════════════════════════════════════════════

function MyTasksFlatView({
  tree, currentUser, onAdvanceStatus, isLoading, t,
}: {
  tree: any[]; currentUser: string;
  onAdvanceStatus: (taskId: string, nextStatus: string) => void; isLoading: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const myNodes = useMemo(() => flattenMyNodes(tree, currentUser), [tree, currentUser]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['done']));

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const s of STATUS_ORDER) map[s] = [];
    for (const n of myNodes) {
      const s = n.status || 'backlog';
      if (!map[s]) map[s] = [];
      map[s].push(n);
    }
    return map;
  }, [myNodes]);

  const toggleGroup = (status: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  };

  if (isLoading) return <div className="py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>;
  if (myNodes.length === 0) return <EmptyState currentUser={currentUser} t={t} />;

  return (
    <div className="space-y-4">
      {STATUS_ORDER.map(status => {
        const items = grouped[status] || [];
        const sc = STATUS_CONFIG[status] || STATUS_CONFIG.backlog;
        const collapsed = collapsedGroups.has(status);

        return (
          <div key={status} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleGroup(status)}
              className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer"
            >
              <span className={cn('text-xs transition-transform', collapsed ? '' : 'rotate-90')}>▶</span>
              <div className={cn('w-2.5 h-2.5 rounded-full', sc.dot)} />
              <span className="text-sm font-semibold text-gray-800">{t(sc.labelKey)}</span>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', sc.pill)}>{items.length}</span>
            </button>

            {!collapsed && items.length > 0 && (
              <div className={cn('border-t border-gray-100', status === 'done' && 'opacity-60')}>
                {items.map(node => (
                  <FlatTaskCard key={node.id} node={node} onAdvanceStatus={onAdvanceStatus} t={t} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FlatTaskCard({ node, onAdvanceStatus, t }: { node: any; onAdvanceStatus: (taskId: string, nextStatus: string) => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const labels = getLabels(node);
  const canAdvance = NEXT_STATUS[node.status];
  const now = new Date().toISOString().slice(0, 10);
  const isOverdue = node.dueDate && node.dueDate < now && node.status !== 'done';

  return (
    <Link
      to={`/tasks/${node.taskId}`}
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-indigo-50/30 transition-colors"
    >
      <span className="text-xs font-mono text-gray-400 w-16 flex-shrink-0">{node.taskId}</span>

      {labels.slice(0, 2).map((l: string) => {
        const c = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
        return (
          <span key={l} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: c.bg, color: c.text }}>
            {l}
          </span>
        );
      })}

      <span className="flex-1 text-sm text-gray-800 truncate min-w-0 group-hover:text-indigo-600 transition-colors">
        {node.title}
      </span>

      {node.dueDate && (
        <span className={cn('text-xs flex-shrink-0', isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
          {isOverdue && '! '}{node.dueDate}
        </span>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0 w-16">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', node.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
            style={{ width: `${node.progress}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400 w-7 text-right">{node.progress}%</span>
      </div>

      {canAdvance && (
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onAdvanceStatus(node.taskId, NEXT_STATUS[node.status]); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-indigo-500 hover:bg-indigo-100 transition-all cursor-pointer"
          title={t('myTasks.advanceTo', { status: t(STATUS_CONFIG[NEXT_STATUS[node.status]]?.labelKey) })}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7h8M8 4l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MindMap View (ReactFlow mind map — tree layout)
// ═══════════════════════════════════════════════════════════════════

const MM_NODE_W = 200;
const MM_NODE_H = 64;
const MM_H_GAP = 72;
const MM_V_GAP = 16;
const MM_ROOT_GAP = 40;

// ── Layout algorithm (supports collapse) ────────────────────────────

type MmFilterFn = (node: any) => boolean;
const MM_ALWAYS_VISIBLE: MmFilterFn = () => true;

function mmVisibleChildren(node: any, collapsed: Set<string>, isVisible: MmFilterFn = MM_ALWAYS_VISIBLE): any[] {
  if (collapsed.has(node.taskId)) return [];
  return (node.children || []).filter((c: any) => isVisible(c));
}

function mmExtentAbove(node: any, collapsed: Set<string>, isVisible: MmFilterFn = MM_ALWAYS_VISIBLE): number {
  const children = mmVisibleChildren(node, collapsed, isVisible);
  if (!children.length) return MM_NODE_H / 2;
  const gaps = (children.length - 1) * MM_V_GAP;
  const childHeights = children.map((c: any) => mmExtentAbove(c, collapsed, isVisible) + mmExtentBelow(c, collapsed, isVisible));
  const totalChildrenH = childHeights.reduce((a: number, b: number) => a + b, 0) + gaps;
  return Math.max(MM_NODE_H / 2, totalChildrenH / 2);
}

function mmExtentBelow(node: any, collapsed: Set<string>, isVisible: MmFilterFn = MM_ALWAYS_VISIBLE): number {
  const children = mmVisibleChildren(node, collapsed, isVisible);
  if (!children.length) return MM_NODE_H / 2;
  const gaps = (children.length - 1) * MM_V_GAP;
  const childHeights = children.map((c: any) => mmExtentAbove(c, collapsed, isVisible) + mmExtentBelow(c, collapsed, isVisible));
  const totalChildrenH = childHeights.reduce((a: number, b: number) => a + b, 0) + gaps;
  return Math.max(MM_NODE_H / 2, totalChildrenH / 2);
}

function mmSubtreeH(node: any, collapsed: Set<string>, isVisible: MmFilterFn = MM_ALWAYS_VISIBLE): number {
  return mmExtentAbove(node, collapsed, isVisible) + mmExtentBelow(node, collapsed, isVisible);
}

function mmComputeLayout(roots: any[], collapsed: Set<string>, isVisible: MmFilterFn = MM_ALWAYS_VISIBLE): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  function layout(node: any, depth: number, centerY: number) {
    const children = mmVisibleChildren(node, collapsed, isVisible);
    pos.set(node.taskId, { x: depth * (MM_NODE_W + MM_H_GAP), y: centerY - MM_NODE_H / 2 });

    if (!children.length) return;

    const childExtents = children.map((c: any) => ({
      above: mmExtentAbove(c, collapsed, isVisible),
      below: mmExtentBelow(c, collapsed, isVisible),
    }));

    const totalH = childExtents.reduce((s: number, e: any) => s + e.above + e.below, 0)
      + (children.length - 1) * MM_V_GAP;

    let cy = centerY - totalH / 2 + childExtents[0].above;

    for (let i = 0; i < children.length; i++) {
      layout(children[i], depth + 1, cy);
      if (i < children.length - 1) {
        cy += childExtents[i].below + MM_V_GAP + childExtents[i + 1].above;
      }
    }
  }

  const visibleRoots = roots.filter(r => isVisible(r));
  let topY = 0;
  for (const root of visibleRoots) {
    const above = mmExtentAbove(root, collapsed, isVisible);
    layout(root, 1, topY + above);
    topY += mmSubtreeH(root, collapsed, isVisible) + MM_ROOT_GAP;
  }

  // Center virtual root node
  if (visibleRoots.length > 0) {
    const positions = [...pos.values()];
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y + MM_NODE_H));
    pos.set('__root__', { x: -MM_NODE_W - MM_H_GAP, y: (minY + maxY) / 2 - 28 });
  } else {
    pos.set('__root__', { x: 0, y: 0 });
  }

  return pos;
}

// ── Personal mind map filters ────────────────────────────────────
interface MmFilters {
  status: Set<string>;
  priority: Set<string>;
  label: string;
  search: string;
  dueDateFrom: string;
  dueDateTo: string;
}

const EMPTY_MM_FILTERS: MmFilters = {
  status: new Set(), priority: new Set(), label: '', search: '', dueDateFrom: '', dueDateTo: '',
};

function hasMmFilters(f: MmFilters): boolean {
  return f.status.size > 0 || f.priority.size > 0 || !!f.label || !!f.search || !!f.dueDateFrom || !!f.dueDateTo;
}

function mmNodeMatches(node: any, f: MmFilters): boolean {
  if (f.status.size > 0 && !f.status.has(node.status)) return false;
  if (f.priority.size > 0 && !f.priority.has(node.priority)) return false;
  if (f.label) {
    const labels = getLabels(node);
    if (!labels.includes(f.label)) return false;
  }
  if (f.search) {
    const q = f.search.toLowerCase();
    const titleMatch = (node.title || '').toLowerCase().includes(q);
    const idMatch = (node.taskId || '').toLowerCase().includes(q);
    if (!titleMatch && !idMatch) return false;
  }
  if (f.dueDateFrom && (!node.dueDate || node.dueDate < f.dueDateFrom)) return false;
  if (f.dueDateTo && (!node.dueDate || node.dueDate > f.dueDateTo)) return false;
  return true;
}

function mmHasVisibleDescendant(node: any, f: MmFilters): boolean {
  if (mmNodeMatches(node, f)) return true;
  for (const child of node.children ?? []) {
    if (mmHasVisibleDescendant(child, f)) return true;
  }
  return false;
}

// ── Bezier tree edge ─────────────────────────────────────────────

function MyMindMapTreeEdge({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const dx = (targetX - sourceX) * 0.5;
  const d = `M ${sourceX},${sourceY} C ${sourceX + dx},${sourceY} ${targetX - dx},${targetY} ${targetX},${targetY}`;
  return <path d={d} fill="none" stroke="#c7d2fe" strokeWidth={2} />;
}

// ── Progress ring ────────────────────────────────────────────────

function MmProgressRing({ progress, size = 20 }: { progress: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = Math.PI * 2 * r;
  const filled = (progress / 100) * c;
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={2.5} />
      {progress > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={progress >= 100 ? '#10b981' : '#6366f1'}
          strokeWidth={2.5}
          strokeDasharray={`${filled} ${c - filled}`}
          strokeDashoffset={c / 4}
          strokeLinecap="round"
        />
      )}
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fontSize={6} fontWeight="700" fill="#6b7280">
        {progress}
      </text>
    </svg>
  );
}

// ── Virtual root node ────────────────────────────────────────────

function MmRootNode({ data }: NodeProps) {
  return (
    <div
      className="flex items-center justify-center rounded-xl select-none"
      style={{
        width: MM_NODE_W,
        height: 56,
        background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
        border: '2px solid #4338ca',
        boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
      }}
    >
      <span className="text-sm font-bold text-white">{(data as any).label}</span>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}

// ── Task node ────────────────────────────────────────────────────

function MmTaskNode({ data, selected }: NodeProps) {
  const task = (data as any).task;
  const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.backlog;
  const labels = getLabels(task);
  const progress = task.progress ?? 0;
  const isMine = (data as any).isMine;
  const isFocused = (data as any).isFocused;
  const isCollapsed = (data as any).isCollapsed;
  const hasChildren = (task.children ?? []).length > 0;
  const onToggleCollapse = (data as any).onToggleCollapse;

  return (
    <div
      className={cn(
        'relative rounded-xl select-none transition-all',
        !isMine && 'opacity-50',
        isFocused && 'ring-2 ring-indigo-500 ring-offset-2 animate-pulse',
      )}
      style={{
        width: MM_NODE_W,
        minHeight: MM_NODE_H,
        border: `2px solid ${isFocused ? '#6366f1' : selected ? sc.border : isMine ? sc.border : '#e2e8f0'}`,
        boxShadow: isFocused
          ? '0 0 0 4px rgba(99,102,241,0.2), 0 4px 16px rgba(99,102,241,0.25)'
          : selected
            ? `0 0 0 3px ${sc.border}28, 0 4px 12px rgba(0,0,0,0.1)`
            : '0 1px 4px rgba(0,0,0,0.06)',
        backgroundColor: isMine ? sc.bg : '#fafafa',
        cursor: 'pointer',
        overflow: 'visible',
      }}
    >
      {/* Left color bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: sc.border }} />

      <div className="pl-4 pr-8 py-2">
        {/* Labels */}
        {labels.length > 0 && (
          <div className="flex items-center gap-1 mb-1">
            {labels.slice(0, 2).map((l: string) => {
              const lc = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
              return (
                <span key={l} className="text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded-full"
                  style={{ backgroundColor: lc.bg, color: lc.text }}>
                  {l}
                </span>
              );
            })}
          </div>
        )}

        {/* Title */}
        <p className="text-[12px] font-semibold text-gray-800 leading-snug line-clamp-2">{task.title}</p>

        {/* Bottom meta */}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] font-mono text-indigo-400">{task.taskId}</span>
          <div className="flex items-center gap-1.5">
            {(task.assignee || task.owner) && <span className="text-[10px] text-gray-400 truncate max-w-[50px]" title={task.assignee ? `处理人: ${task.assignee}` : `负责人: ${task.owner}`}>{task.assignee || task.owner}</span>}
            <div className={cn('w-2 h-2 rounded-full', sc.dot)} />
          </div>
        </div>
      </div>

      {/* Progress ring */}
      <div className="absolute right-1.5 bottom-1.5">
        <MmProgressRing progress={progress} size={20} />
      </div>

      {/* Right: collapse/expand button */}
      {hasChildren && (
        <button
          className="nopan nodrag nowheel absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-indigo-600 hover:border-indigo-400 flex items-center justify-center text-[11px] shadow-sm z-10 transition-colors cursor-pointer"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleCollapse?.(task.taskId); }}
          title={isCollapsed ? `${(data as any).expandLabel} (${task.children.length})` : (data as any).collapseLabel}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>
      )}

      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}

const MM_NODE_TYPES = { rootNode: MmRootNode, taskNode: MmTaskNode };
const MM_EDGE_TYPES = { treeEdge: MyMindMapTreeEdge };

function buildMyMindMapFlow(
  tree: any[], currentUser: string, collapsed: Set<string>,
  onToggleCollapse: (taskId: string) => void,
  focusNodeId?: string | null, filters: MmFilters = EMPTY_MM_FILTERS,
  t?: (key: string, vars?: Record<string, string | number>) => string,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const hasFilters = hasMmFilters(filters);
  const isVisible: MmFilterFn = hasFilters
    ? (node: any) => mmHasVisibleDescendant(node, filters)
    : MM_ALWAYS_VISIBLE;
  const positions = mmComputeLayout(tree, collapsed, isVisible);

  // Virtual root node
  const rootPos = positions.get('__root__') || { x: 0, y: 0 };
  nodes.push({
    id: '__root__',
    type: 'rootNode',
    position: rootPos,
    data: { label: currentUser },
    draggable: false,
    selectable: false,
  });

  function walk(node: any, parentId: string) {
    if (hasFilters && !mmHasVisibleDescendant(node, filters)) return;
    const id = node.taskId;
    const pos = positions.get(id) || { x: 0, y: 0 };

    nodes.push({
      id,
      type: 'taskNode',
      position: pos,
      data: {
        task: node,
        isMine: node.owner === currentUser,
        isCollapsed: collapsed.has(id),
        isFocused: focusNodeId === id,
        onToggleCollapse,
        expandLabel: t ? t('myTasks.expand', { count: (node.children ?? []).length }) : 'Expand',
        collapseLabel: t ? t('myTasks.collapse') : 'Collapse',
      },
      draggable: false,
    });

    edges.push({
      id: `e-${parentId}-${id}`,
      source: parentId,
      target: id,
      type: 'treeEdge',
    });

    if (!collapsed.has(id)) {
      for (const child of node.children || []) {
        if (hasFilters && !mmHasVisibleDescendant(child, filters)) continue;
        walk(child, id);
      }
    }
  }

  for (const root of tree) {
    if (hasFilters && !mmHasVisibleDescendant(root, filters)) continue;
    walk(root, '__root__');
  }

  return { nodes, edges };
}

function MyTasksMindMapCanvas({
  tree, currentUser, isLoading, focusNodeId, t,
}: {
  tree: any[]; currentUser: string; isLoading: boolean; focusNodeId?: string | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const navigate = useNavigate();
  const { fitView, setCenter } = useReactFlow();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<MmFilters>({ ...EMPTY_MM_FILTERS, status: new Set(), priority: new Set() });
  const [showFilters, setShowFilters] = useState(false);

  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  // Collapse/expand callback (passed to node buttons)
  const onToggleCollapse = useCallback((taskId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  // Collect all labels from tree data
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    function collect(node: any) {
      const labels = getLabels(node);
      labels.forEach(l => set.add(l));
      for (const child of node.children ?? []) collect(child);
    }
    tree.forEach(collect);
    return [...set].sort();
  }, [tree]);

  // Rebuild flow and position when tree / collapsed / filters / focusNodeId change
  useEffect(() => {
    if (!tree.length) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: ns, edges: es } = buildMyMindMapFlow(tree, currentUser, collapsed, onToggleCollapse, focusNodeId, filters, t);
    setNodes(ns);
    setEdges(es);

    const timer = setTimeout(() => {
      if (focusNodeId) {
        const focusNode = ns.find(n => n.id === focusNodeId);
        if (focusNode) {
          setCenter(
            focusNode.position.x + MM_NODE_W / 2,
            focusNode.position.y + MM_NODE_H / 2,
            { zoom: 1.2, duration: 400 },
          );
          return;
        }
      }
      fitView({ padding: 0.25, duration: 200 });
    }, 50);
    return () => clearTimeout(timer);
  }, [tree, currentUser, collapsed, focusNodeId, filters, onToggleCollapse, setNodes, setEdges, fitView, setCenter]);

  const onNodeClick = useCallback((_: any, node: Node) => {
    // Click: navigate to task detail
    if (node.id === '__root__') return;
    const task = (node.data as any)?.task;
    if (task?.taskId) navigate(`/tasks/${task.taskId}`);
  }, [navigate]);

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    // Double-click: collapse/expand
    if (node.id === '__root__') return;
    const task = (node.data as any)?.task;
    if (task?.taskId && (task.children ?? []).length > 0) {
      onToggleCollapse(task.taskId);
    }
  }, [onToggleCollapse]);

  const activeFilterCount = (filters.status.size > 0 ? 1 : 0) + (filters.priority.size > 0 ? 1 : 0)
    + (filters.label ? 1 : 0) + (filters.search ? 1 : 0)
    + (filters.dueDateFrom ? 1 : 0) + (filters.dueDateTo ? 1 : 0);

  if (isLoading) return <div className="py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>;
  if (!tree.length) return <EmptyState currentUser={currentUser} t={t} />;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={MM_NODE_TYPES}
        edgeTypes={MM_EDGE_TYPES}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.15}
        maxZoom={2}
        style={{ backgroundColor: '#f8f9fc' }}
        deleteKeyCode={null}
      >
        <Background color="#e0e4eb" gap={24} />
        <Controls className="!bg-white !border-gray-200 !rounded-xl !shadow-sm" showInteractive={false} />
        <MiniMap
          nodeColor={n => {
            if (n.id === '__root__') return '#6366f1';
            const task = (n.data as any)?.task;
            const sc = STATUS_CONFIG[task?.status] || STATUS_CONFIG.backlog;
            return sc.border;
          }}
          className="!bg-white !border-gray-200 !rounded-xl !shadow-sm"
          pannable
          zoomable
        />

        {/* Filter toggle button */}
        <Panel position="top-right">
          <div className="flex flex-col gap-2 items-end">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium shadow-sm border transition-all',
                showFilters || activeFilterCount > 0
                  ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              )}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1.5 3h11M3.5 7h7M5.5 11h3" strokeLinecap="round" />
              </svg>
              {t('myTasks.filterLabel')}
              {activeFilterCount > 0 && (
                <span className="bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>
              )}
            </button>

            {/* Filter panel */}
            {showFilters && (
              <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-lg px-4 py-3 w-64">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-700">{t('myTasks.filterConditions')}</p>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => setFilters({ ...EMPTY_MM_FILTERS, status: new Set(), priority: new Set() })}
                      className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {t('myTasks.clearAll')}
                    </button>
                  )}
                </div>
                <div className="space-y-3 max-h-[420px] overflow-y-auto">
                  {/* Search */}
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">{t('myTasks.searchLabel')}</label>
                    <input
                      type="text"
                      value={filters.search}
                      onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                      placeholder={t('myTasks.searchPlaceholder')}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1.5 block">{t('myTasks.statusLabel')}</label>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(STATUS_CONFIG).map(([s, cfg]) => {
                        const on = filters.status.has(s);
                        return (
                          <button key={s} onClick={() => setFilters(prev => {
                            const next = new Set(prev.status);
                            on ? next.delete(s) : next.add(s);
                            return { ...prev, status: next };
                          })}
                            className={cn('flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all',
                              on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-500 border-gray-100 hover:text-gray-700')}
                          >
                            <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                            {t(cfg.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1.5 block">{t('myTasks.priorityLabel')}</label>
                    <div className="flex flex-wrap gap-1">
                      {['P0', 'P1', 'P2', 'P3'].map(p => {
                        const on = filters.priority.has(p);
                        const pColor: Record<string, string> = { P0: '#ef4444', P1: '#f97316', P2: '#3b82f6', P3: '#94a3b8' };
                        return (
                          <button key={p} onClick={() => setFilters(prev => {
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

                  {/* Labels */}
                  {allLabels.length > 0 && (
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1.5 block">{t('myTasks.labelsLabel')}</label>
                      <div className="flex flex-wrap gap-1">
                        {allLabels.map(l => {
                          const on = filters.label === l;
                          const lc = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
                          return (
                            <button key={l} onClick={() => setFilters(prev => ({ ...prev, label: on ? '' : l }))}
                              className={cn('text-[10px] px-2 py-1 rounded-full border transition-all',
                                on ? 'border-indigo-200' : 'border-gray-100 hover:text-gray-600')}
                              style={on ? { backgroundColor: lc.bg, color: lc.text, borderColor: `${lc.text}40` } : { color: lc.text, backgroundColor: `${lc.bg}60` }}
                            >
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Due Date */}
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1.5 block">{t('myTasks.dueDateLabel')}</label>
                    <div className="flex items-center gap-1">
                      <input type="date" value={filters.dueDateFrom}
                        onChange={e => setFilters(prev => ({ ...prev, dueDateFrom: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                      <span className="text-[10px] text-gray-400">~</span>
                      <input type="date" value={filters.dueDateTo}
                        onChange={e => setFilters(prev => ({ ...prev, dueDateTo: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-1.5 py-1 text-[10px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>

        {/* Shortcut hints */}
        <Panel position="bottom-center">
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur border border-gray-200 px-4 py-2 rounded-full shadow-sm text-xs text-gray-500">
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Click</kbd> {t('myTasks.clickDetail')}</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Dbl</kbd> {t('myTasks.dblClickCollapse')}</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">▶ ▼</kbd> {t('myTasks.btnCollapse')}</span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

function MyTasksMindMapView({
  tree, currentUser, isLoading, focusNodeId, t,
}: {
  tree: any[]; currentUser: string; isLoading: boolean; focusNodeId?: string | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <ReactFlowProvider>
      <MyTasksMindMapCanvas tree={tree} currentUser={currentUser} isLoading={isLoading} focusNodeId={focusNodeId} t={t} />
    </ReactFlowProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════════════════════════

function EmptyState({ currentUser, t }: { currentUser: string; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="py-16 text-center">
      <div className="mb-4 opacity-20">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-gray-400">
          <circle cx="24" cy="10" r="5" />
          <circle cx="10" cy="34" r="5" />
          <circle cx="38" cy="34" r="5" />
          <path d="M24 15v6M24 21l-12 8M24 21l12 8" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-gray-500 text-sm">{t('myTasks.noTasks')}</p>
      <p className="text-gray-400 text-xs mt-1">{t('myTasks.noTasksHint', { user: currentUser })}</p>
    </div>
  );
}

function StatPill({ label, count, color, dotColor }: { label: string; count: number; color: string; dotColor: string }) {
  return (
    <div className={cn('inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm font-medium transition-all', color)}>
      <div className={cn('w-2 h-2 rounded-full', dotColor)} />
      <span>{label}</span>
      <span className="font-bold">{count}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// View Switch Icons
// ═══════════════════════════════════════════════════════════════════

function FlatIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
    </svg>
  );
}

function TreeIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M4 2v12M4 4h4M4 8h6M4 12h3" strokeLinecap="round" />
      <circle cx="10" cy="4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MindMapIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <circle cx="8" cy="8" r="2.5" />
      <circle cx="3" cy="3" r="1.5" />
      <circle cx="13" cy="3" r="1.5" />
      <circle cx="3" cy="13" r="1.5" />
      <circle cx="13" cy="13" r="1.5" />
      <path d="M6 6.5L4 4M10 6.5l2-2M6 9.5L4 12M10 9.5l2 2" strokeLinecap="round" />
    </svg>
  );
}

const VIEW_OPTIONS: { mode: ViewMode; labelKey: string; Icon: typeof FlatIcon }[] = [
  { mode: 'flat', labelKey: 'myTasks.viewFlat', Icon: FlatIcon },
  { mode: 'tree', labelKey: 'myTasks.viewTree', Icon: TreeIcon },
  { mode: 'mindmap', labelKey: 'myTasks.viewMindmap', Icon: MindMapIcon },
];

// ═══════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════

export default function MyTasks({ defaultView = 'tree' }: { defaultView?: ViewMode }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const currentUser = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const focusNodeId = searchParams.get('focus');
  const viewMode = defaultView;

  // Clear focus param animate-pulse (stop highlight animation after 3s)
  useEffect(() => {
    if (!focusNodeId) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      next.delete('view');
      setSearchParams(next, { replace: true });
    }, 4000);
    return () => clearTimeout(timer);
  }, [focusNodeId]);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['my-task-tree', activeProject, currentUser],
    queryFn: () => api.getTaskTree(currentUser ? { owner: currentUser } : undefined),
    enabled: !!currentUser,
  });

  const advanceMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.updateTask(taskId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-task-tree'] });
    },
  });

  const sortedTree = useMemo(() => sortTreeByPriority(tree as any[]), [tree]);

  const allNodesMap = new Map<number, any>();
  collectNodes(sortedTree as any[], allNodesMap);

  const counts = currentUser ? countMyNodes(sortedTree as any[], currentUser) : { active: 0, review: 0, planned: 0, overdue: 0, total: 0 };

  const handleAdvance = (taskId: string, status: string) => advanceMut.mutate({ taskId, status });

  if (!currentUser) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-20">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-gray-400">
              <circle cx="32" cy="24" r="12" />
              <path d="M10 56c0-12.15 9.85-22 22-22s22 9.85 22 22" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">{t('myTasks.selectIdentity')}</p>
          <p className="text-gray-400 text-xs mt-1">{t('myTasks.selectIdentityHint')}</p>
        </div>
      </div>
    );
  }

  const VIEW_TITLE_KEYS: Record<ViewMode, string> = {
    flat: 'myTasks.viewTitleFlat', tree: 'myTasks.viewTitleTree', mindmap: 'nav.mindMap',
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t(VIEW_TITLE_KEYS[viewMode])}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {t('myTasks.subtreeInfo', { user: currentUser, count: counts.total })}
          </p>
        </div>
      </div>

      {/* Stats pills */}
      <div className="flex items-center gap-2.5 mb-5">
        <StatPill label={t('myTasks.statInProgress')} count={counts.active} color="bg-indigo-50 text-indigo-700 border-indigo-200" dotColor="bg-indigo-500" />
        <StatPill label={t('myTasks.statReview')} count={counts.review} color="bg-amber-50 text-amber-700 border-amber-200" dotColor="bg-amber-500" />
        <StatPill label={t('myTasks.statPlanned')} count={counts.planned} color="bg-blue-50 text-blue-700 border-blue-200" dotColor="bg-blue-400" />
        <StatPill label={t('myTasks.statOverdue')} count={counts.overdue} color="bg-red-50 text-red-700 border-red-200" dotColor="bg-red-500" />
      </div>

      {/* View Content */}
      {viewMode === 'tree' && (
        <MyTasksTreeView
          tree={sortedTree as any[]}
          currentUser={currentUser}
          allNodesMap={allNodesMap}
          onAdvanceStatus={handleAdvance}
          isLoading={isLoading}
          t={t}
        />
      )}

      {viewMode === 'flat' && (
        <MyTasksFlatView
          tree={sortedTree as any[]}
          currentUser={currentUser}
          onAdvanceStatus={handleAdvance}
          isLoading={isLoading}
          t={t}
        />
      )}

      {viewMode === 'mindmap' && (
        <MyTasksMindMapView
          tree={sortedTree as any[]}
          currentUser={currentUser}
          isLoading={isLoading}
          focusNodeId={focusNodeId}
          t={t}
        />
      )}
    </div>
  );
}
