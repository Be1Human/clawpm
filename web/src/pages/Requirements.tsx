import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import CreateTaskModal from '@/components/CreateTaskModal';

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  backlog: { label: '未排期', dot: 'bg-slate-400',   text: 'text-slate-500' },
  planned: { label: '未开始', dot: 'bg-blue-400',    text: 'text-blue-500' },
  active:  { label: '进行中', dot: 'bg-indigo-500',  text: 'text-indigo-500' },
  review:  { label: '验收中', dot: 'bg-amber-500',   text: 'text-amber-500' },
  done:    { label: '已完成', dot: 'bg-emerald-500', text: 'text-emerald-500' },
};

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#ede9fe', text: '#7c3aed' },
  feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug:     { bg: '#fee2e2', text: '#b91c1c' },
  spike:   { bg: '#ffedd5', text: '#c2410c' },
  chore:   { bg: '#f1f5f9', text: '#475569' },
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'text-red-500', P1: 'text-orange-500', P2: 'text-gray-400', P3: 'text-gray-300',
};

function getLabels(node: any): string[] {
  try { return JSON.parse(node.labels || '[]'); } catch { return []; }
}

function TreeNodeRow({
  node, depth, expanded, hasChildren, onToggle, onCreateChild,
}: {
  node: any; depth: number; expanded: boolean; hasChildren: boolean;
  onToggle: () => void; onCreateChild: () => void;
}) {
  const labels = getLabels(node);
  const sc = STATUS_CONFIG[node.status] || STATUS_CONFIG.backlog;

  return (
    <div
      className="group flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors"
      style={{ paddingLeft: `${12 + depth * 22}px` }}
    >
      <button
        onClick={onToggle}
        className={cn(
          'w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 transition-transform text-xs',
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

      <Link to={`/tasks/${node.taskId}`} className="flex-1 text-sm text-gray-700 hover:text-indigo-600 truncate min-w-0">
        {node.title}
      </Link>

      <span className="text-xs font-mono text-gray-400 flex-shrink-0">{node.taskId}</span>

      <span className={cn('text-xs font-medium flex-shrink-0 w-6 text-center', PRIORITY_COLOR[node.priority] || 'text-gray-400')}>
        {node.priority}
      </span>

      <span className={cn('text-xs flex-shrink-0 w-14 text-right', sc.text)}>
        {sc.label}
      </span>

      <div className="flex items-center gap-1.5 flex-shrink-0 w-20">
        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', node.progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
            style={{ width: `${node.progress}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 w-7 text-right">{node.progress}%</span>
      </div>

      <div className="flex-shrink-0 w-6">
        <button
          onClick={e => { e.stopPropagation(); onCreateChild(); }}
          className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all text-sm border border-transparent hover:border-indigo-200"
          title="添加子节点"
        >
          +
        </button>
      </div>
    </div>
  );
}

function TreeNode({
  node, depth = 0, globalExpanded, onCreateChild,
}: {
  node: any; depth?: number; globalExpanded: boolean | null;
  onCreateChild: (parentTaskId: string) => void;
}) {
  const [localExpanded, setLocalExpanded] = useState(depth < 2);
  const children: any[] = node.children || [];
  const hasChildren = children.length > 0;
  const expanded = globalExpanded !== null ? globalExpanded : localExpanded;

  return (
    <div>
      <TreeNodeRow
        node={node} depth={depth} expanded={expanded} hasChildren={hasChildren}
        onToggle={() => setLocalExpanded(v => !v)}
        onCreateChild={() => onCreateChild(node.taskId)}
      />
      {expanded && hasChildren && (
        <div>
          {children.map((child: any) => (
            <TreeNode key={child.id} node={child} depth={depth + 1}
              globalExpanded={globalExpanded} onCreateChild={onCreateChild} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Requirements() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [globalExpanded, setGlobalExpanded] = useState<boolean | null>(null);
  const [createModal, setCreateModal] = useState<{ parentId?: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMilestone, setFilterMilestone] = useState('');
  const [filterLabel, setFilterLabel] = useState('');

  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: () => api.getMilestones() });

  const treeParams: Record<string, string> = {};
  if (filterStatus) treeParams.status = filterStatus;
  if (filterMilestone) treeParams.milestone = filterMilestone;
  if (filterLabel) treeParams.label = filterLabel;

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['task-tree', filterStatus, filterMilestone, filterLabel],
    queryFn: () => api.getTaskTree(Object.keys(treeParams).length ? treeParams : undefined),
  });

  const totalNodes = countNodes(tree as any[]);

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">需求树</h1>
          <p className="text-sm text-gray-400 mt-0.5">{totalNodes} 个节点</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
            <button className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white font-medium">
              ☰ 列表
            </button>
            <button
              onClick={() => navigate('/mindmap')}
              className="px-3 py-1.5 text-xs rounded-md text-gray-500 hover:text-gray-700 transition-colors"
            >
              ◉ 思维导图
            </button>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1 gap-0.5">
            <button
              onClick={() => setGlobalExpanded(true)}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-all',
                globalExpanded === true ? 'bg-indigo-600 text-white font-medium' : 'text-gray-500 hover:text-gray-700')}
            >
              展开
            </button>
            <button
              onClick={() => setGlobalExpanded(false)}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-all',
                globalExpanded === false ? 'bg-indigo-600 text-white font-medium' : 'text-gray-500 hover:text-gray-700')}
            >
              收起
            </button>
          </div>
          <button
            onClick={() => setCreateModal({})}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            + 新建节点
          </button>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-2 mb-4">
        <select value={filterLabel} onChange={e => setFilterLabel(e.target.value)}
          className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-1.5 min-w-[110px] focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">全部标签</option>
          {['epic','feature','bug','spike','chore'].map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-1.5 min-w-[100px] focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">全部状态</option>
          <option value="backlog">未排期</option>
          <option value="planned">未开始</option>
          <option value="active">进行中</option>
          <option value="review">验收中</option>
          <option value="done">已完成</option>
        </select>
        <select value={filterMilestone} onChange={e => setFilterMilestone(e.target.value)}
          className="bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-1.5 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">全部里程碑</option>
          {(milestones as any[]).map((m: any) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        {(filterStatus || filterMilestone || filterLabel) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterMilestone(''); setFilterLabel(''); }}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
          >
            ✕ 清除过滤
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-2">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 mb-1">
          <div className="w-4 flex-shrink-0" />
          <div className="w-2 flex-shrink-0" />
          <div className="flex-1 text-xs text-gray-400">标题</div>
          <div className="w-12 text-xs text-gray-400 text-right">ID</div>
          <div className="w-6 text-xs text-gray-400 text-center">优先</div>
          <div className="w-14 text-xs text-gray-400 text-right">状态</div>
          <div className="w-20 text-xs text-gray-400 text-center">进度</div>
          <div className="w-6 text-xs text-gray-400 text-center">+</div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">加载中...</div>
        ) : (tree as any[]).length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">◉</div>
            <div className="text-gray-500 text-sm mb-1">
              {filterStatus || filterMilestone || filterLabel ? '没有符合过滤条件的节点' : '还没有任何需求节点'}
            </div>
            <div className="text-gray-400 text-xs">
              {filterStatus || filterMilestone || filterLabel ? '尝试清除过滤条件' : '点击「新建节点」开始构建需求树'}
            </div>
          </div>
        ) : (
          (tree as any[]).map((node: any) => (
            <TreeNode key={node.id} node={node} depth={0}
              globalExpanded={globalExpanded}
              onCreateChild={(parentTaskId) => setCreateModal({ parentId: parentTaskId })} />
          ))
        )}
      </div>

      {createModal !== null && (
        <CreateTaskModal
          defaultParentId={createModal.parentId}
          onClose={() => {
            setCreateModal(null);
            qc.invalidateQueries({ queryKey: ['task-tree'] });
          }}
        />
      )}
    </div>
  );
}

function countNodes(nodes: any[]): number {
  return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
}
