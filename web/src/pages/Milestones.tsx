import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { formatDate, cn } from '@/lib/utils';

export default function Milestones() {
  const qc = useQueryClient();
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: api.getMilestones });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', target_date: '', description: '' });

  const createMut = useMutation({
    mutationFn: api.createMilestone,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['milestones'] }); setShowCreate(false); setForm({ name: '', target_date: '', description: '' }); },
  });

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">里程碑</h1>
          <p className="text-sm text-slate-500 mt-0.5">{(milestones as any[]).length} 个里程碑</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 新建里程碑</button>
      </div>

      {showCreate && (
        <div className="card p-5 mb-5 animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">新建里程碑</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <input className="input col-span-1" placeholder="里程碑名称" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <input type="date" className="input" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
            <input className="input" placeholder="描述（可选）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate(form)} disabled={!form.name} className="btn-primary">创建</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost">取消</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {(milestones as any[]).map((m: any) => {
          const isActive = m.status === 'active';
          const daysLeft = m.targetDate
            ? Math.floor((new Date(m.targetDate).getTime() - Date.now()) / 86400000)
            : null;

          return (
            <div key={m.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-100">{m.name}</h3>
                  {m.description && <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>}
                </div>
                <span className={cn('badge', isActive ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-500')}>
                  {isActive ? '进行中' : m.status}
                </span>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>{m.doneCount}/{m.taskCount} 任务完成</span>
                  <span className="font-medium text-slate-300">{m.progress}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', m.progress === 100 ? 'bg-green-500' : 'bg-brand-500')}
                    style={{ width: `${m.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">目标日期: {formatDate(m.targetDate)}</span>
                {daysLeft !== null && (
                  <span className={cn(
                    'font-medium',
                    daysLeft < 0 ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : 'text-slate-500'
                  )}>
                    {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : `剩余 ${daysLeft} 天`}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {(milestones as any[]).length === 0 && (
          <div className="col-span-2 card p-12 text-center text-slate-600">还没有里程碑</div>
        )}
      </div>
    </div>
  );
}
