import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useFilters } from '@/lib/useFilters';
import { getNodeLabels, sortTreeByPriority, filterTreeByFilters, flattenTree } from '@/lib/tree';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import CreateTaskModal from '@/components/CreateTaskModal';
import FilterBar from '@/components/FilterBar';
import BatchActionBar from '@/components/BatchActionBar';

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#ede9fe', text: '#7c3aed' },
  feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug:     { bg: '#fee2e2', text: '#b91c1c' },
  spike:   { bg: '#ffedd5', text: '#c2410c' },
  chore:   { bg: '#f1f5f9', text: '#475569' },
};

export default function TaskList() {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const activeProject = useActiveProject();

  const filterHook = useFilters('task-list');

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['task-tree-list', activeProject],
    queryFn: () => api.getTaskTree(),
  });

  const sortedTree = useMemo(() => sortTreeByPriority(tree as any[]), [tree]);
  const filteredTree = useMemo(
    () => filterTreeByFilters(sortedTree, filterHook.filters),
    [sortedTree, filterHook.filters]
  );
  const visibleTasks = useMemo(() => flattenTree(filteredTree), [filteredTree]);
  const totalNodes = useMemo(() => flattenTree(sortedTree).length, [sortedTree]);
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every(task => selectedIds.has(task.taskId));

  // Batch selection
  const toggleSelect = useCallback((taskId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTasks.map(task => task.taskId)));
    }
  }, [allVisibleSelected, visibleTasks]);

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">节点列表</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {visibleTasks.length} / {totalNodes} 个节点，按需求树展开，同级按优先级排序
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 新建节点</button>
      </div>

      {/* 统一筛选栏 */}
      <div className="mb-5">
        <FilterBar {...filterHook} />
      </div>

      <div className="card overflow-hidden">
        <div className="min-w-[1080px]">
          <div className="flex items-center border-b border-slate-800 text-sm">
            <div className="px-2 py-3 w-8">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="rounded border-gray-500"
              />
            </div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thId')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium flex-1">{t('taskList.thTitle')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-20">{t('taskList.thLabel')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thStatus')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-16">{t('taskList.thPriority')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thDomain')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thOwner')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-28">{t('taskList.thProgress')}</div>
            <div className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thDueDate')}</div>
          </div>

          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-slate-800/50 px-4 py-3">
                <div className="h-4 bg-slate-800 rounded animate-pulse" />
              </div>
            ))
          ) : visibleTasks.length === 0 ? (
            <div className="text-center py-12 text-slate-600">没有节点</div>
          ) : (
            filteredTree.map((task: any) => (
              <TaskTreeRow
                key={task.id}
                task={task}
                depth={0}
                selectedIds={selectedIds}
                collapsedIds={collapsedIds}
                onToggleSelect={toggleSelect}
                onToggleCollapse={toggleCollapse}
              />
            ))
          )}
        </div>
      </div>

      {/* 批量操作栏 */}
      <BatchActionBar
        selectedTaskIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
      />

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function TaskTreeRow({
  task,
  depth,
  selectedIds,
  collapsedIds,
  onToggleSelect,
  onToggleCollapse,
}: {
  task: any;
  depth: number;
  selectedIds: Set<string>;
  collapsedIds: Set<string>;
  onToggleSelect: (taskId: string) => void;
  onToggleCollapse: (taskId: string) => void;
}) {
  const days = getDaysUntil(task.dueDate);
  const isOverdue = days !== null && days < 0;
  const labels = getNodeLabels(task);
  const isSelected = selectedIds.has(task.taskId);
  const hasChildren = (task.children || []).length > 0;
  const collapsed = collapsedIds.has(task.taskId);

  return (
    <>
      <div
        className={cn(
          'flex items-center border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors text-sm',
          isSelected && 'bg-indigo-900/20'
        )}
      >
        <div className="px-2 py-3 w-8">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(task.taskId)}
            className="rounded border-gray-500"
          />
        </div>
        <div className="px-4 py-3 w-24">
          <Link to={`/tasks/${task.taskId}`} className="font-mono text-xs text-slate-500 hover:text-brand-400">
            {task.taskId}
          </Link>
        </div>
        <div className="px-4 py-3 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${depth * 20}px` }}>
            <button
              type="button"
              onClick={() => hasChildren && onToggleCollapse(task.taskId)}
              className={cn(
                'w-4 h-4 flex items-center justify-center text-[10px] text-slate-500 flex-shrink-0',
                hasChildren ? 'hover:text-slate-300 cursor-pointer' : 'invisible cursor-default'
              )}
            >
              {collapsed ? '▶' : '▼'}
            </button>
            <Link to={`/tasks/${task.taskId}`} className="text-slate-200 hover:text-brand-400 line-clamp-1 min-w-0">
              {task.title}
            </Link>
          </div>
          {task.blocker && (
            <div className="text-xs text-red-400 mt-0.5 truncate" style={{ paddingLeft: `${depth * 20 + 24}px` }}>
              ! {task.blocker}
            </div>
          )}
        </div>
        <div className="px-4 py-3 w-20">
          {labels.slice(0, 1).map(label => {
            const c = LABEL_COLORS[label] || { bg: '#f1f5f9', text: '#475569' };
            return (
              <span
                key={label}
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: c.bg, color: c.text }}
              >
                {label}
              </span>
            );
          })}
          {labels.length === 0 && <span className="text-slate-700">-</span>}
        </div>
        <div className="px-4 py-3 w-24"><StatusBadge status={task.status} /></div>
        <div className="px-4 py-3 w-16"><PriorityBadge priority={task.priority} /></div>
        <div className="px-4 py-3 w-24">
          {task.domain ? (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${task.domain.color}20`, color: task.domain.color }}>
              {task.domain.name}
            </span>
          ) : <span className="text-slate-700">-</span>}
        </div>
        <div className="px-4 py-3 w-24">
          {task.owner ? (
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-brand-500/30 flex items-center justify-center text-xs text-brand-400">
                {task.owner[0].toUpperCase()}
              </span>
              <span className="text-xs text-slate-400 truncate">{task.owner}</span>
            </div>
          ) : <span className="text-slate-700">-</span>}
        </div>
        <div className="px-4 py-3 w-28">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress}%` }} />
            </div>
            <span className="text-xs text-slate-600 w-7">{task.progress}%</span>
          </div>
        </div>
        <div className="px-4 py-3 w-24">
          <span className={cn('text-xs', isOverdue ? 'text-red-400' : 'text-slate-500')}>
            {task.dueDate ? formatDate(task.dueDate) : '-'}
          </span>
        </div>
      </div>

      {!collapsed && (task.children || []).map((child: any) => (
        <TaskTreeRow
          key={child.id}
          task={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          collapsedIds={collapsedIds}
          onToggleSelect={onToggleSelect}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </>
  );
}
