import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import CreateTaskModal from '@/components/CreateTaskModal';

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#ede9fe', text: '#7c3aed' },
  feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug:     { bg: '#fee2e2', text: '#b91c1c' },
  spike:   { bg: '#ffedd5', text: '#c2410c' },
  chore:   { bg: '#f1f5f9', text: '#475569' },
};

function getLabels(task: any): string[] {
  try { return JSON.parse(task.labels || '[]'); } catch { return []; }
}

export default function TaskList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') || '';
  const labelFilter = searchParams.get('label') || '';

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, labelFilter],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (labelFilter) params.label = labelFilter;
      return api.getTasks(Object.keys(params).length ? params : undefined);
    },
  });

  const statuses = ['', 'backlog', 'planned', 'active', 'review', 'done'];
  const statusLabels: Record<string, string> = {
    '': '全部', backlog: '未排期', planned: '未开始', active: '进行中', review: '验收中', done: '已完成',
  };

  const filtered = search
    ? tasks.filter((t: any) =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.taskId.toLowerCase().includes(search.toLowerCase()))
    : tasks;

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">节点列表</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tasks.length} 个节点</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 新建节点</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5">
          {statuses.map(s => (
            <button key={s}
              onClick={() => {
                const p: Record<string, string> = {};
                if (s) p.status = s;
                if (labelFilter) p.label = labelFilter;
                setSearchParams(p);
              }}
              className={cn('px-3 py-1.5 text-xs rounded-md transition-all',
                statusFilter === s ? 'bg-brand-500 text-white font-medium' : 'text-slate-500 hover:text-slate-300')}>
              {statusLabels[s]}
            </button>
          ))}
        </div>
        <input className="input w-52 h-8 text-sm" placeholder="搜索..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">ID</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">标题</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-20">标签</th>
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
                  <td colSpan={9} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-slate-600">没有节点</td></tr>
            ) : (
              filtered.map((task: any) => {
                const days = getDaysUntil(task.dueDate);
                const isOverdue = days !== null && days < 0;
                const labels = getLabels(task);
                return (
                  <tr key={task.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.taskId}`} className="font-mono text-xs text-slate-500 hover:text-brand-400">{task.taskId}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.taskId}`} className="text-slate-200 hover:text-brand-400 line-clamp-1">{task.title}</Link>
                      {task.blocker && <div className="text-xs text-red-400 mt-0.5 truncate">⚠ {task.blocker}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {labels.slice(0, 1).map(l => {
                        const c = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
                        return (
                          <span key={l} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: c.bg, color: c.text }}>{l}</span>
                        );
                      })}
                      {labels.length === 0 && <span className="text-slate-700">—</span>}
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
