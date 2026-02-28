import { cn } from '@/lib/utils';

const priorityConfig: Record<string, { label: string; className: string }> = {
  P0: { label: 'P0', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  P1: { label: 'P1', className: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
  P2: { label: 'P2', className: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
  P3: { label: 'P3', className: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' },
};

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  planned: { label: '待开始', className: 'bg-slate-700/50 text-slate-400', dot: 'bg-slate-500' },
  active: { label: '进行中', className: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-400' },
  review: { label: '评审中', className: 'bg-purple-500/20 text-purple-400', dot: 'bg-purple-400' },
  blocked: { label: '已阻塞', className: 'bg-red-500/20 text-red-400', dot: 'bg-red-400' },
  done: { label: '已完成', className: 'bg-green-500/20 text-green-400', dot: 'bg-green-400' },
  cancelled: { label: '已取消', className: 'bg-slate-700/30 text-slate-500', dot: 'bg-slate-600' },
  pool: { label: '需求池', className: 'bg-indigo-500/20 text-indigo-400', dot: 'bg-indigo-400' },
  scheduled: { label: '已排期', className: 'bg-teal-500/20 text-teal-400', dot: 'bg-teal-400' },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const cfg = priorityConfig[priority] || priorityConfig.P2;
  return <span className={cn('badge', cfg.className)}>{cfg.label}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.planned;
  return (
    <span className={cn('badge gap-1.5', cfg.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export function HealthBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-green-500/20 text-green-400' :
              score >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400';
  return <span className={cn('badge', cls)}>{score}</span>;
}
