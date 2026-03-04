import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { cn, formatDate, getDaysUntil } from '@/lib/utils';
import { useActiveProject } from '@/lib/useActiveProject';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Link } from 'react-router-dom';

const STATUS_CONFIG: Record<string, { label: string; dot: string; accent: string }> = {
  backlog: { label: '未排期', dot: 'bg-slate-400', accent: '#94a3b8' },
  planned: { label: '未开始', dot: 'bg-blue-400', accent: '#3b82f6' },
  active:  { label: '进行中', dot: 'bg-indigo-500', accent: '#6366f1' },
  review:  { label: '验收中', dot: 'bg-amber-500', accent: '#d97706' },
  done:    { label: '已完成', dot: 'bg-emerald-500', accent: '#10b981' },
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

  const today = new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
            {currentMember?.name || currentUser} 的工作台
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">我的任务</p>
          <p className="text-3xl font-bold mt-1.5 text-gray-900">{total}</p>
          <p className="text-xs text-gray-400 mt-1">{done} 已完成</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">进行中</p>
          <p className="text-3xl font-bold mt-1.5 text-indigo-600">{myOverview?.active ?? activeTasks.length}</p>
          <p className="text-xs text-gray-400 mt-1">需要推进</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">待验收</p>
          <p className="text-3xl font-bold mt-1.5 text-amber-600">{myOverview?.review ?? reviewTasks.length}</p>
          <p className="text-xs text-gray-400 mt-1">等待确认</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">完成率</p>
          <p className="text-3xl font-bold mt-1.5 text-emerald-600">{completionRate}%</p>
          <p className="text-xs text-gray-400 mt-1">{done}/{total}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* 近期活跃任务 */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">近期任务</h2>
            <Link to="/my/tasks/list" className="text-xs text-indigo-500 hover:text-indigo-700">查看全部 →</Link>
          </div>
          {recentTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-300">
              <div className="text-2xl mb-1">📋</div>
              <p className="text-xs">暂无进行中的任务</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentTasks.map((t: any) => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.backlog;
                const days = getDaysUntil(t.dueDate);
                const isOverdue = days !== null && days < 0;
                return (
                  <Link key={t.id} to={`/tasks/${t.taskId}`}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', sc.dot)} />
                    <span className="flex-1 text-sm text-gray-700 group-hover:text-indigo-700 truncate">{t.title}</span>
                    <span className={cn('text-[10px] flex-shrink-0', sc.accent === '#d97706' ? 'text-amber-500' : 'text-gray-400')}>
                      {sc.label}
                    </span>
                    {t.dueDate && (
                      <span className={cn('text-[10px] flex-shrink-0',
                        isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                        {isOverdue ? `逾期${Math.abs(days!)}天` : formatDate(t.dueDate)}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{t.taskId}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 右侧：逾期预警 + 快捷入口 */}
        <div className="space-y-5">
          {/* 逾期预警 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">逾期预警</h2>
            {overdueTasks.length === 0 ? (
              <div className="text-center py-4 text-gray-300">
                <div className="text-lg mb-1">✅</div>
                <p className="text-xs">无逾期任务</p>
              </div>
            ) : (
              <div className="space-y-2">
                {overdueTasks.slice(0, 4).map((t: any) => {
                  const days = getDaysUntil(t.dueDate);
                  return (
                    <Link key={t.id} to={`/tasks/${t.taskId}`}
                      className="block px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <p className="text-xs text-gray-700 truncate">{t.title}</p>
                      <p className="text-[10px] text-red-500 font-medium">逾期 {Math.abs(days!)} 天</p>
                    </Link>
                  );
                })}
                {overdueTasks.length > 4 && (
                  <p className="text-[10px] text-gray-400 px-2">还有 {overdueTasks.length - 4} 项...</p>
                )}
              </div>
            )}
          </div>

          {/* 快捷入口 */}
          <div className="grid grid-cols-2 gap-2">
            <QuickLink to="/my/tasks/list" label="需求列表" desc="平铺浏览" icon="📋" />
            <QuickLink to="/my/tasks/tree" label="需求树" desc="层级结构" icon="🌳" />
            <QuickLink to="/my/tasks/mindmap" label="需求脑图" desc="全局视野" icon="🧠" />
            <QuickLink to="/my/gantt" label="我的甘特" desc="时间线" icon="📅" />
          </div>
        </div>
      </div>
    </div>
  );
}
