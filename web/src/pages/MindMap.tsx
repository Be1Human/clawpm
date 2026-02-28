import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type NodeProps, Handle, Position,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import CreateTaskModal from '@/components/CreateTaskModal';

// ── 类型配置 ───────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: string; border: string; bg: string; text: string; accent: string }> = {
  epic:    { icon: '◈', border: 'border-violet-200', bg: 'bg-violet-50',   text: 'text-violet-700', accent: 'bg-violet-500' },
  story:   { icon: '◎', border: 'border-blue-200',   bg: 'bg-blue-50',     text: 'text-blue-700',   accent: 'bg-blue-500' },
  task:    { icon: '◻', border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', accent: 'bg-emerald-500' },
  subtask: { icon: '○', border: 'border-gray-200',    bg: 'bg-gray-50',    text: 'text-gray-500',   accent: 'bg-gray-400' },
};
const STATUS_DOT: Record<string, string> = {
  done: 'bg-emerald-500', active: 'bg-indigo-500', blocked: 'bg-red-500',
  review: 'bg-amber-500', planned: 'bg-gray-300',
};
const CHILD_TYPE: Record<string, string> = { epic: 'story', story: 'task', task: 'subtask' };

// ── 自定义节点 ─────────────────────────────────────────────────────
function TaskNode({ data, selected }: NodeProps) {
  const task = (data as any).task;
  const type = task.type || 'task';
  const conf = TYPE_CONFIG[type] || TYPE_CONFIG.task;
  const childType = CHILD_TYPE[type];
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[240px] rounded-xl border bg-white shadow-sm transition-all cursor-default',
        conf.border,
        selected ? 'ring-2 ring-indigo-400 ring-offset-1' : ''
      )}
      onContextMenu={e => { e.preventDefault(); setShowMenu(v => !v); }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-gray-300 !border-gray-200" />

      {/* 顶部色块条 */}
      <div className={cn('h-1 rounded-t-xl', conf.accent)} />

      <div className="px-3 pt-2 pb-2.5">
        {/* 头部：图标 + ID + 状态 */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs font-medium', conf.text)}>{conf.icon}</span>
            <span className="text-[10px] font-mono text-gray-400">{task.taskId}</span>
          </div>
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[task.status] || 'bg-gray-300')} />
        </div>

        {/* 标题 */}
        <p className="text-sm text-gray-800 leading-snug line-clamp-2 mb-2 font-medium">{task.title}</p>

        {/* 进度条 */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', task.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 w-7 text-right">{task.progress}%</span>
        </div>
      </div>

      {/* 添加子节点按钮 */}
      {childType && (
        <button
          onClick={() => (data as any).onAddChild(task.taskId, type)}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center text-sm transition-all z-10 shadow-sm"
          title={`添加${type === 'epic' ? '用户故事' : type === 'story' ? '任务' : '子任务'}`}
        >
          +
        </button>
      )}

      {/* 右键菜单 */}
      {showMenu && (
        <div
          className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 min-w-[140px]"
          onMouseLeave={() => setShowMenu(false)}
        >
          {childType && (
            <button
              className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
              onClick={() => { (data as any).onAddChild(task.taskId, type); setShowMenu(false); }}
            >
              + 添加子节点
            </button>
          )}
          <button
            className="w-full text-left text-xs px-3 py-2 hover:bg-gray-50 text-gray-700"
            onClick={() => { window.open(`/tasks/${task.taskId}`, '_blank'); setShowMenu(false); }}
          >
            查看详情 ↗
          </button>
          <hr className="border-gray-100 my-1" />
          <button
            className="w-full text-left text-xs px-3 py-2 hover:bg-red-50 text-red-500"
            onClick={() => { (data as any).onDelete(task.taskId, task.title); setShowMenu(false); }}
          >
            删除节点
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-gray-300 !border-gray-200" />
    </div>
  );
}

const NODE_TYPES = { taskNode: TaskNode };

// ── 自动布局（dagre）────────────────────────────────────────────────
function layoutGraph(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(n => g.setNode(n.id, { width: 220, height: 100 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 110, y: pos.y - 50 } };
  });
}

// ── 将树形数据转为 nodes + edges ───────────────────────────────────
function treeToFlow(tree: any[], callbacks: any): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  function walk(node: any) {
    nodes.push({
      id: node.taskId,
      type: 'taskNode',
      position: { x: 0, y: 0 },
      data: { task: node, ...callbacks },
    });
    (node.children || []).forEach((child: any) => {
      edges.push({
        id: `${node.taskId}->${child.taskId}`,
        source: node.taskId,
        target: child.taskId,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
        style: { stroke: '#475569' },
      });
      walk(child);
    });
  }
  tree.forEach(walk);
  return { nodes, edges };
}

// ── 主组件内部（在 ReactFlowProvider 内）─────────────────────────
function MindMapInner() {
  const qc = useQueryClient();
  const { data: treeData = [] } = useQuery({
    queryKey: ['task-tree'],
    queryFn: () => api.getTaskTree(),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [createModal, setCreateModal] = useState<{ parentId: string; parentType: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ taskId: string; title: string } | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (taskId: string) => {
      await api.updateTask(taskId, { status: 'cancelled' });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-tree'] }); setDeleteConfirm(null); },
  });

  const callbacks = useMemo(() => ({
    onAddChild: (parentId: string, parentType: string) => setCreateModal({ parentId, parentType }),
    onDelete: (taskId: string, title: string) => setDeleteConfirm({ taskId, title }),
  }), []);

  // 树数据变化时重建图
  useEffect(() => {
    if (!treeData.length) return;
    const { nodes: rawNodes, edges: rawEdges } = treeToFlow(treeData as any[], callbacks);
    const laid = layoutGraph(rawNodes, rawEdges);
    setNodes(laid);
    setEdges(rawEdges);
  }, [treeData, callbacks]);

  const onConnect = useCallback((params: any) => setEdges(es => addEdge(params, es)), []);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        style={{ backgroundColor: '#f0f2f5' }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#dde1e7" gap={24} />
        <Controls className="!bg-white !border-gray-200 !rounded-lg !shadow-sm" />
        <MiniMap
          nodeColor={n => {
            const t = (n.data as any)?.task?.type || 'task';
            const colors: Record<string, string> = { epic: '#8b5cf6', story: '#3b82f6', task: '#10b981', subtask: '#94a3b8' };
            return colors[t] || '#94a3b8';
          }}
          className="!bg-white !border-gray-200 !rounded-lg !shadow-sm"
        />
      </ReactFlow>

      {/* 图例 */}
      <div className="absolute top-3 left-3 flex items-center gap-3 bg-white/90 backdrop-blur px-3 py-2 rounded-lg border border-gray-200 shadow-sm text-xs">
        {Object.entries(TYPE_CONFIG).map(([type, conf]) => (
          <span key={type} className={cn('flex items-center gap-1', conf.text)}>
            {conf.icon} {type}
          </span>
        ))}
        <span className="text-gray-400 ml-1">右键节点查看操作</span>
      </div>

      {/* 创建弹窗 */}
      {createModal && (
        <CreateTaskModal
          defaultParentId={createModal.parentId}
          defaultType={CHILD_TYPE[createModal.parentType]}
          onClose={() => { setCreateModal(null); qc.invalidateQueries({ queryKey: ['task-tree'] }); }}
        />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">
              将把 <span className="text-gray-800 font-medium">{deleteConfirm.title}</span> 标记为已取消（含子节点）
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.taskId)}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
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
        <MindMapInner />
      </ReactFlowProvider>
    </div>
  );
}
