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
  const idColumnWidth = useMemo(() => {
    const longestId = flattenTree(sortedTree).reduce(
      (longest, task: any) => Math.max(longest, String(task.taskId ?? '').length),
      0,
    );
    // 保持各行与表头对齐，同时按当前工程最长 ID 扩展，避免无意义换行。
    return Math.min(240, Math.max(112, longestId * 8 + 32));
  }, [sortedTree]);
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
    <div className="min-h-full bg-[#f6f8fc] p-5 lg:p-6 animate-fade-in">
      <div className="w-full">
      <div className="mb-5 flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Task inventory</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">任务树</h1>
          <p className="mt-1.5 text-sm text-gray-600">
            {visibleTasks.length} / {totalNodes} 个节点，按需求树展开，同级按优先级排序
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 sm:inline-flex">树状清单</span>
          <button onClick={() => setShowCreate(true)} className="btn-primary">+ 新建节点</button>
        </div>
      </div>

      {/* 统一筛选栏 */}
      <div className="mb-5">
        <FilterBar {...filterHook} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="min-w-[900px]">
          <div className="flex items-center border-b border-gray-200 bg-gray-50/80 text-sm">
            <div className="px-2 py-2 w-8">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="rounded border-gray-500"
              />
            </div>
            <div className="flex-shrink-0 px-4 py-3 text-left text-xs font-semibold text-gray-600" style={{ width: idColumnWidth }}>{t('taskList.thId')}</div>
            <div className="flex-1 px-4 py-3 text-left text-xs font-semibold text-gray-600">{t('taskList.thTitle')}</div>
            <div className="w-24 px-4 py-3 text-left text-xs font-semibold text-gray-600">{t('taskList.thStatus')}</div>
            <div className="w-16 px-4 py-3 text-left text-xs font-semibold text-gray-600">{t('taskList.thPriority')}</div>
            <div className="w-32 px-4 py-3 text-left text-xs font-semibold text-gray-600">处理人</div>
            <div className="w-32 px-4 py-3 text-left text-xs font-semibold text-gray-600">{t('taskList.thProgress')}</div>
          </div>

          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-b border-gray-100 px-4 py-3">
                <div className="h-4 rounded bg-gray-100 animate-pulse" />
              </div>
            ))
          ) : visibleTasks.length === 0 ? (
            <div className="py-12 text-center text-gray-500">没有节点</div>
          ) : (
            filteredTree.map((task: any) => (
              <TaskTreeRow
                key={task.id}
                task={task}
                depth={0}
                selectedIds={selectedIds}
                collapsedIds={collapsedIds}
                idColumnWidth={idColumnWidth}
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 树形视图行：每个节点一行
// ═══════════════════════════════════════════════════════════════════
function TaskTreeRow({
  task,
  depth,
  selectedIds,
  collapsedIds,
  idColumnWidth,
  onToggleSelect,
  onToggleCollapse,
}: {
  task: any;
  depth: number;
  selectedIds: Set<string>;
  collapsedIds: Set<string>;
  idColumnWidth: number;
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
          'flex items-center border-b border-gray-100 px-0 text-sm transition-colors hover:bg-indigo-50/50',
          isSelected && 'bg-indigo-50'
        )}
      >
        <div className="px-2 py-1.5 w-8">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(task.taskId)}
            className="rounded border-gray-500"
          />
        </div>
        <div className="flex-shrink-0 px-4 py-3" style={{ width: idColumnWidth }}>
          <Link to={`/tasks/${task.taskId}`} className="whitespace-nowrap font-mono text-xs text-gray-500 hover:text-indigo-700">
            {task.taskId}
          </Link>
        </div>
        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${depth * 20}px` }}>
            <button
              type="button"
              onClick={() => hasChildren && onToggleCollapse(task.taskId)}
              className={cn(
                'flex h-4 w-4 flex-shrink-0 items-center justify-center text-[10px] text-gray-400',
                hasChildren ? 'cursor-pointer hover:text-gray-700' : 'invisible cursor-default'
              )}
            >
              {collapsed ? '▶' : '▼'}
            </button>
            <Link to={`/tasks/${task.taskId}`} className="min-w-0 line-clamp-1 font-medium text-gray-900 hover:text-indigo-700">
              {task.title}
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500" style={{ paddingLeft: `${depth * 20 + 24}px` }}>
            {task.domain?.name && <span>{task.domain.name}</span>}
            {labels.slice(0, 2).map(label => <span key={label} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{label}</span>)}
            {task.dueDate && <span className={isOverdue ? 'text-red-600' : undefined}>{formatDate(task.dueDate)}</span>}
          </div>
          {task.blocker && (
            <div className="mt-1 truncate text-xs text-red-600" style={{ paddingLeft: `${depth * 20 + 24}px` }}>
              ! {task.blocker}
            </div>
          )}
        </div>
        <div className="w-24 px-4 py-3"><StatusBadge status={task.status} /></div>
        <div className="w-16 px-4 py-3"><PriorityBadge priority={task.priority} /></div>
        <div className="w-32 px-4 py-3">
          {(task.assignee || task.owner) ? (
            <div className="flex items-center gap-1.5">
              <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium",
                task.assignee ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600")}>
                {(task.assignee || task.owner)[0].toUpperCase()}
              </span>
              <span className="truncate text-xs text-gray-600" title={task.assignee ? `处理人: ${task.assignee}` : `负责人: ${task.owner}`}>
                {task.assignee || task.owner}
              </span>
            </div>
          ) : <span className="text-gray-400">—</span>}
        </div>
        <div className="w-32 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-indigo-600" style={{ width: `${task.progress}%` }} />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-gray-500">{task.progress}%</span>
          </div>
        </div>
      </div>

      {!collapsed && (task.children || []).map((child: any) => (
        <TaskTreeRow
          key={child.id}
          task={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          collapsedIds={collapsedIds}
          idColumnWidth={idColumnWidth}
          onToggleSelect={onToggleSelect}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 表格视图行：一个顶层父节点一行，子节点递归缩进列在「标题」格内
// 其他列展示父节点自身的值（飞书多维表格式的"分组聚合"风格）
// ═══════════════════════════════════════════════════════════════════
function TaskTableRow({
  task,
  selectedIds,
  idColumnWidth,
  onToggleSelect,
}: {
  task: any;
  selectedIds: Set<string>;
  idColumnWidth: number;
  onToggleSelect: (taskId: string) => void;
}) {
  const days = getDaysUntil(task.dueDate);
  const isOverdue = days !== null && days < 0;
  const labels = getNodeLabels(task);
  const isSelected = selectedIds.has(task.taskId);
  const hasChildren = (task.children || []).length > 0;

  return (
    <div
      className={cn(
        'flex items-start border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors text-sm',
        isSelected && 'bg-indigo-900/20'
      )}
    >
      <div className="px-2 py-1.5 w-8 flex-shrink-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(task.taskId)}
          className="rounded border-gray-500"
        />
      </div>
      <div className="px-4 py-1.5 flex-shrink-0" style={{ width: idColumnWidth }}>
        <Link to={`/tasks/${task.taskId}`} className="font-mono text-xs text-slate-500 hover:text-brand-400 whitespace-nowrap">
          {task.taskId}
        </Link>
      </div>

      {/* 标题格：自身 + 所有子节点（递归缩进） */}
      <div className="px-4 py-1.5 flex-1 min-w-0 space-y-0.5">
        <Link to={`/tasks/${task.taskId}`} className="text-slate-100 font-medium hover:text-brand-400 line-clamp-1">
          {task.title}
        </Link>
        {task.blocker && (
          <div className="text-xs text-red-400 truncate">! {task.blocker}</div>
        )}
        {hasChildren && (
          <div className="mt-1 border-l border-slate-700/50 pl-2">
            {(task.children || []).map((child: any) => (
              <NestedTitleRow key={child.id} task={child} depth={0} />
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-1.5 w-24 flex-shrink-0">
        {labels.slice(0, 1).map(label => {
          const c = LABEL_COLORS[label] || { bg: '#f1f5f9', text: '#475569' };
          return (
            <span
              key={label}
              className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis inline-block max-w-full"
              style={{ backgroundColor: c.bg, color: c.text }}
              title={label}
            >
              {label}
            </span>
          );
        })}
        {labels.length === 0 && <span className="text-slate-700">-</span>}
      </div>
      <div className="px-4 py-1.5 w-24 flex-shrink-0"><StatusBadge status={task.status} /></div>
      <div className="px-4 py-1.5 w-16 flex-shrink-0"><PriorityBadge priority={task.priority} /></div>
      <div className="px-4 py-1.5 w-24 flex-shrink-0">
        {task.domain ? (
          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${task.domain.color}20`, color: task.domain.color }}>
            {task.domain.name}
          </span>
        ) : <span className="text-slate-700">-</span>}
      </div>
      <div className="px-4 py-1.5 w-24 flex-shrink-0">
        {(task.assignee || task.owner) ? (
          <div className="flex items-center gap-1.5">
            <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium",
              task.assignee ? "bg-brand-500/30 text-brand-400" : "bg-slate-500/30 text-slate-400")}>
              {(task.assignee || task.owner)[0].toUpperCase()}
            </span>
            <span className="text-xs text-slate-400 truncate" title={task.assignee ? `处理人: ${task.assignee}` : `负责人: ${task.owner}`}>
              {task.assignee || task.owner}
            </span>
          </div>
        ) : <span className="text-slate-700">-</span>}
      </div>
      <div className="px-4 py-1.5 w-28 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress}%` }} />
          </div>
          <span className="text-xs text-slate-600 w-7">{task.progress}%</span>
        </div>
      </div>
      <div className="px-4 py-1.5 w-24 flex-shrink-0">
        <span className={cn('text-xs', isOverdue ? 'text-red-400' : 'text-slate-500')}>
          {task.dueDate ? formatDate(task.dueDate) : '-'}
        </span>
      </div>
    </div>
  );
}

// 表格视图 -- 标题格内的嵌套子节点展示（递归）
function NestedTitleRow({ task, depth }: { task: any; depth: number }) {
  const hasChildren = (task.children || []).length > 0;
  return (
    <div>
      <div
        className="flex items-center gap-2 py-0.5 min-w-0"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <span className="text-slate-600 text-[10px] flex-shrink-0">└</span>
        <Link
          to={`/tasks/${task.taskId}`}
          className="font-mono text-[10px] text-slate-600 hover:text-brand-400 flex-shrink-0"
        >
          {task.taskId}
        </Link>
        <Link
          to={`/tasks/${task.taskId}`}
          className="text-xs text-slate-300 hover:text-brand-400 line-clamp-1 min-w-0"
        >
          {task.title}
        </Link>
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
      </div>
      {hasChildren && (task.children || []).map((child: any) => (
        <NestedTitleRow key={child.id} task={child} depth={depth + 1} />
      ))}
    </div>
  );
}
