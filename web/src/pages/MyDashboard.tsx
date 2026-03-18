import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { cn, formatDate, getDaysUntil } from '@/lib/utils';
import { useActiveProject } from '@/lib/useActiveProject';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useI18n, getDateLocale } from '@/lib/i18n';
import { Link } from 'react-router-dom';

const STATUS_CONFIG: Record<string, { labelKey: string; dot: string; accent: string }> = {
  backlog: { labelKey: 'status.backlog', dot: 'bg-slate-400', accent: '#94a3b8' },
  planned: { labelKey: 'status.planned', dot: 'bg-blue-400', accent: '#3b82f6' },
  active:  { labelKey: 'status.active', dot: 'bg-indigo-500', accent: '#6366f1' },
  review:  { labelKey: 'status.review', dot: 'bg-amber-500', accent: '#d97706' },
  done:    { labelKey: 'status.done', dot: 'bg-emerald-500', accent: '#10b981' },
};

function QuickLink({ to, label, desc, icon }: { to: string; label: string; desc: string; icon: string }) {
  return (
    <Link to={to} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-indigo-200 transition-all group">
      <div className="text-2xl mb-2 opacity-60 group-hover:opacity-100 transition-opacity">{icon}</div>
      <p className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
    </Link>
  );
}

export default function MyDashboard() {
  const activeProject = useActiveProject();
  const currentUser = useCurrentUser();
  const { t, locale } = useI18n();

  const { data: myOverview } = useQuery({
    queryKey: ['my-overview', activeProject, currentUser],
    queryFn: api.getMyOverview,
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const { data: myTasks = [] } = useQuery({
    queryKey: ['my-tasks-flat', activeProject, currentUser],
    queryFn: () => api.getTasks({ owner: currentUser! }),
    enabled: !!currentUser,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', activeProject],
    queryFn: () => api.getMembers(),
  });

  const currentMember = currentUser
    ? (members as any[]).find((m: any) => m.identifier === currentUser)
    : null;

  const today = new Date().toLocaleDateString(getDateLocale(locale), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="text-5xl opacity-30">👤</div>
          <p className="text-gray-500">请先在左下角选择身份</p>
        </div>
      </div>
    );
  }

  const activeTasks = (myTasks as any[]).filter(t => t.status === 'active');
  const reviewTasks = (myTasks as any[]).filter(t => t.status === 'review');
  const overdueTasks = (myTasks as any[]).filter(t => {
    const days = getDaysUntil(t.dueDate);
    return days !== null && days < 0 && t.status !== 'done';
  });
  const recentTasks = (myTasks as any[])
    .filter(t => t.status !== 'done')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 8);

  const total = (myTasks as any[]).length;
  const done = (myTasks as any[]).filter(t => t.status === 'done').length;
  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        {currentMember?.color ? (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
            style={{ backgroundColor: currentMember.color }}
          >
            {(currentMember.name || currentUser)[0]?.toUpperCase()}
          </div>
        ) : (
          <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-lg font-bold text-white shrink-0">
            {currentUser[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t('myDashboard.workbench', { name: currentMember?.name || currentUser })}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('myDashboard.myTasks')}</p>
          <p className="text-3xl font-bold mt-1.5 text-gray-900">{total}</p>
          <p className="text-xs text-gray-400 mt-1">{t('myDashboard.doneCount', { count: done })}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('myDashboard.inProgress')}</p>
          <p className="text-3xl font-bold mt-1.5 text-indigo-600">{myOverview?.active ?? activeTasks.length}</p>
          <p className="text-xs text-gray-400 mt-1">{t('myDashboard.needsAction')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('myDashboard.pendingReview')}</p>
          <p className="text-3xl font-bold mt-1.5 text-amber-600">{myOverview?.review ?? reviewTasks.length}</p>
          <p className="text-xs text-gray-400 mt-1">{t('myDashboard.awaitingConfirmation')}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{t('myDashboard.completionRate')}</p>
          <p className="text-3xl font-bold mt-1.5 text-emerald-600">{completionRate}%</p>
          <p className="text-xs text-gray-400 mt-1">{done}/{total}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Recent tasks */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">{t('myDashboard.recentTasks')}</h2>
            <Link to="/my/tasks/list" className="text-xs text-indigo-500 hover:text-indigo-700">{t('common.viewAll')}</Link>
          </div>
          {recentTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-300">
              <div className="text-2xl mb-1">📋</div>
              <p className="text-xs">{t('myDashboard.noActiveTasks')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentTasks.map((task: any) => {
                const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.backlog;
                const days = getDaysUntil(task.dueDate);
                const isOverdue = days !== null && days < 0;
                return (
                  <Link key={task.id} to={`/tasks/${task.taskId}`}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', sc.dot)} />
                    <span className="flex-1 text-sm text-gray-700 group-hover:text-indigo-700 truncate">{task.title}</span>
                    <span className={cn('text-[10px] flex-shrink-0', sc.accent === '#d97706' ? 'text-amber-500' : 'text-gray-400')}>
                      {t(sc.labelKey)}
                    </span>
                    {task.dueDate && (
                      <span className={cn('text-[10px] flex-shrink-0',
                        isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                        {isOverdue ? t('myDashboard.overdueDays', { days: Math.abs(days!) }) : formatDate(task.dueDate)}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{task.taskId}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Overdue + Quick links */}
        <div className="space-y-5">
          {/* Overdue warning */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">{t('myDashboard.overdueWarning')}</h2>
            {overdueTasks.length === 0 ? (
              <div className="text-center py-4 text-gray-300">
                <div className="text-lg mb-1">✅</div>
                <p className="text-xs">{t('myDashboard.noOverdueTasks')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueTasks.slice(0, 4).map((task: any) => {
                  const days = getDaysUntil(task.dueDate);
                  return (
                    <Link key={task.id} to={`/tasks/${task.taskId}`}
                      className="block px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <p className="text-xs text-gray-700 truncate">{task.title}</p>
                      <p className="text-[10px] text-red-500 font-medium">{t('myDashboard.overdueDays', { days: Math.abs(days!) })}</p>
                    </Link>
                  );
                })}
                {overdueTasks.length > 4 && (
                  <p className="text-[10px] text-gray-400 px-2">{t('myDashboard.moreItems', { count: overdueTasks.length - 4 })}</p>
                )}
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 gap-2">
            <QuickLink to="/my/tasks/list" label={t('myDashboard.taskTreeLabel')} desc={t('myTasks.viewTitleTree')} icon="🌳" />
            <QuickLink to="/my/tasks/mindmap" label={t('nav.mindMap')} desc={t('myDashboard.globalView')} icon="🧠" />
            <QuickLink to="/my/gantt" label={t('nav.ganttChart')} desc={t('myDashboard.timeline')} icon="📅" />
          </div>
        </div>
      </div>
    </div>
  );
}
