import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { cn } from '@/lib/utils';
import CreateTaskModal from '@/components/CreateTaskModal';

const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'decompose', label: '待拆解' },
  { id: 'claim', label: '待领取' },
  { id: 'resolve_blocker', label: '阻塞' },
  { id: 'progress', label: '执行中' },
  { id: 'test', label: '待测试' },
  { id: 'complete', label: '待验收' },
] as const;

const ACTION_STYLE: Record<string, string> = {
  decompose: 'bg-violet-50 text-violet-700 border-violet-100',
  claim: 'bg-blue-50 text-blue-700 border-blue-100',
  define_acceptance: 'bg-violet-50 text-violet-700 border-violet-100',
  wait_dependencies: 'bg-slate-100 text-slate-600 border-slate-200',
  resolve_blocker: 'bg-red-50 text-red-700 border-red-100',
  advance_children: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  progress: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  test: 'bg-amber-50 text-amber-700 border-amber-100',
  complete: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  reopen: 'bg-orange-50 text-orange-700 border-orange-100',
};

function lines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value ?? '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

export default function Workflow() {
  const project = useActiveProject();
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workflow-overview', project],
    queryFn: api.getWorkflowOverview,
  });
  const tasks: any[] = data?.tasks ?? [];
  const visible = useMemo(() => tasks.filter(task => {
    if (filter === 'all') return true;
    return task.nextAction?.action === filter;
  }), [tasks, filter]);

  const stats = [
    { label: '待拆解', value: data?.counts?.decompose ?? 0, color: 'text-violet-600' },
    { label: '待领取', value: data?.counts?.claim ?? 0, color: 'text-blue-600' },
    { label: '执行中', value: data?.counts?.progress ?? 0, color: 'text-indigo-600' },
    { label: '阻塞', value: data?.counts?.resolve_blocker ?? 0, color: 'text-red-600' },
    { label: '待测试', value: data?.counts?.test ?? 0, color: 'text-amber-600' },
    { label: '待验收', value: data?.counts?.complete ?? 0, color: 'text-emerald-600' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50/70">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Agent 工作流</h1>
            <p className="text-sm text-slate-500 mt-1">让人类与 Agent 按同一套拆分、领取、执行、测试和验收协议推进 `.clawpm`。</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/skill-injection"
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600 hover:border-indigo-200 hover:text-indigo-600">
              安装到 Agent
            </Link>
            <button onClick={() => setShowCreate(true)}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700">
              + 创建任务
            </button>
          </div>
        </header>

        <div className="grid grid-cols-6 gap-3">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-xs text-slate-400">{stat.label}</div>
              <div className={cn('text-2xl font-semibold mt-1 tabular-nums', stat.color)}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {FILTERS.map(item => (
                <button key={item.id} onClick={() => setFilter(item.id)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs transition-colors', filter === item.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100')}>
                  {item.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{visible.length} 个任务</span>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-slate-400">加载工作流...</div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-sm text-slate-500">当前筛选下没有任务</div>
              <p className="text-xs text-slate-400 mt-1">创建任务后，ClawPM 会计算每个任务的下一步动作。</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visible.map(task => (
                <Link key={task.taskId} to={`/tasks/${task.taskId}`}
                  className="grid grid-cols-[minmax(0,1fr)_150px_120px_110px] items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{task.taskId}</span>
                      <span className="text-sm font-medium text-slate-800 truncate group-hover:text-indigo-700">{task.title}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>{lines(task.acceptanceCriteria).length} 条验收标准</span>
                      <span>{task.testResults?.length ?? 0} 条测试记录</span>
                      {task.nextAction?.blockedBy?.length > 0 && <span>阻塞项 {task.nextAction.blockedBy.length}</span>}
                    </div>
                  </div>
                  <div>
                    <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-medium', ACTION_STYLE[task.nextAction?.action] || 'bg-slate-50 text-slate-600 border-slate-100')}>
                      {task.nextAction?.label || '查看'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 truncate" title={task.claim?.agent || task.assignee || ''}>
                    {task.claimActive ? `🤖 ${task.claim.agent}` : '— 未领取'}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, task.progress ?? 0)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums w-8 text-right">{task.progress ?? 0}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-700">
          Skill 会教项目 Agent 直接在 `.clawpm` 中完成同一套操作；桌面端负责展示、校验 Gate 和冲突状态，不需要 Server、端口或 token。
        </div>
      </div>

      {showCreate && <CreateTaskModal onClose={() => { setShowCreate(false); void refetch(); }} />}
    </div>
  );
}
