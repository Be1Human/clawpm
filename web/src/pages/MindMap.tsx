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
const TYPE_CONFIG: Record<string, { icon: string; border: string; bg: string; text: string }> = {
  epic:    { icon: '◈', border: 'border-purple-500/50', bg: 'bg-purple-500/10', text: 'text-purple-300' },
  story:   { icon: '◎', border: 'border-blue-500/50',   bg: 'bg-blue-500/10',   text: 'text-blue-300' },
  task:    { icon: '◻', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  subtask: { icon: '○', border: 'border-slate-500/50',  bg: 'bg-slate-500/10',  text: 'text-slate-400' },
};
const STATUS_DOT: Record<string, string> = {
  done: 'bg-emerald-500', active: 'bg-brand-500', blocked: 'bg-red-500',
  review: 'bg-yellow-500', planned: 'bg-slate-600',
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
        'relative min-w-[180px] max-w-[240px] rounded-xl border-2 shadow-lg transition-all cursor-default',
        conf.border,
        conf.bg,
        selected ? 'ring-2 ring-brand-400 ring-offset-1 ring-offset-slate-900' : ''
      )}
      onContextMenu={e => { e.preventDefault(); setShowMenu(v => !v); }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-slate-600 !border-slate-500" />

      <div className="px-3 pt-2.5 pb-2">
        {/* 头部：图标 + ID */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs', conf.text)}>{conf.icon}</span>
            <span className="text-xs font-mono text-slate-600">{task.taskId}</span>
          </div>
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[task.status] || 'bg-slate-600')} />
        </div>

        {/* 标题 */}
        <p className="text-sm text-slate-100 leading-snug line-clamp-2 mb-2">{task.title}</p>

        {/* 进度条 */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full', task.progress >= 100 ? 'bg-emerald-500' : 'bg-brand-500')}
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <span className="text-xs text-slate-600 w-7 text-right">{task.progress}%</span>
        </div>
      </div>

      {/* 添加子节点按钮 */}
      {childType && (
        <button
          onClick={() => (data as any).onAddChild(task.taskId, type)}
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-500 hover:text-brand-400 hover:border-brand-500/50 flex items-center justify-center text-sm transition-all z-10"
          title={`添加${type === 'epic' ? '用户故事' : type === 'story' ? '任务' : '子任务'}`}
        >
          +
        </button>
      )}

      {/* 右键菜单 */}
      {showMenu && (
        <div
          className="absolute top-full left-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
          onMouseLeave={() => setShowMenu(false)}
        >
          {childType && (
            <button
              className="w-full text-left text-xs px-3 py-2 hover:bg-slate-800 text-slate-300"
              onClick={() => { (data as any).onAddChild(task.taskId, type); setShowMenu(false); }}
            >
              + 添加子节点
            </button>
          )}
          <button
            className="w-full text-left text-xs px-3 py-2 hover:bg-slate-800 text-slate-300"
            onClick={() => { window.open(`/tasks/${task.taskId}`, '_blank'); setShowMenu(false); }}
          >
            查看详情 ↗
          </button>
          <hr className="border-slate-800 my-1" />
          <button
            className="w-full text-left text-xs px-3 py-2 hover:bg-red-900/30 text-red-400"
            onClick={() => { (data as any).onDelete(task.taskId, task.title); setShowMenu(false); }}
          >
            删除节点
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-slate-600 !border-slate-500" />
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

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
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
        className="bg-slate-950"
        minZoom={0.2}
        maxZoom={2}
      >
        <Background color="#1e293b" gap={20} />
        <Controls className="!bg-slate-800 !border-slate-700 !rounded-lg" />
        <MiniMap
          nodeColor={n => {
            const t = (n.data as any)?.task?.type || 'task';
            const colors: Record<string, string> = { epic: '#8b5cf6', story: '#3b82f6', task: '#10b981', subtask: '#64748b' };
            return colors[t] || '#64748b';
          }}
          className="!bg-slate-900 !border-slate-700 !rounded-lg"
        />
      </ReactFlow>

      {/* 图例 */}
      <div className="absolute top-3 left-3 flex items-center gap-3 bg-slate-900/90 backdrop-blur px-3 py-2 rounded-lg border border-slate-800 text-xs">
        {Object.entries(TYPE_CONFIG).map(([type, conf]) => (
          <span key={type} className={cn('flex items-center gap-1', conf.text)}>
            {conf.icon} {type}
          </span>
        ))}
        <span className="text-slate-600 ml-1">右键节点查看操作</span>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-slate-100 mb-2">确认删除</h3>
            <p className="text-sm text-slate-400 mb-4">
              将把 <span className="text-slate-200 font-medium">{deleteConfirm.title}</span> 标记为已取消（含子节点）
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">取消</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.taskId)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
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
