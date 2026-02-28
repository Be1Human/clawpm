import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PriorityBadge } from '@/components/ui/Badge';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import CreateTaskModal from '@/components/CreateTaskModal';

const TYPE_ICON: Record<string, string> = {
  epic: '◈', story: '◎', task: '◻', subtask: '○',
};
const TYPE_COLOR: Record<string, string> = {
  epic: 'text-purple-400', story: 'text-blue-400', task: 'text-emerald-400', subtask: 'text-slate-500',
};

const COLUMNS = [
  { key: 'planned', label: '待开始', color: 'border-t-slate-600' },
  { key: 'active', label: '进行中', color: 'border-t-blue-500' },
  { key: 'review', label: '评审中', color: 'border-t-purple-500' },
  { key: 'blocked', label: '已阻塞', color: 'border-t-red-500' },
  { key: 'done', label: '已完成', color: 'border-t-green-500' },
];

function ProgressMini({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 40 ? 'bg-blue-500' : 'bg-slate-600';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-7 text-right">{value}%</span>
    </div>
  );
}

function TaskCard({ task }: { task: any }) {
  const days = getDaysUntil(task.dueDate);
  const isOverdue = days !== null && days < 0;
  const isUrgent = days !== null && days >= 0 && days <= 3;

  return (
    <Link to={`/tasks/${task.taskId}`} className="block">
      <div className="card p-3.5 hover:border-slate-700 hover:bg-slate-800/80 transition-all duration-150 cursor-pointer group">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-slate-600 group-hover:text-slate-500">{task.taskId}</span>
            {task.type && task.type !== 'task' && (
              <span className={cn('text-xs', TYPE_COLOR[task.type] || 'text-slate-500')}>
                {TYPE_ICON[task.type] || ''}
              </span>
            )}
          </div>
          <PriorityBadge priority={task.priority} />
        </div>
        <p className="text-sm text-slate-200 leading-snug mb-3 line-clamp-2">{task.title}</p>

        {task.progress > 0 && <ProgressMini value={task.progress} />}

        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            {task.domain && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: `${task.domain.color}20`, color: task.domain.color }}
              >
                {task.domain.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {task.owner && (
              <span className="w-5 h-5 rounded-full bg-brand-500/30 flex items-center justify-center text-xs text-brand-400">
                {task.owner[0]?.toUpperCase()}
              </span>
            )}
            {task.dueDate && (
              <span className={cn(
                'text-xs',
                isOverdue ? 'text-red-400' : isUrgent ? 'text-yellow-400' : 'text-slate-600'
              )}>
                {isOverdue ? `逾期 ${Math.abs(days!)}d` : formatDate(task.dueDate)}
              </span>
            )}
          </div>
        </div>

        {task.blocker && (
          <div className="mt-2 text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded truncate">
            🚧 {task.blocker}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function KanbanBoard() {
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks(),
    refetchInterval: 15000,
  });

  const filtered = filter
    ? tasks.filter((t: any) =>
        t.title.toLowerCase().includes(filter.toLowerCase()) ||
        t.taskId.toLowerCase().includes(filter.toLowerCase()) ||
        t.owner?.toLowerCase().includes(filter.toLowerCase())
      )
    : tasks;

  const byStatus = (status: string) => filtered.filter((t: any) => t.status === status);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">看板</h1>
          <p className="text-xs text-slate-500">{tasks.length} 个任务</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="input w-52 h-8 text-sm"
            placeholder="搜索任务..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button onClick={() => setShowCreate(true)} className="btn-primary h-8 flex items-center">
            + 新建任务
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-6 py-4">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map(col => {
            const colTasks = byStatus(col.key);
            return (
              <div key={col.key} className="w-72 flex flex-col">
                {/* Column Header */}
                <div className={cn('card border-t-2 px-3 py-2.5 mb-3 flex items-center justify-between', col.color)}>
                  <span className="text-sm font-medium text-slate-300">{col.label}</span>
                  <span className="text-xs bg-slate-800 text-slate-500 rounded-full w-5 h-5 flex items-center justify-center">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                  {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="card h-28 animate-pulse bg-slate-800" />
                    ))
                  ) : colTasks.length === 0 ? (
                    <div className="text-center py-8 text-slate-700 text-sm">空</div>
                  ) : (
                    colTasks.map((task: any) => <TaskCard key={task.id} task={task} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
