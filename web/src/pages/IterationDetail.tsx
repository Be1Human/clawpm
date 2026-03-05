import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

const STATUS_OPTIONS = [
  { value: 'planned', label: '未开始' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已完成' },
];

const TASK_STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-gray-100 text-gray-600',
  planned: 'bg-blue-100 text-blue-700',
  active: 'bg-amber-100 text-amber-700',
  review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
};

export default function IterationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addTaskId, setAddTaskId] = useState('');
  const [editForm, setEditForm] = useState<any>({});

  const { data: iteration, isLoading } = useQuery({
    queryKey: ['iteration', id],
    queryFn: () => api.getIteration(Number(id)),
    enabled: !!id,
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => api.updateIteration(Number(id), data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iteration', id] });
      qc.invalidateQueries({ queryKey: ['iterations'] });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.deleteIteration(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iterations'] });
      navigate('/iterations');
    },
  });

  const addTask = useMutation({
    mutationFn: (taskId: string) => api.addTaskToIteration(Number(id), taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iteration', id] });
      setAddTaskId('');
    },
  });

  const removeTask = useMutation({
    mutationFn: (taskId: string) => api.removeTaskFromIteration(Number(id), taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iteration', id] });
    },
  });

  if (isLoading) return <div className="p-6 text-gray-500">加载中...</div>;
  if (!iteration) return <div className="p-6 text-gray-500">迭代不存在</div>;

  const iter = iteration as any;
  const stats = iter.stats || { totalTasks: 0, completedTasks: 0, completionRate: 0, statusBreakdown: {} };
  const tasks = iter.tasks || [];

  const startEdit = () => {
    setEditForm({
      name: iter.name,
      description: iter.description || '',
      start_date: iter.startDate || '',
      end_date: iter.endDate || '',
      status: iter.status,
    });
    setEditing(true);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <button onClick={() => navigate('/iterations')} className="text-sm text-gray-400 hover:text-gray-600">
          迭代
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">{iter.name}</span>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        {editing ? (
          <div className="space-y-3">
            <input
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full text-lg font-bold border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <textarea
              value={editForm.description}
              onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-16 resize-none outline-none focus:ring-1 focus:ring-indigo-300"
              placeholder="描述"
            />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-gray-400">状态</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-400">开始日期</label>
                <input type="date" value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400">结束日期</label>
                <input type="date" value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => updateMut.mutate(editForm)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">保存</button>
              <button onClick={() => setEditing(false)} className="text-sm text-gray-500 px-3 py-1.5">取消</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{iter.name}</h1>
                {iter.description && <p className="text-sm text-gray-500 mt-1">{iter.description}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  {STATUS_OPTIONS.find(s => s.value === iter.status) && (
                    <span className={`px-2 py-0.5 rounded ${
                      iter.status === 'active' ? 'bg-blue-100 text-blue-700' :
                      iter.status === 'completed' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {STATUS_OPTIONS.find(s => s.value === iter.status)?.label}
                    </span>
                  )}
                  {iter.startDate && <span>{iter.startDate} ~ {iter.endDate || '?'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={startEdit} className="text-xs text-indigo-500 hover:text-indigo-700">编辑</button>
                <button
                  onClick={() => { if (confirm('确定删除此迭代？')) deleteMut.mutate(); }}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  删除
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.totalTasks}</p>
                <p className="text-[10px] text-gray-400">总任务</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{stats.completedTasks}</p>
                <p className="text-[10px] text-gray-400">已完成</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-indigo-600">{Math.round(stats.completionRate)}%</p>
                <p className="text-[10px] text-gray-400">完成率</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.totalTasks - stats.completedTasks}</p>
                <p className="text-[10px] text-gray-400">剩余</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">关联任务 ({tasks.length})</h3>
          <div className="flex items-center gap-2">
            <input
              placeholder="输入任务 ID (如 U-001)"
              value={addTaskId}
              onChange={e => setAddTaskId(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && addTaskId.trim()) addTask.mutate(addTaskId.trim()); }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 w-40 outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <button
              onClick={() => { if (addTaskId.trim()) addTask.mutate(addTaskId.trim()); }}
              disabled={!addTaskId.trim() || addTask.isPending}
              className="text-xs bg-indigo-600 text-white px-2 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">暂无关联任务</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {tasks.map((task: any) => (
              <div key={task.taskId} className="flex items-center px-4 py-2.5 hover:bg-gray-50 group">
                <span className="text-xs font-mono text-gray-400 w-16 flex-shrink-0">{task.taskId}</span>
                <button
                  onClick={() => navigate(`/tasks/${task.taskId}`)}
                  className="flex-1 text-sm text-gray-700 text-left truncate hover:text-indigo-600"
                >
                  {task.title}
                </button>
                <span className={`text-[10px] px-1.5 py-0.5 rounded mr-3 ${TASK_STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-500'}`}>
                  {task.status}
                </span>
                {task.owner && <span className="text-[10px] text-gray-400 mr-3">{task.owner}</span>}
                <button
                  onClick={() => removeTask.mutate(task.taskId)}
                  className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
