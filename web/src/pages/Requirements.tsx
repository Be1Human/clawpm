import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

// ── 类型配置 ───────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  epic:    { icon: '◈', label: '史诗',   color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/30' },
  story:   { icon: '◎', label: '用户故事', color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/30' },
  task:    { icon: '◻', label: '任务',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  subtask: { icon: '○', label: '子任务',  color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/30' },
};

const CHILD_TYPE: Record<string, string> = {
  epic: 'story', story: 'task', task: 'subtask',
};

const STATUS_COLOR: Record<string, string> = {
  planned: 'text-slate-500',
  active:  'text-brand-400',
  review:  'text-yellow-400',
  blocked: 'text-red-400',
  done:    'text-emerald-400',
};

const STATUS_LABEL: Record<string, string> = {
  planned: '待开始', active: '进行中', review: '评审中', blocked: '已阻塞', done: '已完成',
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'text-red-400', P1: 'text-orange-400', P2: 'text-slate-400', P3: 'text-slate-600',
};

// ── 创建节点弹窗 ───────────────────────────────────────────────────
function CreateNodeModal({
  parentTaskId,
  parentType,
  onClose,
}: {
  parentTaskId: string | null;
  parentType: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const childType = parentType ? CHILD_TYPE[parentType] : 'epic';
  const typeConf = TYPE_CONFIG[childType] || TYPE_CONFIG.task;

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'P2',
    owner: '',
  });

  const mut = useMutation({
    mutationFn: (data: any) => api.createTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-tree'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    mut.mutate({
      title: form.title,
      description: form.description,
      priority: form.priority,
      owner: form.owner || undefined,
      type: childType,
      parent_task_id: parentTaskId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="card w-full max-w-md p-6 mx-4 animate-slide-up">
        <div className="flex items-center gap-2 mb-5">
          <span className={cn('text-base', typeConf.color)}>{typeConf.icon}</span>
          <h2 className="text-base font-semibold text-slate-100">
            新建{typeConf.label}
            {parentTaskId && (
              <span className="text-xs text-slate-500 font-normal ml-2">
                挂载至 {parentTaskId}
              </span>
            )}
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">标题 *</label>
            <input
              className="input w-full"
              placeholder={`${typeConf.label}标题`}
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">描述</label>
            <textarea
              className="input w-full resize-none"
              rows={2}
              placeholder="可选描述"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">优先级</label>
              <select
                className="input w-full"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              >
                {['P0', 'P1', 'P2', 'P3'].map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">负责人</label>
              <input
                className="input w-full"
                placeholder="agent-01"
                value={form.owner}
                onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!form.title.trim() || mut.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {mut.isPending ? '创建中...' : `创建${typeConf.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 单个树节点行 ───────────────────────────────────────────────────
function TreeNodeRow({
  node,
  depth,
  expanded,
  hasChildren,
  onToggle,
  onCreateChild,
}: {
  node: any;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  onCreateChild: () => void;
}) {
  const type = node.type || 'task';
  const typeConf = TYPE_CONFIG[type] || TYPE_CONFIG.task;
  const childType = CHILD_TYPE[type];

  return (
    <div
      className="group flex items-center gap-2 px-3 py-2 hover:bg-slate-800/40 rounded-lg transition-colors"
      style={{ paddingLeft: `${12 + depth * 22}px` }}
    >
      {/* 展开箭头 */}
      <button
        onClick={onToggle}
        className={cn(
          'w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-300 flex-shrink-0 transition-transform',
          !hasChildren && 'invisible',
          expanded && 'rotate-90'
        )}
      >
        ▶
      </button>

      {/* 类型图标 */}
      <span className={cn('text-sm flex-shrink-0', typeConf.color)}>{typeConf.icon}</span>

      {/* 类型标签 */}
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0', typeConf.bg, typeConf.color)}>
        {typeConf.label}
      </span>

      {/* 标题 */}
      <Link
        to={`/tasks/${node.taskId}`}
        className="flex-1 text-sm text-slate-200 hover:text-brand-400 truncate min-w-0"
      >
        {node.title}
      </Link>

      {/* 任务ID */}
      <span className="text-xs font-mono text-slate-600 flex-shrink-0">{node.taskId}</span>

      {/* 优先级 */}
      <span className={cn('text-xs font-medium flex-shrink-0 w-6 text-center', PRIORITY_COLOR[node.priority] || 'text-slate-500')}>
        {node.priority}
      </span>

      {/* 状态 */}
      <span className={cn('text-xs flex-shrink-0 w-14 text-right', STATUS_COLOR[node.status] || 'text-slate-500')}>
        {STATUS_LABEL[node.status] || node.status}
      </span>

      {/* 进度条 */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-20">
        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              node.progress >= 100 ? 'bg-emerald-500' : 'bg-brand-500'
            )}
            style={{ width: `${node.progress}%` }}
          />
        </div>
        <span className="text-xs text-slate-600 w-7 text-right">{node.progress}%</span>
      </div>

      {/* 添加子节点按钮 — 始终可见 */}
      <div className="flex-shrink-0 w-6">
        {childType && (
          <button
            onClick={e => { e.stopPropagation(); onCreateChild(); }}
            className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 transition-all text-sm font-light border border-transparent hover:border-brand-500/30"
            title={`添加${TYPE_CONFIG[childType]?.label}`}
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

// ── 递归树节点组件 ─────────────────────────────────────────────────
function TreeNode({
  node,
  depth = 0,
  globalExpanded,
  onCreateChild,
}: {
  node: any;
  depth?: number;
  globalExpanded: boolean | null;
  onCreateChild: (parentTaskId: string, parentType: string) => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(depth < 2);
  const children: any[] = node.children || [];
  const hasChildren = children.length > 0;

  const expanded = globalExpanded !== null ? globalExpanded : localExpanded;

  return (
    <div>
      <TreeNodeRow
        node={node}
        depth={depth}
        expanded={expanded}
        hasChildren={hasChildren}
        onToggle={() => setLocalExpanded(v => !v)}
        onCreateChild={() => onCreateChild(node.taskId, node.type || 'task')}
      />
      {expanded && hasChildren && (
        <div>
          {children.map((child: any) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              globalExpanded={globalExpanded}
              onCreateChild={onCreateChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────
export default function Requirements() {
  const navigate = useNavigate();
  const [globalExpanded, setGlobalExpanded] = useState<boolean | null>(null);
  const [createModal, setCreateModal] = useState<{
    parentTaskId: string | null;
    parentType: string | null;
  } | null>(null);

  // 过滤器
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMilestone, setFilterMilestone] = useState('');

  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: () => api.getMilestones() });

  const treeParams: Record<string, string> = {};
  if (filterStatus) treeParams.status = filterStatus;
  if (filterMilestone) treeParams.milestone = filterMilestone;

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['task-tree', filterStatus, filterMilestone],
    queryFn: () => api.getTaskTree(Object.keys(treeParams).length ? treeParams : undefined),
  });

  const totalNodes = countNodes(tree as any[]);

  return (
    <div className="p-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">需求树</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalNodes} 个节点</p>
        </div>
        <div className="flex items-center gap-3">
          {/* 视图切换 */}
          <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5">
            <button
              className="px-3 py-1.5 text-xs rounded-md bg-brand-500 text-white font-medium"
            >
              ☰ 列表
            </button>
            <button
              onClick={() => navigate('/mindmap')}
              className="px-3 py-1.5 text-xs rounded-md text-slate-500 hover:text-slate-300 transition-colors"
            >
              ◉ 思维导图
            </button>
          </div>
          {/* 展开/收起 */}
          <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setGlobalExpanded(true)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-all',
                globalExpanded === true
                  ? 'bg-brand-500 text-white font-medium'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              展开
            </button>
            <button
              onClick={() => setGlobalExpanded(false)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-all',
                globalExpanded === false
                  ? 'bg-brand-500 text-white font-medium'
                  : 'text-slate-500 hover:text-slate-300'
              )}
            >
              收起
            </button>
          </div>
          {/* 新建 Epic */}
          <button
            onClick={() => setCreateModal({ parentTaskId: null, parentType: null })}
            className="btn-primary"
          >
            + 新建史诗
          </button>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 min-w-[100px]"
        >
          <option value="">全部状态</option>
          <option value="planned">待开始</option>
          <option value="active">进行中</option>
          <option value="review">评审中</option>
          <option value="blocked">已阻塞</option>
          <option value="done">已完成</option>
        </select>
        <select
          value={filterMilestone}
          onChange={e => setFilterMilestone(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-1.5 min-w-[120px]"
        >
          <option value="">全部里程碑</option>
          {(milestones as any[]).map((m: any) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
        {(filterStatus || filterMilestone) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterMilestone(''); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ✕ 清除过滤
          </button>
        )}
        {/* 图例 */}
        <div className="ml-auto flex items-center gap-4">
          {Object.entries(TYPE_CONFIG).map(([type, conf]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={cn('text-sm', conf.color)}>{conf.icon}</span>
              <span className="text-xs text-slate-500">{conf.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 树形内容 */}
      <div className="card p-2">
        {/* 表头 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 mb-1">
          <div className="w-4 flex-shrink-0" />
          <div className="w-4 flex-shrink-0" />
          <div className="w-14 flex-shrink-0" />
          <div className="flex-1 text-xs text-slate-500">标题</div>
          <div className="w-12 text-xs text-slate-500 text-right">ID</div>
          <div className="w-6 text-xs text-slate-500 text-center">优先</div>
          <div className="w-14 text-xs text-slate-500 text-right">状态</div>
          <div className="w-20 text-xs text-slate-500 text-center">进度</div>
          <div className="w-6 text-xs text-slate-500 text-center" title="点击 + 添加子节点">+</div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center">
            <div className="text-slate-600 text-sm">加载中...</div>
          </div>
        ) : (tree as any[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">◈</div>
            <div className="text-slate-500 text-sm mb-1">
              {filterStatus || filterMilestone ? '没有符合过滤条件的节点' : '还没有任何需求'}
            </div>
            <div className="text-slate-600 text-xs">
              {filterStatus || filterMilestone ? '尝试清除过滤条件' : '点击「新建史诗」开始构建产品需求树'}
            </div>
          </div>
        ) : (
          (tree as any[]).map((node: any) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              globalExpanded={globalExpanded}
              onCreateChild={(parentTaskId, parentType) =>
                setCreateModal({ parentTaskId, parentType })
              }
            />
          ))
        )}
      </div>

      {/* 创建弹窗 */}
      {createModal && (
        <CreateNodeModal
          parentTaskId={createModal.parentTaskId}
          parentType={createModal.parentType}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  );
}

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
}
