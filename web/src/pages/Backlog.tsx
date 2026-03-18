import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { PriorityBadge } from '@/components/ui/Badge';
import { formatRelative, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

function CreateBacklogModal({
  onClose,
  defaultParentId,
}: {
  onClose: () => void;
  defaultParentId?: string;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const { data: domains = [] } = useQuery({ queryKey: ['domains', activeProject], queryFn: api.getDomains });
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'P2',
    domain: '',
    source: '',
    estimated_scope: '',
    parent_backlog_id: defaultParentId || '',
  });

  const mut = useMutation({
    mutationFn: api.createBacklogItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backlog'] });
      qc.invalidateQueries({ queryKey: ['backlog-tree'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-md p-6 animate-slide-up mx-4">
        <h2 className="text-base font-semibold text-slate-100 mb-5">{t('backlog.enterBacklog')}</h2>
        <div className="space-y-4">
          {form.parent_backlog_id && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
              父需求池节点：{form.parent_backlog_id}
            </div>
          )}
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backlog'] });
      qc.invalidateQueries({ queryKey: ['backlog-tree'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-tree-list'] });
      qc.invalidateQueries({ queryKey: ['task-tree-kanban'] });
      onClose();
    },
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

function BacklogTreeRow({
  item,
  depth,
  collapsedIds,
  onToggleCollapse,
  onCreateChild,
  onSchedule,
}: {
  item: any;
  depth: number;
  collapsedIds: Set<string>;
  onToggleCollapse: (backlogId: string) => void;
  onCreateChild: (parentBacklogId: string) => void;
  onSchedule: (item: any) => void;
}) {
  const hasChildren = (item.children || []).length > 0;
  const collapsed = collapsedIds.has(item.backlogId);

  return (
    <>
      <div className="card p-4 hover:border-slate-700 transition-colors">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 min-w-0">
              <button
                type="button"
                onClick={() => hasChildren && onToggleCollapse(item.backlogId)}
                className={cn(
                  'w-4 h-4 mt-1 flex items-center justify-center text-[10px] text-slate-500 flex-shrink-0',
                  !hasChildren && 'invisible',
                  !collapsed && 'rotate-90'
                )}
                style={{ marginLeft: `${depth * 18}px` }}
              >
                ▶
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-mono text-xs text-slate-600">{item.backlogId}</span>
                  <PriorityBadge priority={item.priority} />
                  {item.estimatedScope && (
                    <span className={cn('badge text-xs', scopeColors[item.estimatedScope])}>
                      {scopeLabels[item.estimatedScope]}
                    </span>
                  )}
                  {item.status === 'scheduled' && (
                    <span className="badge bg-teal-500/20 text-teal-400">{'已排期'}</span>
                  )}
                </div>
                <h3 className="text-sm font-medium text-slate-200">{item.title}</h3>
                {item.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {item.domain && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${item.domain.color}20`, color: item.domain.color }}>
                      {item.domain.name}
                    </span>
                  )}
                  {item.source && <span className="text-xs text-slate-600">来源：{item.source}</span>}
                  <span className="text-xs text-slate-700">{formatRelative(item.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <button
              onClick={() => onCreateChild(item.backlogId)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
            >
              + 子需求
            </button>
            {item.status === 'pool' && (
              <button
                onClick={() => onSchedule(item)}
                className="flex-shrink-0 btn-primary text-xs h-8"
              >
                排期
              </button>
            )}
          </div>
        </div>
      </div>

      {!collapsed && (item.children || []).length > 0 && (
        <div className="space-y-2.5">
          {(item.children || []).map((child: any) => (
            <BacklogTreeRow
              key={child.id}
              item={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              onCreateChild={onCreateChild}
              onSchedule={onSchedule}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function Backlog() {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [scheduleItem, setScheduleItem] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('pool');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const activeProject = useActiveProject();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['backlog-tree', activeProject, statusFilter],
    queryFn: () => api.getBacklogTree(statusFilter ? { status: statusFilter } : undefined),
  });

  const poolCount = countBacklogByStatus(items as any[], 'pool');

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
          <p className="text-sm text-slate-500 mt-0.5">{t('backlog.pendingCount', { count: poolCount })}，按需求树展开</p>
        </div>
        <button onClick={() => { setCreateParentId(undefined); setShowCreate(true); }} className="btn-primary">{t('backlog.addItem')}</button>
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
            <BacklogTreeRow
              key={item.id}
              item={item}
              depth={0}
              collapsedIds={collapsedIds}
              onToggleCollapse={(backlogId) => {
                setCollapsedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(backlogId)) next.delete(backlogId); else next.add(backlogId);
                  return next;
                });
              }}
              onCreateChild={(parentBacklogId) => {
                setCreateParentId(parentBacklogId);
                setShowCreate(true);
              }}
              onSchedule={setScheduleItem}
            />
          ))
        )}
      </div>

      {showCreate && <CreateBacklogModal defaultParentId={createParentId} onClose={() => { setShowCreate(false); setCreateParentId(undefined); }} />}
      {scheduleItem && <ScheduleModal item={scheduleItem} onClose={() => setScheduleItem(null)} />}
    </div>
  );
}

function countBacklogByStatus(nodes: any[], status: string): number {
  return nodes.reduce((acc, node) => {
    const self = node.status === status ? 1 : 0;
    return acc + self + countBacklogByStatus(node.children || [], status);
  }, 0);
}
