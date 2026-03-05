import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function Archive() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['archived-tasks'],
    queryFn: () => api.getArchivedTasks(),
  });

  const unarchive = useMutation({
    mutationFn: (taskId: string) => api.unarchiveTask(taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['archived-tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const STATUS_COLORS: Record<string, string> = {
    backlog: 'bg-gray-100 text-gray-600',
    planned: 'bg-blue-100 text-blue-700',
    active: 'bg-amber-100 text-amber-700',
    review: 'bg-purple-100 text-purple-700',
    done: 'bg-green-100 text-green-700',
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">归档箱</h1>
          <p className="text-sm text-gray-500 mt-1">查看和恢复已归档的任务</p>
        </div>
        <span className="text-sm text-gray-400">{(tasks as any[]).length} 个已归档</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : (tasks as any[]).length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-gray-500">暂无归档任务</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {(tasks as any[]).map((task: any) => (
            <div key={task.taskId} className="flex items-center px-4 py-3 hover:bg-gray-50 group">
              <span className="text-xs font-mono text-gray-400 w-16 flex-shrink-0">{task.taskId}</span>
              <button
                onClick={() => navigate(`/tasks/${task.taskId}`)}
                className="flex-1 text-sm text-gray-700 text-left truncate hover:text-indigo-600"
              >
                {task.title}
              </button>
              <span className={`text-[10px] px-1.5 py-0.5 rounded mr-3 ${STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-500'}`}>
                {task.status}
              </span>
              {task.archivedAt && (
                <span className="text-[10px] text-gray-400 mr-3">{task.archivedAt.split('T')[0]}</span>
              )}
              <button
                onClick={() => unarchive.mutate(task.taskId)}
                disabled={unarchive.isPending}
                className="text-xs text-indigo-500 hover:text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                恢复
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
