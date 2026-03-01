import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

// ── 常量 ────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  backlog:  'bg-slate-300',
  planned:  'bg-blue-400',
  active:   'bg-indigo-500',
  review:   'bg-amber-500',
  done:     'bg-emerald-500',
};

const STATUS_LABEL: Record<string, string> = {
  backlog: '未排期', planned: '未开始', active: '进行中',
  review: '验收中', done: '已完成',
};

// ── 工具函数 ─────────────────────────────────────────────────────────
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

function fmtDate(d: Date) {
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// ── 主组件 ────────────────────────────────────────────────────────────
export default function GanttChart() {
  const { data, isLoading } = useQuery({
    queryKey: ['gantt'],
    queryFn: () => api.getGanttData(),
  });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: () => api.getMembers() });

  const [groupBy, setGroupBy] = useState<'domain' | 'owner'>('domain');
  const [grain, setGrain] = useState<'day' | 'week'>('week');
  const [filterOwner, setFilterOwner] = useState('');

  const tasks: any[] = useMemo(() => data?.tasks || [], [data]);
  const milestones: any[] = useMemo(() => data?.milestones || [], [data]);

  // 计算时间范围
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

  const DAY_W = grain === 'day' ? 28 : 8; // px per day

  // 过滤任务
  const filteredTasks = useMemo(() =>
    filterOwner ? tasks.filter(t => t.owner === filterOwner) : tasks,
    [tasks, filterOwner]
  );

  // 分组
  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of filteredTasks) {
      const key = groupBy === 'domain'
        ? (t.domain?.name || '未分组')
        : (t.owner || '未分配');
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTasks, groupBy]);

  // 生成时间轴刻度
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

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">加载中...</div>
  );

  const totalWidth = totalDays * DAY_W;

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-700 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">分组：</span>
          {(['domain', 'owner'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={cn('px-3 py-1.5 rounded-lg text-sm transition-colors',
                groupBy === g ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800')}
            >
              {g === 'domain' ? '板块' : '负责人'}
            </button>
          ))}
          <span className="text-slate-700 mx-2">|</span>
          <span className="text-slate-400 text-sm">粒度：</span>
          {(['day', 'week'] as const).map(g => (
            <button
              key={g}
              onClick={() => setGrain(g)}
              className={cn('px-3 py-1.5 rounded-lg text-sm transition-colors',
                grain === g ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800')}
            >
              {g === 'day' ? '按天' : '按周'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">负责人：</span>
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-2 py-1"
          >
            <option value="">全部</option>
            {members.map((m: any) => (
              <option key={m.identifier} value={m.identifier}>{m.name}</option>
            ))}
          </select>
          {/* 图例 */}
          <div className="flex items-center gap-2 ml-4">
            {Object.entries(STATUS_LABEL).map(([s, l]) => (
              <span key={s} className="flex items-center gap-1 text-xs text-slate-500">
                <span className={cn('w-3 h-3 rounded-sm inline-block', STATUS_COLOR[s])} />{l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 主体：左侧任务列表 + 右侧时间轴 */}
      <div className="flex flex-1 min-h-0">
        {/* 左列（固定宽度） */}
        <div className="w-64 flex-shrink-0 border-r border-slate-700 flex flex-col bg-white">
          <div className="h-10 border-b border-slate-700 bg-white flex items-center px-4">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">任务</span>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {groups.map(([groupName, groupTasks]) => (
              <div key={groupName}>
                <div className="h-8 bg-gray-50 flex items-center px-4 sticky top-0 z-10 border-b border-slate-700">
                  <span className="text-xs text-gray-600 font-semibold truncate">{groupName}</span>
                  <span className="ml-auto text-xs text-gray-400">{groupTasks.length}</span>
                </div>
                {groupTasks.map(t => (
                  <div key={t.id} className="h-9 flex items-center px-4 border-b border-slate-700/50 hover:bg-gray-50">
                    <Link to={`/tasks/${t.taskId}`} className="text-xs text-gray-700 hover:text-indigo-600 truncate">
                      {t.title}
                    </Link>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧时间轴（横向滚动） */}
        <div className="flex-1 overflow-auto relative">
          <div style={{ width: totalWidth, minWidth: '100%', position: 'relative' }}>
            {/* 时间轴头 */}
            <div className="h-10 border-b border-slate-700 bg-white sticky top-0 z-20" style={{ width: totalWidth }}>
              {ticks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex flex-col justify-center"
                  style={{ left: tick.offset }}
                >
                  <span className="text-xs text-gray-400 px-1 whitespace-nowrap">{tick.label}</span>
                  <div className="absolute bottom-0 left-0 h-2 w-px bg-gray-200" />
                </div>
              ))}
              {/* 今日线头部标签 */}
              {todayOffset > 0 && todayOffset < totalWidth && (
                <div
                  className="absolute top-0 h-full border-l-2 border-indigo-400/70 z-10"
                  style={{ left: todayOffset }}
                >
                  <span className="absolute top-1 left-1 text-xs text-indigo-600 font-semibold whitespace-nowrap">今天</span>
                </div>
              )}
              {/* 里程碑 */}
              {milestones.map((m: any) => {
                if (!m.targetDate) return null;
                const offset = diffDays(startDate, new Date(m.targetDate)) * DAY_W;
                if (offset < 0 || offset > totalWidth) return null;
                return (
                  <div
                    key={m.id}
                    className="absolute top-0 h-full z-10"
                    style={{ left: offset }}
                    title={m.name}
                  >
                    <div className="absolute top-1 -translate-x-1.5 w-3 h-3 bg-amber-500 rotate-45 rounded-sm" />
                  </div>
                );
              })}
            </div>

            {/* 任务行 */}
            <div style={{ width: totalWidth }}>
              {groups.map(([groupName, groupTasks]) => (
                <div key={groupName}>
                  <div className="h-8 bg-slate-800/20 relative border-b border-slate-800/50">
                  {/* 今日线 */}
                  {todayOffset > 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-indigo-400/40 z-10"
                      style={{ left: todayOffset }}
                    />
                  )}
                    {/* 里程碑线 */}
                    {milestones.map((m: any) => {
                      if (!m.targetDate) return null;
                      const offset = diffDays(startDate, new Date(m.targetDate)) * DAY_W;
                      return (
                        <div
                          key={m.id}
                          className="absolute top-0 bottom-0 w-px bg-amber-500/20 z-5"
                          style={{ left: offset }}
                        />
                      );
                    })}
                  </div>
                  {groupTasks.map(t => {
                    const { left, width } = calcBar(t);
                    return (
                      <div key={t.id} className="h-9 relative border-b border-slate-800/50">
                        {/* 背景格线 */}
                        {ticks.map((tick, i) => (
                          <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-100" style={{ left: tick.offset }} />
                        ))}
                  {/* 今日线 */}
                  {todayOffset > 0 && (
                    <div className="absolute top-0 bottom-0 w-px bg-indigo-400/40 z-10" style={{ left: todayOffset }} />
                  )}
                        {/* 里程碑线 */}
                        {milestones.map((m: any) => {
                          if (!m.targetDate) return null;
                          const offset = diffDays(startDate, new Date(m.targetDate)) * DAY_W;
                          return (
                            <div key={m.id} className="absolute top-0 bottom-0 w-px bg-amber-500/20" style={{ left: offset }} />
                          );
                        })}
                        {/* 任务条 */}
                        <Link
                          to={`/tasks/${t.taskId}`}
                          className={cn(
                            'absolute top-1.5 h-6 rounded flex items-center px-2 text-xs font-medium text-white/90 hover:brightness-110 transition-all truncate z-20',
                            STATUS_COLOR[t.status] || STATUS_COLOR.backlog
                          )}
                          style={{ left, width: Math.min(width, totalWidth - left) }}
                          title={`${t.taskId} — ${t.title} (${t.progress}%)`}
                        >
                          <span className="truncate">{t.title}</span>
                          {t.progress > 0 && (
                            <span className="ml-1 flex-shrink-0 text-white/60">{t.progress}%</span>
                          )}
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
