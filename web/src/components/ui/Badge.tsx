import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const priorityConfig: Record<string, { label: string; className: string }> = {
  P0: { label: 'P0', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  P1: { label: 'P1', className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
  P2: { label: 'P2', className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  P3: { label: 'P3', className: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' },
};

const statusStyles: Record<string, { key: string; className: string; dot: string }> = {
  backlog:   { key: 'status.backlog',   className: 'bg-slate-500/20 text-slate-400',  dot: 'bg-slate-400' },
  planned:   { key: 'status.planned',   className: 'bg-blue-500/20 text-blue-400',    dot: 'bg-blue-400' },
  active:    { key: 'status.active',    className: 'bg-indigo-500/20 text-indigo-400', dot: 'bg-indigo-400' },
  review:    { key: 'status.review',    className: 'bg-amber-500/20 text-amber-400',  dot: 'bg-amber-400' },
  done:      { key: 'status.done',      className: 'bg-green-500/20 text-green-400',  dot: 'bg-green-400' },
  pool:      { key: 'status.pool',      className: 'bg-indigo-500/20 text-indigo-400', dot: 'bg-indigo-400' },
  scheduled: { key: 'status.scheduled', className: 'bg-teal-500/20 text-teal-400',    dot: 'bg-teal-400' },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const cfg = priorityConfig[priority] || priorityConfig.P2;
  return <span className={cn('badge', cfg.className)}>{cfg.label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const cfg = statusStyles[status] || statusStyles.backlog;
  return (
    <span className={cn('badge gap-1.5', cfg.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {t(cfg.key)}
    </span>
  );
}

export function HealthBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-green-500/20 text-green-400' :
              score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400';
  return <span className={cn('badge', cls)}>{score}</span>;
}
