import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useI18n, getDateLocale } from '@/lib/i18n';

const STATUS_COLOR: Record<string, string> = {
  backlog: 'bg-slate-300', planned: 'bg-blue-400', active: 'bg-indigo-500',
  review: 'bg-amber-500', done: 'bg-emerald-500',
};
const STATUS_LABEL_KEY: Record<string, string> = {
  backlog: 'status.backlog', planned: 'status.planned', active: 'status.active', review: 'status.review', done: 'status.done',
};

function parseDate(s?: string) { return s ? new Date(s.slice(0, 10)) : null; }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export default function MyGantt() {
  const { t, locale } = useI18n();
  const dateLocale = getDateLocale(locale);
  function fmtDate(d: Date) { return d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }); }

  const activeProject = useActiveProject();
  const currentUser = useCurrentUser();

  const { data, isLoading } = useQuery({
    queryKey: ['my-gantt', activeProject, currentUser],
    queryFn: () => api.getGanttData({ owner: currentUser! }),
    enabled: !!currentUser,
  });

  const [groupBy, setGroupBy] = useState<'domain' | 'status'>('domain');
  const [grain, setGrain] = useState<'day' | 'week'>('week');

  const tasks: any[] = useMemo(() => data?.tasks || [], [data]);
  const milestones: any[] = useMemo(() => data?.milestones || [], [data]);

  const { startDate, endDate, totalDays } = useMemo(() => {
    const today = new Date();
    const dates: Date[] = [today];
    for (const t of tasks) {
      if (t.startDate) dates.push(new Date(t.startDate));
      if (t.dueDate) dates.push(new Date(t.dueDate));
    }
    for (const m of milestones) {
      if (m.targetDate) dates.push(new Date(m.targetDate));
    }
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() + 14);
    return { startDate: start, endDate: end, totalDays: diffDays(start, end) };
  }, [tasks, milestones]);

  const DAY_W = grain === 'day' ? 28 : 8;

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const tk of tasks) {
      const key = groupBy === 'domain' ? (tk.domain?.name || t('gantt.ungrouped')) : (t(STATUS_LABEL_KEY[tk.status]) || tk.status);
      if (!map[key]) map[key] = [];
      map[key].push(tk);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks, groupBy]);

  const ticks = useMemo(() => {
    const result: { date: Date; label: string; offset: number }[] = [];
    const step = grain === 'day' ? 1 : 7;
    for (let i = 0; i <= totalDays; i += step) {
      const d = addDays(startDate, i);
      result.push({ date: d, label: fmtDate(d), offset: i * DAY_W });
    }
    return result;
  }, [startDate, totalDays, grain, DAY_W]);

  const today = new Date();
  const todayOffset = diffDays(startDate, today) * DAY_W;

  function calcBar(t: any) {
    const s = parseDate(t.startDate) || parseDate(t.createdAt) || today;
    const e = parseDate(t.dueDate) || addDays(s, 7);
    const left = Math.max(0, diffDays(startDate, s)) * DAY_W;
    const width = Math.max(DAY_W, diffDays(s, e) * DAY_W);
    return { left, width };
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="text-5xl opacity-30">👤</div>
          <p className="text-gray-500">{t('myDashboard.selectIdentityFirst')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center h-64 text-slate-500">{t('common.loading')}</div>;

  const totalWidth = totalDays * DAY_W;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900 mr-4">{t('myGantt.title')}</h1>
          <span className="text-gray-400 text-sm">{t('gantt.groupBy')}:</span>
          {(['domain', 'status'] as const).map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={cn('px-3 py-1.5 rounded-lg text-sm transition-colors',
                groupBy === g ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-100')}>
              {g === 'domain' ? t('gantt.groupByDomain') : t('myGantt.status')}
            </button>
          ))}
          <span className="text-gray-300 mx-2">|</span>
          <span className="text-gray-400 text-sm">{t('gantt.grain')}:</span>
          {(['day', 'week'] as const).map(g => (
            <button key={g} onClick={() => setGrain(g)}
              className={cn('px-3 py-1.5 rounded-lg text-sm transition-colors',
                grain === g ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-100')}>
              {g === 'day' ? t('gantt.byDay') : t('gantt.byWeek')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{t('iterations.taskCount', { count: tasks.length })}</span>
          <div className="flex items-center gap-2 ml-2">
            {Object.entries(STATUS_LABEL_KEY).map(([s, lk]) => (
              <span key={s} className="flex items-center gap-1 text-xs text-gray-500">
                <span className={cn('w-3 h-3 rounded-sm inline-block', STATUS_COLOR[s])} />{t(lk)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
          <div className="h-10 border-b border-gray-200 bg-white flex items-center px-4">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{t('gantt.tasks')}</span>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {groups.map(([groupName, groupTasks]) => (
              <div key={groupName}>
                <div className="h-8 bg-gray-50 flex items-center px-4 sticky top-0 z-10 border-b border-gray-200">
                  <span className="text-xs text-gray-600 font-semibold truncate">{groupName}</span>
                  <span className="ml-auto text-xs text-gray-400">{groupTasks.length}</span>
                </div>
                {groupTasks.map(t => (
                  <div key={t.id} className="h-9 flex items-center px-4 border-b border-gray-100 hover:bg-gray-50">
                    <Link to={`/tasks/${t.taskId}`} className="text-xs text-gray-700 hover:text-indigo-600 truncate">
                      {t.title}
                    </Link>
                  </div>
                ))}
              </div>
            ))}
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
            </div>

            <div style={{ width: totalWidth }}>
              {groups.map(([groupName, groupTasks]) => (
                <div key={groupName}>
                  <div className="h-8 bg-gray-50/50 relative border-b border-gray-100">
                    {todayOffset > 0 && <div className="absolute top-0 bottom-0 w-px bg-indigo-400/40 z-10" style={{ left: todayOffset }} />}
                  </div>
                  {groupTasks.map(t => {
                    const { left, width } = calcBar(t);
                    return (
                      <div key={t.id} className="h-9 relative border-b border-gray-100">
                        {ticks.map((tick, i) => (
                          <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: tick.offset }} />
                        ))}
                        {todayOffset > 0 && <div className="absolute top-0 bottom-0 w-px bg-indigo-400/40 z-10" style={{ left: todayOffset }} />}
                        <Link to={`/tasks/${t.taskId}`}
                          className={cn('absolute top-1.5 h-6 rounded flex items-center px-2 text-xs font-medium text-white/90 hover:brightness-110 transition-all truncate z-20',
                            STATUS_COLOR[t.status] || STATUS_COLOR.backlog)}
                          style={{ left, width: Math.min(width, totalWidth - left) }}
                          title={`${t.taskId} — ${t.title} (${t.progress}%)`}>
                          <span className="truncate">{t.title}</span>
                          {t.progress > 0 && <span className="ml-1 flex-shrink-0 text-white/60">{t.progress}%</span>}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
