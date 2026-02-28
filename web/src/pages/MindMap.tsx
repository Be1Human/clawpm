/**
 * 思维导图视图
 * UX 规则：
 *  - 只有根节点（无父节点）可以自由拖拽；拖拽时整个子树跟随移动
 *  - 非根节点位置由自动布局算法决定，不可独立拖拽
 *  - 快捷键：Tab = 添加子节点；Enter = 添加同级节点；Delete = 删除；双击 = 内联改名
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps,
  Handle, Position, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

// ── 布局常量 ──────────────────────────────────────────────────────
const NODE_W  = 190;
const NODE_H  = 64;
const H_GAP   = 72;   // 水平间距（父子之间）
const V_GAP   = 10;   // 垂直间距（兄弟之间）
const ROOT_GAP = 48;  // 不同根树之间的间距

// ── 标签色系 ──────────────────────────────────────────────────────
const LABEL_COLORS: Record<string, { border: string; bg: string; pill: string; text: string }> = {
  epic:    { border: '#8b5cf6', bg: '#faf5ff', pill: '#ede9fe', text: '#7c3aed' },
  feature: { border: '#3b82f6', bg: '#eff6ff', pill: '#dbeafe', text: '#1d4ed8' },
  story:   { border: '#0ea5e9', bg: '#f0f9ff', pill: '#e0f2fe', text: '#0369a1' },
  task:    { border: '#10b981', bg: '#f0fdf4', pill: '#d1fae5', text: '#047857' },
  bug:     { border: '#ef4444', bg: '#fef2f2', pill: '#fee2e2', text: '#b91c1c' },
  spike:   { border: '#f97316', bg: '#fff7ed', pill: '#ffedd5', text: '#c2410c' },
  chore:   { border: '#64748b', bg: '#f8fafc', pill: '#f1f5f9', text: '#475569' },
  subtask: { border: '#94a3b8', bg: '#f8fafc', pill: '#f1f5f9', text: '#64748b' },
};
const DEFAULT_COLORS = LABEL_COLORS.task;

function getLabelColors(task: any) {
  const labels: string[] = (() => {
    try { return JSON.parse(task.labels ?? '[]'); } catch { return []; }
  })();
  const first = labels[0] || task.type || 'task';
  return { colors: LABEL_COLORS[first] ?? DEFAULT_COLORS, labels, firstLabel: first };
}

const STATUS_DOT: Record<string, string> = {
  done: '#10b981', active: '#6366f1', blocked: '#ef4444',
  review: '#f59e0b', planned: '#cbd5e1', cancelled: '#e2e8f0',
};

// ── 自动布局（从左到右的树形） ────────────────────────────────────
function subtreeH(node: any): number {
  const ch = node.children ?? [];
  if (!ch.length) return NODE_H;
  const total = ch.reduce((s: number, c: any, i: number) =>
    s + subtreeH(c) + (i > 0 ? V_GAP : 0), 0);
  return Math.max(NODE_H, total);
}

function computeLayout(roots: any[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();

  function layout(node: any, depth: number, startY: number) {
    const children = node.children ?? [];
    if (!children.length) {
      pos.set(node.taskId, { x: depth * (NODE_W + H_GAP), y: startY });
      return;
    }
    let cy = startY;
    for (const child of children) {
      layout(child, depth + 1, cy);
      cy += subtreeH(child) + V_GAP;
    }
    // 父节点竖向居中于子节点群
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
    rootY += subtreeH(root) + ROOT_GAP;
  }
  return pos;
}

// 用边集合查找某节点的所有后代 ID
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

// 树形数据 → ReactFlow nodes + edges
function buildFlow(treeData: any[], positions: Map<string, { x: number; y: number }>, callbacks: any) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function walk(node: any, isRoot: boolean) {
    nodes.push({
      id: node.taskId,
      type: 'taskNode',
      position: positions.get(node.taskId) ?? { x: 0, y: 0 },
      draggable: isRoot,   // ← 只有根节点可拖拽
      selectable: true,
      data: { task: node, isRoot, ...callbacks },
    });
    for (const child of node.children ?? []) {
      edges.push({
        id: `${node.taskId}→${child.taskId}`,
        source: node.taskId,
        target: child.taskId,
        type: 'mindmapEdge',
        data: {},
      });
      walk(child, false);
    }
  }
  treeData.forEach(root => walk(root, true));
  return { nodes, edges };
}

// ── 自定义边（贝塞尔曲线，连接右侧到左侧） ────────────────────────
import type { EdgeProps } from '@xyflow/react';
function MindMapEdge({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const dx = (targetX - sourceX) * 0.55;
  const d = `M ${sourceX},${sourceY} C ${sourceX + dx},${sourceY} ${targetX - dx},${targetY} ${targetX},${targetY}`;
  return <path d={d} fill="none" stroke="#d1d5db" strokeWidth={1.5} />;
}

// ── 自定义节点 ────────────────────────────────────────────────────
function TaskNode({ data, selected }: NodeProps) {
  const task = (data as any).task;
  const { colors, labels, firstLabel } = getLabelColors(task);
  const isRoot = (data as any).isRoot;

  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function startEdit() { setEditVal(task.title); setEditing(true); }
  function commitEdit() {
    setEditing(false);
    const v = editVal.trim();
    if (v && v !== task.title) (data as any).onRename(task.taskId, v);
  }

  return (
    <div
      className="relative bg-white rounded-xl select-none transition-shadow"
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        border: `2px solid ${selected ? colors.border : '#e2e8f0'}`,
        boxShadow: selected
          ? `0 0 0 3px ${colors.border}30, 0 2px 8px rgba(0,0,0,0.08)`
          : '0 1px 3px rgba(0,0,0,0.06)',
        backgroundColor: selected ? colors.bg : '#fff',
      }}
      onDoubleClick={startEdit}
    >
      {/* 左侧色条（标签色） */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: colors.border }}
      />

      {/* 根节点拖拽把手 */}
      {isRoot && (
        <div
          className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 cursor-grab active:cursor-grabbing"
          title="拖拽整个子树"
        >
          {[0, 1, 2].map(i => (
            <div key={i} className="w-0.5 h-1 bg-gray-300 rounded-full" />
          ))}
        </div>
      )}

      <div className="pl-5 pr-3 pt-2 pb-2">
        {/* 标签 pill */}
        {firstLabel && (
          <span
            className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full mb-1"
            style={{ backgroundColor: colors.pill, color: colors.text }}
          >
            {firstLabel}
            {labels.length > 1 ? ` +${labels.length - 1}` : ''}
          </span>
        )}

        {/* 标题（内联编辑） */}
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={e => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') { setEditing(false); setEditVal(task.title); }
            }}
            className="w-full text-[13px] font-semibold text-gray-800 bg-transparent border-b border-indigo-300 outline-none pb-0.5"
          />
        ) : (
          <p className="text-[13px] font-semibold text-gray-800 leading-snug line-clamp-2">{task.title}</p>
        )}

        {/* 底部 meta */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] font-mono text-gray-400">{task.taskId}</span>
          <div className="flex items-center gap-1.5">
            {task.owner && <span className="text-[10px] text-gray-400">{task.owner}</span>}
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: STATUS_DOT[task.status] ?? '#cbd5e1' }}
              title={task.status}
            />
          </div>
        </div>
      </div>

      {/* 右侧 + 按钮（添加子节点） */}
      <button
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-gray-300 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 flex items-center justify-center text-sm shadow-sm z-10 transition-colors"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); (data as any).onAddChild(task.taskId); }}
        title="添加子节点 (Tab)"
      >
        +
      </button>

      {/* ReactFlow 连接点 */}
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  );
}

const NODE_TYPES = { taskNode: TaskNode };
const EDGE_TYPES = { mindmapEdge: MindMapEdge };

// ── 主画布（在 ReactFlowProvider 内部） ────────────────────────────
function MindMapCanvas() {
  const qc = useQueryClient();

  const { data: treeData = [] } = useQuery({
    queryKey: ['task-tree'],
    queryFn: () => api.getTaskTree(),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<{ parentId: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; title: string } | null>(null);

  // 快照：拖拽开始时各节点坐标
  const dragSnap = useRef(new Map<string, { x: number; y: number }>());
  // 实时边集合（用于查找后代）
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  // 节点数据 map（用于快捷键找父节点）
  const nodeDataMap = useRef(new Map<string, any>());

  // 构建图
  useEffect(() => {
    if (!(treeData as any[]).length) return;
    const positions = computeLayout(treeData as any[]);
    const { nodes: ns, edges: es } = buildFlow(treeData as any[], positions, callbacks);
    // 构建 nodeDataMap
    nodeDataMap.current.clear();
    ns.forEach(n => nodeDataMap.current.set(n.id, (n.data as any).task));
    setNodes(ns);
    setEdges(es);
  }, [treeData]);

  // Mutations
  const renameMut = useMutation({
    mutationFn: ({ taskId, title }: { taskId: string; title: string }) =>
      api.updateTask(taskId, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-tree'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (taskId: string) => api.updateTask(taskId, { status: 'cancelled' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-tree'] }); setDeleteConfirm(null); },
  });

  const callbacks = useMemo(() => ({
    onAddChild: (parentId: string) => setCreateModal({ parentId }),
    onRename: (taskId: string, title: string) => renameMut.mutate({ taskId, title }),
    onDelete: (taskId: string, title: string) => setDeleteConfirm({ taskId, title }),
  }), []);

  // ── 拖拽：父节点移动，子树跟随 ───────────────────────────────
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
      if (n.id === node.id) return n; // RF 已处理拖拽节点本身
      if (descendants.has(n.id)) {
        const ns = dragSnap.current.get(n.id);
        if (!ns) return n;
        return { ...n, position: { x: ns.x + dx, y: ns.y + dy } };
      }
      return n;
    }));
  }, []);

  // ── 键盘快捷键 ────────────────────────────────────────────────
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
        // 添加同级节点：找到父节点，在父节点下创建
        const task = nodeDataMap.current.get(selectedId);
        if (task) {
          const parentEdge = edgesRef.current.find(ed => ed.target === selectedId);
          if (parentEdge) {
            setCreateModal({ parentId: parentEdge.source });
          } else {
            // 根节点 → 创建新根节点（无父）
            setCreateModal({ parentId: '' });
          }
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const task = nodeDataMap.current.get(selectedId);
        if (task) setDeleteConfirm({ taskId: selectedId, title: task.title });
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedId]);

  return (
    <div className="w-full h-full relative">
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
        deleteKeyCode={null}           // 禁用 RF 默认删除，改用自定义
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ backgroundColor: '#f0f2f5' }}
        minZoom={0.15}
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

        {/* 快捷键提示 */}
        <Panel position="bottom-center">
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur border border-gray-200 px-4 py-2 rounded-full shadow-sm text-xs text-gray-500">
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Tab</kbd> 添加子节点</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Enter</kbd> 添加同级</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">Del</kbd> 删除</span>
            <span><kbd className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">双击</kbd> 改名</span>
            <span className="text-gray-300">|</span>
            <span>根节点可自由拖拽，子树跟随</span>
          </div>
        </Panel>
      </ReactFlow>

      {/* 创建节点弹窗 */}
      {createModal !== null && (
        <CreateTaskModal
          defaultParentId={createModal.parentId || undefined}
          onClose={() => {
            setCreateModal(null);
            qc.invalidateQueries({ queryKey: ['task-tree'] });
          }}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">
              将标记 <span className="font-medium text-gray-800">「{deleteConfirm.title}」</span> 为已取消，其子节点也将一并取消。
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
