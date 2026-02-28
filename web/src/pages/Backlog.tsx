import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PriorityBadge } from '@/components/ui/Badge';
import { formatRelative, cn } from '@/lib/utils';

function CreateBacklogModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: api.getDomains });
  const [form, setForm] = useState({ title: '', description: '', priority: 'P2', domain: '', source: '', estimated_scope: '' });

  const mut = useMutation({
    mutationFn: api.createBacklogItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backlog'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-md p-6 animate-slide-up mx-4">
        <h2 className="text-base font-semibold text-slate-100 mb-5">录入需求池</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">需求标题 *</label>
            <input className="input w-full" placeholder="简短描述这个需求" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">详细描述</label>
            <textarea className="input w-full resize-none" rows={3} placeholder="详细描述需求内容和背景" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">优先级</label>
              <select className="input w-full" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['P0', 'P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">预估规模</label>
              <select className="input w-full" value={form.estimated_scope} onChange={e => setForm(f => ({ ...f, estimated_scope: e.target.value }))}>
                <option value="">未知</option>
                <option value="small">Small（1-3天）</option>
                <option value="medium">Medium（1-2周）</option>
                <option value="large">Large（2周以上）</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">业务板块</label>
              <select className="input w-full" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}>
                <option value="">不选</option>
                {(domains as any[]).map((d: any) => <option key={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">来源</label>
              <input className="input w-full" placeholder="决策者口述" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={() => mut.mutate(form)} disabled={!form.title || mut.isPending} className="btn-primary disabled:opacity-50">
            {mut.isPending ? '录入中...' : '录入'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({ item, onClose }: { item: any; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: api.getMilestones });
  const [form, setForm] = useState({ milestone: '', owner: '', due_date: '', priority: item.priority });

  const mut = useMutation({
    mutationFn: () => api.scheduleBacklogItem(item.backlogId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backlog'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-sm p-6 animate-slide-up mx-4">
        <h2 className="text-base font-semibold text-slate-100 mb-1">排期</h2>
        <p className="text-sm text-slate-500 mb-5">{item.title}</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">里程碑</label>
            <select className="input w-full" value={form.milestone} onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}>
              <option value="">不指定</option>
              {(milestones as any[]).map((m: any) => <option key={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">负责人</label>
            <input className="input w-full" placeholder="agent-01" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">截止日期</label>
            <input type="date" className="input w-full" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
            {mut.isPending ? '排期中...' : '确认排期'}
          </button>
        </div>
      </div>
    </div>
  );
}

const scopeLabels: Record<string, string> = { small: 'S', medium: 'M', large: 'L' };
const scopeColors: Record<string, string> = {
  small: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  large: 'bg-red-500/20 text-red-400',
};

export default function Backlog() {
  const [showCreate, setShowCreate] = useState(false);
  const [scheduleItem, setScheduleItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('pool');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['backlog', statusFilter],
    queryFn: () => api.getBacklog(statusFilter ? { status: statusFilter } : undefined),
  });

  const poolCount = (items as any[]).filter((i: any) => i.status === 'pool').length;

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">需求池</h1>
          <p className="text-sm text-slate-500 mt-0.5">{poolCount} 个需求待处理</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 录入需求</button>
      </div>

      {/* Filter */}
      <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5 mb-5 w-fit">
        {[['pool', '待排期'], ['scheduled', '已排期'], ['', '全部']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            className={cn(
              'px-3 py-1.5 text-xs rounded-md transition-all',
              statusFilter === val ? 'bg-brand-500 text-white font-medium' : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2.5">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-20 animate-pulse" />)
        ) : (items as any[]).length === 0 ? (
          <div className="card p-12 text-center text-slate-600">需求池为空</div>
        ) : (
          (items as any[]).map((item: any) => (
            <div key={item.id} className="card p-4 hover:border-slate-700 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-mono text-xs text-slate-600">{item.backlogId}</span>
                    <PriorityBadge priority={item.priority} />
                    {item.estimatedScope && (
                      <span className={cn('badge text-xs', scopeColors[item.estimatedScope])}>
                        {scopeLabels[item.estimatedScope]}
                      </span>
                    )}
                    {item.status === 'scheduled' && (
                      <span className="badge bg-teal-500/20 text-teal-400">已排期</span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium text-slate-200">{item.title}</h3>
                  {item.description && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {item.domain && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${item.domain.color}20`, color: item.domain.color }}>
                        {item.domain.name}
                      </span>
                    )}
                    {item.source && <span className="text-xs text-slate-600">来自: {item.source}</span>}
                    <span className="text-xs text-slate-700">{formatRelative(item.createdAt)}</span>
                  </div>
                </div>

                {item.status === 'pool' && (
                  <button
                    onClick={() => setScheduleItem(item)}
                    className="flex-shrink-0 btn-primary text-xs h-8"
                  >
                    排期
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && <CreateBacklogModal onClose={() => setShowCreate(false)} />}
      {scheduleItem && <ScheduleModal item={scheduleItem} onClose={() => setScheduleItem(null)} />}
    </div>
  );
}
