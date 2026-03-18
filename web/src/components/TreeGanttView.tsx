import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  backlog: 'bg-slate-300',
  planned: 'bg-blue-400',
  active: 'bg-indigo-500',
  review: 'bg-amber-500',
  done: 'bg-emerald-500',
};

const STATUS_LABEL_KEY: Record<string, string> = {
  backlog: 'status.backlog',
  planned: 'status.planned',
  active: 'status.active',
  review: 'status.review',
  done: 'status.done',
};

function parseDate(s?: string) {
  return s ? new Date(s.slice(0, 10)) : null;
}

function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function flattenVisibleRows(nodes: any[], collapsedIds: Set<string>, depth = 0): Array<{ node: any; depth: number }> {
  return nodes.flatMap(node => {
    const rows = [{ node, depth }];
    if (!collapsedIds.has(node.taskId) && node.children?.length) {
      rows.push(...flattenVisibleRows(node.children, collapsedIds, depth + 1));
    }
    return rows;
  });
}

export default function TreeGanttView({
  tree,
  milestones,
  isLoading,
  t,
  dateLocale,
  title,
  subtitle,
  extraControls,
}: {
  tree: any[];
  milestones: any[];
  isLoading: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dateLocale: string;
  title: string;
  subtitle?: string;
  extraControls?: React.ReactNode;
}) {
  const [grain, setGrain] = useState<'day' | 'week'>('week');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const rows = useMemo(() => flattenVisibleRows(tree, collapsedIds), [tree, collapsedIds]);

  const { startDate, totalDays } = useMemo(() => {
    const today = new Date();
    const dates: Date[] = [today];
    for (const { node } of rows) {
      if (node.startDate) dates.push(new Date(node.startDate));
      if (node.dueDate) dates.push(new Date(node.dueDate));
      if (node.createdAt) dates.push(new Date(node.createdAt));
    }
    for (const milestone of milestones) {
      if (milestone.targetDate) dates.push(new Date(milestone.targetDate));
    }
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 14);
    return { startDate: start, totalDays: diffDays(start, end) };
  }, [rows, milestones]);

  const DAY_W = grain === 'day' ? 28 : 8;
  const totalWidth = totalDays * DAY_W;

  const ticks = useMemo(() => {
    const result: { label: string; offset: number }[] = [];
    const step = grain === 'day' ? 1 : 7;
    for (let i = 0; i <= totalDays; i += step) {
      const d = addDays(startDate, i);
      result.push({
        label: d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
        offset: i * DAY_W,
      });
    }
    return result;
  }, [dateLocale, grain, totalDays, startDate, DAY_W]);

  const today = new Date();
  const todayOffset = diffDays(startDate, today) * DAY_W;

  function calcBar(task: any) {
    const s = parseDate(task.startDate) || parseDate(task.createdAt) || today;
    const e = parseDate(task.dueDate) || addDays(s, 7);
    const left = Math.max(0, diffDays(startDate, s)) * DAY_W;
    const width = Math.max(DAY_W, diffDays(s, e) * DAY_W);
    return { left, width };
  }

  const toggleCollapse = (taskId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">{t('gantt.grain')}:</span>
            {(['day', 'week'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGrain(g)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm transition-colors',
                  grain === g ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-100'
                )}
              >
                {g === 'day' ? t('gantt.byDay') : t('gantt.byWeek')}
              </button>
            ))}
          </div>
          {extraControls}
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-gray-400">{t('iterations.taskCount', { count: rows.length })}</span>
          <div className="flex items-center gap-2 ml-2">
            {Object.entries(STATUS_LABEL_KEY).map(([status, labelKey]) => (
              <span key={status} className="flex items-center gap-1 text-xs text-gray-500">
                <span className={cn('w-3 h-3 rounded-sm inline-block', STATUS_COLOR[status])} />
                {t(labelKey)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-72 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
          <div className="h-10 border-b border-gray-200 bg-white flex items-center px-4">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{t('gantt.tasks')}</span>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-xs text-gray-400">{t('common.noData')}</div>
            ) : (
              rows.map(({ node, depth }) => {
                const hasChildren = (node.children || []).length > 0;
                const expanded = !collapsedIds.has(node.taskId);
                const hasBar = !!(node.startDate || node.dueDate || node.createdAt);
                return (
                  <div key={node.id} className="h-10 flex items-center px-3 border-b border-gray-100 hover:bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0 w-full" style={{ paddingLeft: `${depth * 18}px` }}>
                      <button
                        type="button"
                        onClick={() => hasChildren && toggleCollapse(node.taskId)}
                        className={cn(
                          'w-4 h-4 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0',
                          !hasChildren && 'invisible',
                          expanded && 'rotate-90'
                        )}
                      >
                        ▶
                      </button>
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_COLOR[node.status] || STATUS_COLOR.backlog)} />
                      <Link to={`/tasks/${node.taskId}`} className={cn('text-xs truncate min-w-0 hover:text-indigo-600', hasBar ? 'text-gray-700' : 'text-gray-400')}>
                        {node.title}
                      </Link>
                      <span className="text-[10px] text-gray-300 font-mono flex-shrink-0">{node.taskId}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto relative">
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>
            <div className="h-10 border-b border-gray-200 bg-white sticky top-0 z-20" style={{ width: totalWidth }}>
              {ticks.map((tick, i) => (
                <div key={i} className="absolute top-0 h-full flex flex-col justify-center" style={{ left: tick.offset }}>
                  <span className="text-xs text-gray-400 px-1 whitespace-nowrap">{tick.label}</span>
                  <div className="absolute bottom-0 left-0 h-2 w-px bg-gray-200" />
                </div>
              ))}
              {todayOffset > 0 && todayOffset < totalWidth && (
                <div className="absolute top-0 h-full border-l-2 border-indigo-400/70 z-10" style={{ left: todayOffset }}>
                  <span className="absolute top-1 left-1 text-xs text-indigo-600 font-semibold whitespace-nowrap">{t('gantt.today')}</span>
                </div>
              )}
              {milestones.map((milestone: any) => {
                if (!milestone.targetDate) return null;
                const offset = diffDays(startDate, new Date(milestone.targetDate)) * DAY_W;
                if (offset < 0 || offset > totalWidth) return null;
                return (
                  <div key={milestone.id} className="absolute top-0 h-full z-10" style={{ left: offset }} title={milestone.name}>
                    <div className="absolute top-1 -translate-x-1.5 w-3 h-3 bg-amber-500 rotate-45 rounded-sm" />
                  </div>
                );
              })}
            </div>

            <div style={{ width: totalWidth }}>
              {rows.map(({ node }) => {
                const { left, width } = calcBar(node);
                return (
                  <div key={node.id} className="h-10 relative border-b border-gray-100">
                    {ticks.map((tick, i) => (
                      <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: tick.offset }} />
                    ))}
                    {todayOffset > 0 && <div className="absolute top-0 bottom-0 w-px bg-indigo-400/40 z-10" style={{ left: todayOffset }} />}
                    {milestones.map((milestone: any) => {
                      if (!milestone.targetDate) return null;
                      const offset = diffDays(startDate, new Date(milestone.targetDate)) * DAY_W;
                      return <div key={milestone.id} className="absolute top-0 bottom-0 w-px bg-amber-500/20" style={{ left: offset }} />;
                    })}
                    {(node.startDate || node.dueDate || node.createdAt) && (
                      <Link
                        to={`/tasks/${node.taskId}`}
                        className={cn(
                          'absolute top-2 h-6 rounded flex items-center px-2 text-xs font-medium text-white/90 hover:brightness-110 transition-all truncate z-20',
                          STATUS_COLOR[node.status] || STATUS_COLOR.backlog
                        )}
                        style={{ left, width: Math.min(width, totalWidth - left) }}
                        title={`${node.taskId} — ${node.title} (${node.progress}%)`}
                      >
                        <span className="truncate">{node.title}</span>
                        {node.progress > 0 && <span className="ml-1 flex-shrink-0 text-white/60">{node.progress}%</span>}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
