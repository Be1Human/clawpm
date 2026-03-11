import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { PriorityBadge } from '@/components/ui/Badge';
import { formatRelative, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

function CreateBacklogModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const { data: domains = [] } = useQuery({ queryKey: ['domains', activeProject], queryFn: api.getDomains });
  const [form, setForm] = useState({ title: '', description: '', priority: 'P2', domain: '', source: '', estimated_scope: '' });

  const mut = useMutation({
    mutationFn: api.createBacklogItem,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backlog'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-md p-6 animate-slide-up mx-4">
        <h2 className="text-base font-semibold text-slate-100 mb-5">{t('backlog.enterBacklog')}</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.itemTitle')}</label>
            <input className="input w-full" placeholder={t('backlog.titlePlaceholder')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.detailedDescription')}</label>
            <textarea className="input w-full resize-none" rows={3} placeholder={t('backlog.descriptionPlaceholder')} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">{t('priority.label')}</label>
              <select className="input w-full" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['P0', 'P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.estimatedScope')}</label>
              <select className="input w-full" value={form.estimated_scope} onChange={e => setForm(f => ({ ...f, estimated_scope: e.target.value }))}>
                <option value="">{t('backlog.unknown')}</option>
                <option value="small">{t('backlog.scopeSmall')}</option>
                <option value="medium">{t('backlog.scopeMedium')}</option>
                <option value="large">{t('backlog.scopeLarge')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.domain')}</label>
              <select className="input w-full" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}>
                <option value="">{t('backlog.noDomain')}</option>
                {(domains as any[]).map((d: any) => <option key={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.source')}</label>
              <input className="input w-full" placeholder={t('backlog.sourcePlaceholder')} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={() => mut.mutate(form)} disabled={!form.title || mut.isPending} className="btn-primary disabled:opacity-50">
            {mut.isPending ? t('backlog.submitting') : t('backlog.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({ item, onClose }: { item: any; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones', activeProject], queryFn: api.getMilestones });
  const [form, setForm] = useState({ milestone: '', owner: '', due_date: '', priority: item.priority });

  const mut = useMutation({
    mutationFn: () => api.scheduleBacklogItem(item.backlogId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backlog'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-sm p-6 animate-slide-up mx-4">
        <h2 className="text-base font-semibold text-slate-100 mb-1">{t('backlog.scheduleTitle')}</h2>
        <p className="text-sm text-slate-500 mb-5">{item.title}</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.milestone')}</label>
            <select className="input w-full" value={form.milestone} onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}>
              <option value="">{t('backlog.noMilestone')}</option>
              {(milestones as any[]).map((m: any) => <option key={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.owner')}</label>
            <input className="input w-full" placeholder="agent-01" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">{t('backlog.dueDate')}</label>
            <input type="date" className="input w-full" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="btn-primary">
            {mut.isPending ? t('backlog.scheduling') : t('backlog.confirmSchedule')}
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
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [scheduleItem, setScheduleItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('pool');
  const activeProject = useActiveProject();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['backlog', activeProject, statusFilter],
    queryFn: () => api.getBacklog(statusFilter ? { status: statusFilter } : undefined),
  });

  const poolCount = (items as any[]).filter((i: any) => i.status === 'pool').length;

  const filterTabs: [string, string][] = [
    ['pool', t('backlog.pendingSchedule')],
    ['scheduled', t('backlog.scheduled')],
    ['', t('backlog.all')],
  ];

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{t('backlog.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('backlog.pendingCount', { count: poolCount })}</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">{t('backlog.addItem')}</button>
      </div>

      {/* Filter */}
      <div className="flex bg-slate-800/60 rounded-lg p-1 gap-0.5 mb-5 w-fit">
        {filterTabs.map(([val, label]) => (
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
          <div className="card p-12 text-center text-slate-600">{t('backlog.empty')}</div>
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
                      <span className="badge bg-teal-500/20 text-teal-400">{t('status.scheduled')}</span>
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
                    {item.source && <span className="text-xs text-slate-600">{t('backlog.from', { source: item.source })}</span>}
                    <span className="text-xs text-slate-700">{formatRelative(item.createdAt)}</span>
                  </div>
                </div>

                {item.status === 'pool' && (
                  <button
                    onClick={() => setScheduleItem(item)}
                    className="flex-shrink-0 btn-primary text-xs h-8"
                  >
                    {t('backlog.schedule')}
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
