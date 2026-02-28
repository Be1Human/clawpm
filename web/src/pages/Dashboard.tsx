import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, getDaysUntil } from '@/lib/utils';
import { RadialBarChart, RadialBar, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color || 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function ProgressBar({ value, color = 'bg-brand-500' }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function RiskRow({ task, type }: { task: any; type: 'overdue' | 'blocked' | 'at-risk' }) {
  const colors = {
    overdue: 'text-red-400 bg-red-500/10',
    blocked: 'text-orange-400 bg-orange-500/10',
    'at-risk': 'text-yellow-400 bg-yellow-500/10',
  };
  const labels = { overdue: '已逾期', blocked: '已阻塞', 'at-risk': '风险' };

  return (
    <Link to={`/tasks/${task.taskId}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-colors group">
      <span className={`badge ${colors[type]}`}>{labels[type]}</span>
      <span className="flex-1 text-sm text-slate-300 group-hover:text-slate-100 truncate">{task.title}</span>
      <span className="text-xs text-slate-500 font-mono">{task.taskId}</span>
      {task.owner && <span className="text-xs text-slate-500">{task.owner}</span>}
    </Link>
  );
}

const DOMAIN_COLORS = ['#6366f1', '#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#f472b6'];

export default function Dashboard() {
  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: api.getOverview, refetchInterval: 30000 });
  const { data: risks } = useQuery({ queryKey: ['risks'], queryFn: api.getRisks, refetchInterval: 30000 });

  const pieData = risks?.byDomain?.map((d: any, i: number) => ({
    name: d.domain, value: d.total, color: DOMAIN_COLORS[i % DOMAIN_COLORS.length],
  })) || [];

  const allRisks = [
    ...(risks?.overdue || []).map((t: any) => ({ ...t, _type: 'overdue' })),
    ...(risks?.blocked || []).map((t: any) => ({ ...t, _type: 'blocked' })),
    ...(risks?.atRisk || []).map((t: any) => ({ ...t, _type: 'at-risk' })),
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">仪表盘</h1>
          <p className="text-sm text-slate-500 mt-0.5">项目整体状态概览</p>
        </div>
        <div className="text-xs text-slate-600">{new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总任务" value={overview?.total ?? '—'} sub={`${overview?.done ?? 0} 已完成`} />
        <StatCard label="进行中" value={overview?.active ?? '—'} color="text-blue-400" />
        <StatCard
          label="逾期"
          value={risks?.overdue?.length ?? '—'}
          color={risks?.overdue?.length > 0 ? 'text-red-400' : 'text-slate-100'}
        />
        <StatCard
          label="健康度"
          value={overview?.avgHealth != null ? `${overview.avgHealth}` : '—'}
          color={overview?.avgHealth >= 80 ? 'text-green-400' : overview?.avgHealth >= 60 ? 'text-yellow-400' : 'text-red-400'}
          sub="/ 100"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Domain Progress */}
        <div className="col-span-2 card p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">业务板块进度</h2>
          {risks?.byDomain?.length ? (
            <div className="space-y-4">
              {risks.byDomain.map((d: any, i: number) => (
                <div key={d.domain}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}
                      />
                      <span className="text-sm text-slate-300">{d.domain}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{d.done}/{d.total} 完成</span>
                      <span className="font-mono text-slate-400 w-8 text-right">{d.progress}%</span>
                    </div>
                  </div>
                  <ProgressBar
                    value={d.progress}
                    color={`bg-[${DOMAIN_COLORS[i % DOMAIN_COLORS.length]}]`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-600 text-sm">暂无数据</div>
          )}
        </div>

        {/* Pie Chart */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-2">任务分布</h2>
          {pieData.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {pieData.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-400">{d.name}</span>
                    </div>
                    <span className="text-slate-500">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-600 text-sm">暂无数据</div>
          )}
        </div>
      </div>

      {/* Overall Progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300">整体完成率</h2>
          <span className="text-2xl font-bold text-brand-400">{overview?.completionRate ?? 0}%</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700"
            style={{ width: `${overview?.completionRate ?? 0}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-2">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Risk Items */}
      {allRisks.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300">风险项</h2>
            <Link to="/tasks?status=blocked" className="text-xs text-brand-400 hover:text-brand-300">查看全部</Link>
          </div>
          <div className="space-y-0.5">
            {allRisks.slice(0, 5).map((t: any, i: number) => (
              <RiskRow key={i} task={t} type={t._type} />
            ))}
          </div>
        </div>
      )}

      {/* Owner Summary */}
      {overview?.byOwner && Object.keys(overview.byOwner).length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">人员负载</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(overview.byOwner).map(([owner, data]: [string, any]) => (
              <div key={owner} className="bg-slate-800/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-500/30 flex items-center justify-center text-xs text-brand-400 font-medium">
                      {owner[0]?.toUpperCase()}
                    </div>
                    <span className="text-sm text-slate-300">{owner}</span>
                  </div>
                  <span className="text-xs text-slate-500">{data.tasks} 任务</span>
                </div>
                <ProgressBar value={data.avgProgress} />
                <div className="text-xs text-slate-600 mt-1.5">平均进度 {data.avgProgress}%</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
