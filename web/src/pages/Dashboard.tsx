import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
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

function HealthRing({ value }: { value: number }) {
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
        <span className="text-[10px] text-gray-400">健康度</span>
      </div>
    </div>
  );
}

function RiskBadge({ type }: { type: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    overdue:  { bg: '#fef2f2', text: '#dc2626', label: '已逾期' },
    blocked:  { bg: '#fff7ed', text: '#c2410c', label: '已阻塞' },
    'at-risk': { bg: '#fefce8', text: '#a16207', label: '风险' },
  };
  const s = styles[type] || styles['at-risk'];
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

export default function Dashboard() {
  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: api.getOverview, refetchInterval: 30000 });
  const { data: risks } = useQuery({ queryKey: ['risks'], queryFn: api.getRisks, refetchInterval: 30000 });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: () => api.getMembers() });

  const pieData = (risks?.byDomain || []).map((d: any, i: number) => ({
    name: d.domain, value: d.total, color: DOMAIN_COLORS[i % DOMAIN_COLORS.length],
  }));

  const allRisks = [
    ...(risks?.overdue || []).map((t: any) => ({ ...t, _type: 'overdue' })),
    ...(risks?.blocked || []).map((t: any) => ({ ...t, _type: 'blocked' })),
    ...(risks?.atRisk || []).map((t: any) => ({ ...t, _type: 'at-risk' })),
  ].slice(0, 6);

  const today = new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const health = overview?.avgHealth ?? 0;
  const healthLabel = health >= 80 ? '健康' : health >= 60 ? '需关注' : '高风险';
  const healthLabelColor = health >= 80 ? 'text-emerald-600' : health >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="p-6 space-y-6 animate-fade-in max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">仪表盘</h1>
          <p className="text-sm text-gray-400 mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn('text-sm font-semibold px-3 py-1 rounded-full', healthLabelColor,
            health >= 80 ? 'bg-emerald-50' : health >= 60 ? 'bg-amber-50' : 'bg-red-50')}>
            项目状态：{healthLabel}
          </div>
        </div>
      </div>

      {/* Stats 4 列 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="总任务" value={overview?.total ?? '—'}
          sub={`${overview?.done ?? 0} 已完成 · ${overview?.active ?? 0} 进行中`}
          icon="📋"
        />
        <StatCard
          label="进行中" value={overview?.active ?? '—'}
          accent="#6366f1" sub="个任务正在执行" icon="⚡"
        />
        <StatCard
          label="逾期任务" value={risks?.overdue?.length ?? '—'}
          accent={risks?.overdue?.length > 0 ? '#dc2626' : '#1e293b'}
          sub={risks?.overdue?.length > 0 ? '需要立即关注' : '无逾期任务'} icon="⚠️"
        />
        <StatCard
          label="整体完成率" value={`${overview?.completionRate ?? 0}%`}
          accent="#10b981" sub={`${overview?.done ?? 0} / ${overview?.total ?? 0} 个任务`} icon="✅"
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* 业务板块进度 */}
        <div className="col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-5">业务板块进度</h2>
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
                      <span>{d.done}/{d.total} 完成</span>
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
                <p>暂无板块数据</p>
              </div>
            </div>
          )}
        </div>

        {/* 右侧：健康度 + 任务分布 */}
        <div className="space-y-5">
          {/* 健康度卡 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-center">
            <h2 className="text-sm font-semibold text-gray-800 mb-3">项目健康度</h2>
            <HealthRing value={health} />
            <p className={cn('text-xs font-semibold mt-3', healthLabelColor)}>{healthLabel}</p>
          </div>

          {/* 饼图 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800 mb-2">任务分布</h2>
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
              <div className="text-center py-4 text-gray-300 text-xs">暂无数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* 风险项 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-800">风险预警</h2>
            <Link to="/tasks" className="text-xs text-indigo-500 hover:text-indigo-700">查看全部 →</Link>
          </div>
          {allRisks.length === 0 ? (
            <div className="text-center py-6 text-gray-300">
              <div className="text-2xl mb-1">✅</div>
              <p className="text-xs">暂无风险项目</p>
            </div>
          ) : (
            <div className="space-y-1">
              {allRisks.map((t: any, i: number) => (
                <Link key={i} to={`/tasks/${t.taskId}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors group">
                  <RiskBadge type={t._type} />
                  <span className="flex-1 text-sm text-gray-700 group-hover:text-indigo-700 truncate">{t.title}</span>
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">{t.taskId}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 人员负载 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">人员负载</h2>
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
                        <span className="text-xs text-gray-400 shrink-0 ml-2">{data.tasks}个任务</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${data.avgProgress}%`, backgroundColor: member?.color || '#6366f1' }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">平均进度 {data.avgProgress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-300">
              <div className="text-2xl mb-1">👥</div>
              <p className="text-xs">暂无人员数据</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
