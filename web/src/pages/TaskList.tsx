import { useQuery } from '@tanstack/react-query';

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import CreateTaskModal from '@/components/CreateTaskModal';

const TYPE_LABEL: Record<string, string> = {
  epic: '史诗', story: '故事', task: '任务', subtask: '子任务',
};
const TYPE_COLOR: Record<string, string> = {
  epic: 'text-purple-400 bg-purple-500/10',
  story: 'text-blue-400 bg-blue-500/10',
  task: 'text-emerald-400 bg-emerald-500/10',
  subtask: 'text-slate-400 bg-slate-500/10',
};

export default function TaskList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') || '';
  const typeFilter = searchParams.get('type') || '';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, typeFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      return api.getTasks(Object.keys(params).length ? params : undefined);
    },
  });

  const statuses = ['', 'planned', 'active', 'review', 'blocked', 'done'];
  const statusLabels: Record<string, string> = { '': '全部', planned: '待开始', active: '进行中', review: '评审中', blocked: '已阻塞', done: '已完成' };
  const types = ['', 'epic', 'story', 'task', 'subtask'];
  const typeLabels: Record<string, string> = { '': '全部类型', epic: '史诗', story: '用户故事', task: '任务', subtask: '子任务' };

  const filtered = search
    ? tasks.filter((t: any) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.taskId.toLowerCase().includes(search.toLowerCase())
      )
    : tasks;

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">任务列表</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tasks.length} 个任务</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 新建任务</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* 状态筛选 */}
        <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => {
                const p: Record<string, string> = {};
                if (s) p.status = s;
                if (typeFilter) p.type = typeFilter;
                setSearchParams(p);
              }}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-all',
                statusFilter === s ? 'bg-brand-500 text-white font-medium' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {statusLabels[s]}
            </button>
          ))}
        </div>
        {/* 类型筛选 */}
        <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5">
          {types.map(t => (
            <button
              key={t}
              onClick={() => {
                const p: Record<string, string> = {};
                if (statusFilter) p.status = statusFilter;
                if (t) p.type = t;
                setSearchParams(p);
              }}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md transition-all',
                typeFilter === t ? 'bg-brand-500 text-white font-medium' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>
        <input
          className="input w-52 h-8 text-sm"
          placeholder="搜索..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">ID</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">标题</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-20">类型</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">状态</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-16">优先级</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">板块</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">负责人</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-28">进度</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">截止</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td colSpan={8} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-600">没有任务</td></tr>
            ) : (
              filtered.map((task: any) => {
                const days = getDaysUntil(task.dueDate);
                const isOverdue = days !== null && days < 0;
                return (
                  <tr key={task.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.taskId}`} className="font-mono text-xs text-slate-500 hover:text-brand-400">{task.taskId}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.taskId}`} className="text-slate-200 hover:text-brand-400 line-clamp-1">{task.title}</Link>
                      {task.blocker && <div className="text-xs text-red-400 mt-0.5 truncate">🚧 {task.blocker}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {task.type ? (
                        <span className={cn('text-xs px-1.5 py-0.5 rounded', TYPE_COLOR[task.type] || 'text-slate-400 bg-slate-500/10')}>
                          {TYPE_LABEL[task.type] || task.type}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-4 py-3">
                      {task.domain ? (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${task.domain.color}20`, color: task.domain.color }}>
                          {task.domain.name}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {task.owner ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-brand-500/30 flex items-center justify-center text-xs text-brand-400">{task.owner[0].toUpperCase()}</span>
                          <span className="text-xs text-slate-400">{task.owner}</span>
                        </div>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 w-7">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs', isOverdue ? 'text-red-400' : 'text-slate-500')}>
                        {task.dueDate ? formatDate(task.dueDate) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}

    </div>
  );
}
