import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useState, useRef } from 'react';
import CreateTaskModal from '@/components/CreateTaskModal';

const COLUMNS = [
  { key: 'backlog',  label: '未排期', accent: '#94a3b8', light: '#f8fafc' },
  { key: 'planned',  label: '未开始', accent: '#3b82f6', light: '#eff6ff' },
  { key: 'active',   label: '进行中', accent: '#6366f1', light: '#eef2ff' },
  { key: 'review',   label: '验收中', accent: '#d97706', light: '#fffbeb' },
  { key: 'done',     label: '已完成', accent: '#10b981', light: '#f0fdf4' },
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

function getLabels(task: any): string[] {
  try { return JSON.parse(task.labels || '[]'); } catch { return task.type ? [task.type] : []; }
}

function TaskCard({
  task,
  onDragStart,
}: {
  task: any;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}) {
  const days = getDaysUntil(task.dueDate);
  const isOverdue = days !== null && days < 0;
  const isUrgent = days !== null && days >= 0 && days <= 3;
  const labels = getLabels(task);
  const pb = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.P2;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.taskId)}
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-grab active:cursor-grabbing active:opacity-70 active:scale-95 group"
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
              {isOverdue ? `逾期${Math.abs(days!)}天` : formatDate(task.dueDate)}
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

export default function KanbanBoard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [draggingOver, setDraggingOver] = useState<string | null>(null);
  const dragTaskId = useRef<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks(),
    refetchInterval: 15000,
  });

  const moveMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.updateTask(taskId, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const filtered = filter
    ? (tasks as any[]).filter(t =>
        t.title.toLowerCase().includes(filter.toLowerCase()) ||
        t.taskId.toLowerCase().includes(filter.toLowerCase()) ||
        t.owner?.toLowerCase().includes(filter.toLowerCase())
      )
    : tasks as any[];

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
    const task = (tasks as any[]).find(t => t.taskId === taskId);
    if (!task || task.status === targetStatus) return;
    moveMut.mutate({ taskId, status: targetStatus });
    dragTaskId.current = null;
  }

  const totalByStatus = (status: string) => (tasks as any[]).filter(t => t.status === status).length;

  return (
    <div className="h-full flex flex-col bg-[#f4f5f7]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">看板</h1>
          <p className="text-xs text-gray-400">{(tasks as any[]).length} 个任务 · 拖拽卡片可变更状态</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-1.5 text-sm w-52 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
            placeholder="搜索任务..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            + 新建任务
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-6 py-5">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const colTasks = filtered.filter((t: any) => t.status === col.key);
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
                    <span className="text-sm font-semibold text-gray-700">{col.label}</span>
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
                    放置到「{col.label}」
                  </div>
                )}

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-white border border-gray-100 rounded-xl h-24 animate-pulse" />
                    ))
                  ) : colTasks.length === 0 && !isDragOver ? (
                    <div className="text-center py-10 text-gray-300 text-sm select-none">暂无任务</div>
                  ) : (
                    colTasks.map((task: any) => (
                      <TaskCard key={task.id} task={task} onDragStart={handleDragStart} />
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
          }}
        />
      )}
    </div>
  );
}
