import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import { useActiveProject } from '@/lib/useActiveProject';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useI18n, getDateLocale } from '@/lib/i18n';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';

const DOMAIN_COLORS = ['#6366f1', '#0ea5e9', '#a78bfa', '#10b981', '#f97316', '#ec4899'];

function StatCard({
  label, value, sub, accent, icon,
}: { label: string; value: number | string; sub?: string; accent?: string; icon?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold mt-1.5" style={{ color: accent || '#1e293b' }}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className="text-2xl opacity-60">{icon}</div>
        )}
      </div>
    </div>
  );
}

function HealthRing({ value, label }: { value: number; label: string }) {
  const color = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444';
  const r = 36;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg width="96" height="96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold" style={{ color }}>{value}</span>
        <span className="text-[10px] text-gray-400">{label}</span>
      </div>
    </div>
  );
}

function RiskBadge({ type, label }: { type: string; label: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    overdue:   { bg: '#fef2f2', text: '#dc2626' },
    blocked:   { bg: '#fff7ed', text: '#c2410c' },
    'at-risk': { bg: '#fefce8', text: '#a16207' },
  };
  const s = styles[type] || styles['at-risk'];
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const activeProject = useActiveProject();
  const currentUser = useCurrentUser();
  const { t, locale } = useI18n();
  const { data: overview } = useQuery({ queryKey: ['overview', activeProject], queryFn: api.getOverview, refetchInterval: 30000 });
  const { data: risks } = useQuery({ queryKey: ['risks', activeProject], queryFn: api.getRisks, refetchInterval: 30000 });
  const { data: members = [] } = useQuery({ queryKey: ['members', activeProject], queryFn: () => api.getMembers() });
  const { data: myOverview } = useQuery({
    queryKey: ['my-overview', activeProject, currentUser],
    queryFn: api.getMyOverview,
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const pieData = (risks?.byDomain || []).map((d: any, i: number) => ({
    name: d.domain, value: d.total, color: DOMAIN_COLORS[i % DOMAIN_COLORS.length],
  }));

  const allRisks = [
    ...(risks?.overdue || []).map((t: any) => ({ ...t, _type: 'overdue' })),
    ...(risks?.blocked || []).map((t: any) => ({ ...t, _type: 'blocked' })),
    ...(risks?.atRisk || []).map((t: any) => ({ ...t, _type: 'at-risk' })),
  ].slice(0, 6);

  const today = new Date().toLocaleDateString(getDateLocale(locale), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const health = overview?.avgHealth ?? 0;
  const healthLabel = health >= 80 ? t('dashboard.healthy') : health >= 60 ? t('dashboard.needsAttention') : t('dashboard.highRisk');
  const healthLabelColor = health >= 80 ? 'text-emerald-600' : health >= 60 ? 'text-amber-600' : 'text-red-600';

  const riskLabels: Record<string, string> = {
    overdue: t('risk.overdue'),
    blocked: t('risk.blocked'),
    'at-risk': t('risk.atRisk'),
  };

  const currentMember = currentUser
    ? (members as any[]).find((m: any) => m.identifier === currentUser)
    : null;

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('text-sm font-semibold px-3 py-1 rounded-full', healthLabelColor,
            health >= 80 ? 'bg-emerald-50' : health >= 60 ? 'bg-amber-50' : 'bg-red-50')}>
            {t('dashboard.projectStatus', { label: healthLabel })}
          </div>
        </div>
      </div>

      {/* 我的概览条带 — 仅在已设置身份时显示 */}
      {currentUser && myOverview && (
        <Link to="/my/tasks/tree" className="block group">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between transition-all hover:shadow-md hover:border-indigo-200">
            <div className="flex items-center gap-3">
              {currentMember?.color ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: currentMember.color }}
                >
                  {(currentMember.name || currentUser)[0]?.toUpperCase()}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-400 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {currentUser[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <span className="text-sm font-semibold text-indigo-700">{t('dashboard.myOverview')}</span>
                <span className="text-xs text-indigo-400 ml-2">{currentMember?.name || currentUser}</span>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-xs text-indigo-600 font-medium">{t('status.active')}</span>
                <span className="text-sm font-bold text-indigo-700">{myOverview.active ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-600 font-medium">{t('status.review')}</span>
                <span className="text-sm font-bold text-amber-700">{myOverview.review ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-red-600 font-medium">{t('risk.overdue')}</span>
                <span className="text-sm font-bold text-red-700">{myOverview.overdue ?? 0}</span>
              </div>
              <svg className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </Link>
      )}

      {/* Stats 4 列 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.totalTasks')} value={overview?.total ?? '—'}
          sub={t('dashboard.doneAndActive', { done: overview?.done ?? 0, active: overview?.active ?? 0 })}
          icon="📋"
        />
        <StatCard
          label={t('dashboard.inProgress')} value={overview?.active ?? '—'}
          accent="#6366f1" sub={t('dashboard.tasksExecuting')} icon="⚡"
        />
        <StatCard
          label={t('dashboard.overdueTasks')} value={risks?.overdue?.length ?? '—'}
          accent={risks?.overdue?.length > 0 ? '#dc2626' : '#1e293b'}
          sub={risks?.overdue?.length > 0 ? t('dashboard.needsImmediateAttention') : t('dashboard.noOverdueTasks')} icon="⚠️"
        />
        <StatCard
          label={t('dashboard.completionRate')} value={`${overview?.completionRate ?? 0}%`}
          accent="#10b981" sub={t('dashboard.tasksCount', { done: overview?.done ?? 0, total: overview?.total ?? 0 })} icon="✅"
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* 业务板块进度 */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-5">{t('dashboard.domainProgress')}</h2>
          {risks?.byDomain?.length ? (
            <div className="space-y-4">
              {(risks.byDomain as any[]).map((d: any, i: number) => (
                <div key={d.domain}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }} />
                      <span className="text-sm font-medium text-gray-700">{d.domain}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{d.done}/{d.total} {t('dashboard.completed')}</span>
                      <span className="font-semibold text-gray-600 w-8 text-right">{d.progress}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${d.progress}%`, backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-gray-300 text-sm">
              <div className="text-center">
                <div className="text-3xl mb-2">📊</div>
                <p>{t('dashboard.noDomainData')}</p>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：健康度 + 任务分布 */}
        <div className="space-y-5">
          {/* 健康度卡 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-center">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">{t('dashboard.projectHealth')}</h2>
            <HealthRing value={health} label={t('dashboard.healthScore')} />
            <p className={cn('text-xs font-semibold mt-3', healthLabelColor)}>{healthLabel}</p>
          </div>

          {/* 饼图 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">{t('dashboard.taskDistribution')}</h2>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={100}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={2}>
                      {pieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {pieData.slice(0, 4).map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-gray-500 truncate max-w-[80px]">{d.name}</span>
                      </div>
                      <span className="text-gray-400 font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-gray-300 text-xs">{t('common.noData')}</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* 风险项 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">{ t('dashboard.riskAlerts')}</h2>
            <Link to="/tasks" className="text-xs text-indigo-500 hover:text-indigo-700">{t('common.viewAll')}</Link>
          </div>
          {allRisks.length === 0 ? (
            <div className="text-center py-6 text-gray-300">
              <div className="text-2xl mb-1">✅</div>
              <p className="text-xs">{t('dashboard.noRisks')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {allRisks.map((t: any, i: number) => (
                <Link key={i} to={`/tasks/${t.taskId}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                  <RiskBadge type={t._type} label={riskLabels[t._type] || t._type} />
                  <span className="flex-1 text-sm text-gray-700 group-hover:text-indigo-700 truncate">{t.title}</span>
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">{t.taskId}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 人员负载 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">{t('dashboard.staffWorkload')}</h2>
          {overview?.byOwner && Object.keys(overview.byOwner).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(overview.byOwner as Record<string, any>).slice(0, 5).map(([owner, data]) => {
                const member = (members as any[]).find(m => m.identifier === owner);
                return (
                  <div key={owner} className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: member?.color || '#6366f1' }}
                    >
                      {(member?.name || owner)[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 truncate">{member?.name || owner}</span>
                        <span className="text-xs text-gray-400 shrink-0 ml-2">{t('dashboard.tasksCountShort', { count: data.tasks })}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${data.avgProgress}%`, backgroundColor: member?.color || '#6366f1' }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{t('dashboard.avgProgress', { pct: data.avgProgress })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-300">
              <div className="text-2xl mb-1">👥</div>
              <p className="text-xs">{t('dashboard.noStaffData')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
