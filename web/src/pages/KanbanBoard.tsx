import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useFilters } from '@/lib/useFilters';
import { getNodeLabels, sortTreeByPriority, filterTreeByFilters, filterTreeKeepAncestors, flattenTree } from '@/lib/tree';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { Link } from 'react-router-dom';
import { useState, useRef, useMemo, useCallback } from 'react';
import CreateTaskModal from '@/components/CreateTaskModal';
import FilterBar from '@/components/FilterBar';

const COLUMNS = [
  { key: 'backlog',  labelKey: 'status.backlog',  accent: '#94a3b8', light: '#f8fafc' },
  { key: 'planned',  labelKey: 'status.planned',  accent: '#3b82f6', light: '#eff6ff' },
  { key: 'active',   labelKey: 'status.active',   accent: '#6366f1', light: '#eef2ff' },
  { key: 'review',   labelKey: 'status.review',   accent: '#d97706', light: '#fffbeb' },
  { key: 'done',     labelKey: 'status.done',     accent: '#10b981', light: '#f0fdf4' },
];

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#ede9fe', text: '#7c3aed' },
  feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug:     { bg: '#fee2e2', text: '#b91c1c' },
  spike:   { bg: '#ffedd5', text: '#c2410c' },
  chore:   { bg: '#f1f5f9', text: '#475569' },
};

const PRIORITY_BADGE: Record<string, { bg: string; text: string }> = {
  P0: { bg: '#fef2f2', text: '#dc2626' },
  P1: { bg: '#fff7ed', text: '#c2410c' },
  P2: { bg: '#eff6ff', text: '#1d4ed8' },
  P3: { bg: '#f8fafc', text: '#64748b' },
};

function TaskCard({
  task,
  depth,
  onDragStart,
}: {
  task: any;
  depth: number;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}) {
  const { t } = useI18n();
  const days = getDaysUntil(task.dueDate);
  const isOverdue = days !== null && days < 0;
  const isUrgent = days !== null && days >= 0 && days <= 3;
  const labels = getNodeLabels(task);
  const pb = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.P2;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.taskId)}
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-grab active:cursor-grabbing active:opacity-70 active:scale-95 group"
      style={{ marginLeft: `${depth * 14}px` }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-gray-400">{task.taskId}</span>
          {labels.slice(0, 1).map((l: string) => {
            const c = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
            return (
              <span key={l} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ backgroundColor: c.bg, color: c.text }}>
                {l}
              </span>
            );
          })}
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: pb.bg, color: pb.text }}>
          {task.priority}
        </span>
      </div>

      {/* Title */}
      <Link to={`/tasks/${task.taskId}`} className="block">
        <p className="text-[13px] font-semibold text-gray-800 leading-snug mb-2.5 line-clamp-2 group-hover:text-indigo-700 transition-colors">
          {task.title}
        </p>
      </Link>

      {/* Progress bar */}
      {task.progress > 0 && (
        <div className="mb-2.5">
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>进度</span>
            <span>{task.progress}%</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${task.progress}%`,
                backgroundColor: task.progress >= 80 ? '#10b981' : task.progress >= 40 ? '#6366f1' : '#94a3b8',
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {task.domain && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${task.domain.color}18`, color: task.domain.color }}>
              {task.domain.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.owner && (
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: '#6366f1' }}
              title={task.owner}
            >
              {task.owner[0]?.toUpperCase()}
            </div>
          )}
          {task.dueDate && (
            <span className={cn('text-[10px]', isOverdue ? 'text-red-500 font-medium' : isUrgent ? 'text-amber-500' : 'text-gray-400')}>
              {isOverdue ? t('date.overdueDays', { days: Math.abs(days!) }) : formatDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>

      {/* Blocker */}
      {task.blocker && (
        <div className="mt-2 text-[10px] text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg truncate">
          ⚠ {task.blocker}
        </div>
      )}
    </div>
  );
}

function ContextRow({
  task,
  depth,
  expanded,
  hasChildren,
  onToggle,
}: {
  task: any;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50/70 text-gray-400 border border-dashed border-gray-200"
      style={{ marginLeft: `${depth * 14}px` }}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'w-4 h-4 flex items-center justify-center text-[10px] flex-shrink-0',
          !hasChildren && 'invisible',
          expanded && 'rotate-90'
        )}
      >
        ▶
      </button>
      <span className="text-[10px] font-mono">{task.taskId}</span>
      <span className="text-[11px] truncate">{task.title}</span>
    </div>
  );
}

function KanbanTreeNode({
  task,
  depth,
  columnKey,
  collapsedIds,
  onToggleCollapse,
  onDragStart,
}: {
  task: any;
  depth: number;
  columnKey: string;
  collapsedIds: Set<string>;
  onToggleCollapse: (taskId: string) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}) {
  const children = task.children || [];
  const hasChildren = children.length > 0;
  const expanded = !collapsedIds.has(task.taskId);
  const isMatch = task.status === columnKey;

  return (
    <div className="space-y-2">
      {isMatch ? (
        <TaskCard task={task} depth={depth} onDragStart={onDragStart} />
      ) : (
        <ContextRow
          task={task}
          depth={depth}
          expanded={expanded}
          hasChildren={hasChildren}
          onToggle={() => hasChildren && onToggleCollapse(task.taskId)}
        />
      )}

      {expanded && hasChildren && (
        <div className="space-y-2">
          {children.map((child: any) => (
            <KanbanTreeNode
              key={child.id}
              task={child}
              depth={depth + 1}
              columnKey={columnKey}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              onDragStart={onDragStart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function KanbanBoard() {
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const { t } = useI18n();
  const filterHook = useFilters('kanban');
  const [showCreate, setShowCreate] = useState(false);
  const [draggingOver, setDraggingOver] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const dragTaskId = useRef<string | null>(null);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['task-tree-kanban', activeProject],
    queryFn: () => api.getTaskTree(),
    refetchInterval: 15000,
  });

  const moveMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.updateTask(taskId, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-tree-kanban'] });
      qc.invalidateQueries({ queryKey: ['task-tree-list'] });
      qc.invalidateQueries({ queryKey: ['my-task-tree'] });
    },
  });

  const sortedTree = useMemo(() => sortTreeByPriority(tree as any[]), [tree]);
  const filteredTree = useMemo(() => filterTreeByFilters(sortedTree, filterHook.filters), [sortedTree, filterHook.filters]);
  const visibleTasks = useMemo(() => flattenTree(filteredTree), [filteredTree]);
  const columnTrees = useMemo(
    () => Object.fromEntries(COLUMNS.map(col => [
      col.key,
      filterTreeKeepAncestors(filteredTree, (node: any) => node.status === col.key),
    ])),
    [filteredTree]
  );

  function handleDragStart(e: React.DragEvent, taskId: string) {
    dragTaskId.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, colKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDraggingOver(colKey);
  }

  function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    setDraggingOver(null);
    const taskId = dragTaskId.current;
    if (!taskId) return;
    const task = visibleTasks.find(t => t.taskId === taskId);
    if (!task || task.status === targetStatus) return;
    moveMut.mutate({ taskId, status: targetStatus });
    dragTaskId.current = null;
  }

  const totalByStatus = useCallback(
    (status: string) => visibleTasks.filter(task => task.status === status).length,
    [visibleTasks]
  );

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#f4f5f7]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('kanban.title')}</h1>
          <p className="text-xs text-gray-400">
            {t('kanban.taskCount', { count: visibleTasks.length })}，列内按需求树展开
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {t('kanban.newTask')}
          </button>
        </div>
      </div>
      <div className="px-6 py-2 bg-white border-b border-gray-200">
        <FilterBar {...filterHook} dimensions={['search', 'priority', 'owner', 'label']} />
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-6 py-5">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const colTree = (columnTrees[col.key] as any[]) || [];
            const isDragOver = draggingOver === col.key;
            return (
              <div
                key={col.key}
                className="w-72 flex flex-col"
                onDragOver={e => handleDragOver(e, col.key)}
                onDragLeave={() => setDraggingOver(null)}
                onDrop={e => handleDrop(e, col.key)}
              >
                {/* Column Header */}
                <div
                  className="rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between border-2"
                  style={{
                    borderColor: isDragOver ? col.accent : 'transparent',
                    backgroundColor: isDragOver ? col.light : '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.accent }} />
                    <span className="text-sm font-semibold text-gray-700">{t(col.labelKey)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: `${col.accent}18`, color: col.accent }}
                    >
                      {totalByStatus(col.key)}
                    </span>
                  </div>
                </div>

                {/* Drop zone indicator */}
                {isDragOver && (
                  <div
                    className="border-2 border-dashed rounded-xl mb-3 h-16 flex items-center justify-center text-sm font-medium"
                    style={{ borderColor: col.accent, color: col.accent, backgroundColor: col.light }}
                  >
                    {t('kanban.dropHere', { col: t(col.labelKey) })}
                  </div>
                )}

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-white border border-gray-100 rounded-xl h-24 animate-pulse" />
                    ))
                  ) : colTree.length === 0 && !isDragOver ? (
                    <div className="text-center py-10 text-gray-300 text-sm select-none">{t('kanban.noTasks')}</div>
                  ) : (
                    colTree.map((task: any) => (
                      <KanbanTreeNode
                        key={`${col.key}-${task.id}`}
                        task={task}
                        depth={0}
                        columnKey={col.key}
                        collapsedIds={collapsedIds}
                        onToggleCollapse={toggleCollapse}
                        onDragStart={handleDragStart}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showCreate && (
        <CreateTaskModal
          onClose={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['task-tree-kanban'] });
          }}
        />
      )}
    </div>
  );
}
