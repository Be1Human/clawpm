import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  // zoom: 1.0 = 默认，范围 [0.15, 6.0]
  const [zoom, setZoom] = useState(1);
  const ZOOM_MIN = 0.15;
  const ZOOM_MAX = 6;
  const ZOOM_STEP = 0.08;

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ganttWrapRef = useRef<HTMLDivElement>(null);

  const handleBodyScroll = useCallback(() => {
    if (headerRef.current && bodyRef.current) {
      headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    bodyEl.addEventListener('scroll', handleBodyScroll);
    return () => bodyEl.removeEventListener('scroll', handleBodyScroll);
  }, [handleBodyScroll]);

  // ── 滚轮/触控板缩放（Ctrl+wheel 或 pinch） ──
  useEffect(() => {
    const wrap = ganttWrapRef.current;
    const body = bodyRef.current;
    if (!wrap || !body) return;

    const onWheel = (e: WheelEvent) => {
      // Ctrl+滚轮 或触控板 pinch（ctrlKey 为 true）
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      // 鼠标在 body 区域内的 X 偏移（相对于容器左边界 + 已滚动距离 = 在总宽度中的位置）
      const rect = body.getBoundingClientRect();
      const pointerX = e.clientX - rect.left + body.scrollLeft;

      setZoom(prev => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta));
        // 缩放后调整 scrollLeft，保持鼠标指向的时间位置不变
        const scale = next / prev;
        requestAnimationFrame(() => {
          if (body) {
            const newPointerX = pointerX * scale;
            body.scrollLeft = newPointerX - (e.clientX - rect.left);
            if (headerRef.current) {
              headerRef.current.scrollLeft = body.scrollLeft;
            }
          }
        });
        return next;
      });
    };

    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

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

  const BASE_DAY_W = grain === 'day' ? 36 : 16;
  const DAY_W = BASE_DAY_W * zoom;
  const totalWidth = Math.max(totalDays * DAY_W, 800);

  const ticks = useMemo(() => {
    const result: { label: string; offset: number; isMonth?: boolean }[] = [];
    if (grain === 'day') {
      // 根据缩放级别动态调整 step：缩得太小时跳过一些天
      const dayPx = DAY_W;
      const step = dayPx >= 28 ? 1 : dayPx >= 14 ? 2 : dayPx >= 8 ? 7 : 14;
      for (let i = 0; i <= totalDays; i += step) {
        const d = addDays(startDate, i);
        result.push({
          label: d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
          offset: i * DAY_W,
          isMonth: d.getDate() === 1 || (step > 1 && d.getDate() <= step),
        });
      }
    } else {
      // 根据缩放级别动态调整：缩得小时跳过一些周
      const weekPx = 7 * DAY_W;
      const weekStep = weekPx >= 60 ? 1 : weekPx >= 30 ? 2 : 4; // 每N周一个 tick
      for (let i = 0; i <= totalDays; i += 7 * weekStep) {
        const d = addDays(startDate, i);
        const prevD = i >= 7 * weekStep ? addDays(startDate, i - 7 * weekStep) : null;
        const isNewMonth = !prevD || prevD.getMonth() !== d.getMonth();
        result.push({
          label: isNewMonth
            ? d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
            : d.toLocaleDateString(dateLocale, { day: 'numeric' }),
          offset: i * DAY_W,
          isMonth: isNewMonth,
        });
      }
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
            <span className="mx-1 w-px h-5 bg-gray-200" />
            <button
              onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP * 3))}
              className="w-7 h-7 flex items-center justify-center rounded-md text-sm text-gray-500 hover:bg-gray-100 transition-colors"
              title={t('gantt.zoomOut') || 'Zoom out'}
            >
              −
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-2 h-7 rounded-md text-xs text-gray-500 hover:bg-gray-100 transition-colors font-mono tabular-nums min-w-[3.2rem] text-center"
              title={t('gantt.zoomReset') || 'Reset zoom'}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP * 3))}
              className="w-7 h-7 flex items-center justify-center rounded-md text-sm text-gray-500 hover:bg-gray-100 transition-colors"
              title={t('gantt.zoomIn') || 'Zoom in'}
            >
              +
            </button>
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

        <div className="flex-1 min-w-0 flex flex-col" ref={ganttWrapRef}>
          {/* ── 时间轴表头（固定在顶部，随横向滚动同步） ── */}
          <div
            className="h-10 border-b border-gray-200 bg-white flex-shrink-0 overflow-hidden relative"
            ref={headerRef}
          >
            <div className="relative" style={{ width: totalWidth, height: '100%' }}>
              {ticks.map((tick, i) => (
                <div key={i} className="absolute top-0 h-full flex flex-col justify-center" style={{ left: tick.offset }}>
                  <span className={cn(
                    'px-1 whitespace-nowrap',
                    tick.isMonth
                      ? 'text-xs font-semibold text-gray-600'
                      : 'text-[10px] text-gray-400'
                  )}>{tick.label}</span>
                  <div className={cn(
                    'absolute bottom-0 left-0 w-px',
                    tick.isMonth ? 'h-3 bg-gray-300' : 'h-2 bg-gray-200'
                  )} />
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
          </div>

          {/* ── 甘特图主体（可横向+纵向滚动） ── */}
          <div className="flex-1 overflow-auto" ref={bodyRef}>
            <div style={{ width: totalWidth, minWidth: '100%' }}>
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
