import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { formatDate, cn } from '@/lib/utils';

export default function Goals() {
  const qc = useQueryClient();
  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: api.getGoals });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', target_date: '', set_by: '' });

  const createMut = useMutation({
    mutationFn: api.createGoal,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); setShowCreate(false); },
  });

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">目标管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">OKR 式目标跟踪</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 设定目标</button>
      </div>

      {showCreate && (
        <div className="card p-5 mb-5 animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">设定新目标</h3>
          <div className="space-y-3 mb-3">
            <input className="input w-full" placeholder="目标标题，如 v1.0 MVP 上线" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <textarea className="input w-full resize-none" rows={2} placeholder="目标描述" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="input" placeholder="目标日期" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} />
              <input className="input" placeholder="设定人" value={form.set_by} onChange={e => setForm(f => ({ ...f, set_by: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMut.mutate(form)} disabled={!form.title} className="btn-primary">创建</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost">取消</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {(goals as any[]).map((goal: any) => {
          const daysLeft = goal.targetDate
            ? Math.floor((new Date(goal.targetDate).getTime() - Date.now()) / 86400000)
            : null;

          return (
            <div key={goal.id} className="card p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-slate-100 text-lg">{goal.title}</h3>
                  {goal.description && <p className="text-sm text-slate-500 mt-1">{goal.description}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-600">
                    {goal.setBy && <span>设定人: {goal.setBy}</span>}
                    {goal.targetDate && <span>目标日期: {formatDate(goal.targetDate)}</span>}
                    {daysLeft !== null && (
                      <span className={daysLeft < 0 ? 'text-red-400' : daysLeft <= 14 ? 'text-yellow-400' : ''}>
                        {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : `剩余 ${daysLeft} 天`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    'text-2xl font-bold',
                    goal.health === 'green' ? 'text-green-400' :
                    goal.health === 'yellow' ? 'text-yellow-400' : 'text-red-400'
                  )}>
                    {goal.overallProgress}%
                  </div>
                  <div className="text-xs text-slate-600">整体进度</div>
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400"
                  style={{ width: `${goal.overallProgress}%` }}
                />
              </div>

              {/* Objectives */}
              {goal.objectives?.length > 0 && (
                <div className="space-y-2">
                  {goal.objectives.map((obj: any) => (
                    <div key={obj.id} className="bg-slate-800/40 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-300">{obj.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600">权重 {(obj.weight * 100).toFixed(0)}%</span>
                          <span className="text-sm font-medium text-slate-400">{obj.progress}%</span>
                        </div>
                      </div>
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500/70 rounded-full" style={{ width: `${obj.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {(goals as any[]).length === 0 && (
          <div className="card p-12 text-center text-slate-600">还没有设定目标</div>
        )}
      </div>
    </div>
  );
}
