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
  wait_dependencies: 'bg-gray-100 text-gray-700 border-gray-200',
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
    <div className="min-h-full overflow-y-auto bg-[#f4f5f7]">
      <div className="w-full space-y-5 px-5 py-5 lg:px-7 lg:py-6">
        <header className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Execution cockpit</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950">Agent 工作流</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">把待拆解、执行和验收的任务放在同一个清晰的队列里推进。</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/skill-injection"
              className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-indigo-300 hover:text-indigo-700">
              安装到 Agent
            </Link>
            <button onClick={() => setShowCreate(true)}
              className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700">
              + 创建任务
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
              <div className="text-xs font-medium text-gray-500">{stat.label}</div>
              <div className={cn('mt-1 text-2xl font-semibold tabular-nums', stat.color)}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map(item => (
                <button key={item.id} onClick={() => setFilter(item.id)}
                  className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', filter === item.id
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100')}>
                  {item.label}
                </button>
              ))}
            </div>
            <span className="text-xs font-medium text-gray-500">{visible.length} 个任务</span>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-gray-500">加载工作流...</div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-sm font-medium text-gray-700">当前筛选下没有任务</div>
              <p className="mt-1 text-xs text-gray-500">创建任务后，ClawPM 会计算每个任务的下一步动作。</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {visible.map(task => (
                <Link key={task.taskId} to={`/tasks/${task.taskId}`}
                  className="grid grid-cols-1 gap-3 px-4 py-4 transition-colors hover:bg-indigo-50/40 md:grid-cols-[minmax(280px,1fr)_max-content_140px_128px] md:items-center md:gap-5 group">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-gray-500">{task.taskId}</span>
                      <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-700">{task.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span>{lines(task.acceptanceCriteria).length} 条验收标准</span>
                      <span>{task.testResults?.length ?? 0} 条测试记录</span>
                      {task.nextAction?.blockedBy?.length > 0 && <span>阻塞项 {task.nextAction.blockedBy.length}</span>}
                    </div>
                  </div>
                  <div>
                    <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-medium', ACTION_STYLE[task.nextAction?.action] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                      {task.nextAction?.label || '查看'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 truncate" title={task.claim?.agent || task.assignee || ''}>
                    {task.claimActive ? `🤖 ${task.claim.agent}` : '— 未领取'}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, task.progress ?? 0)}%` }} />
                    </div>
                    <span className="w-8 text-right text-[11px] tabular-nums text-gray-500">{task.progress ?? 0}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-800">
          Skill 会教项目 Agent 直接在 `.clawpm` 中完成同一套操作；桌面端负责展示、校验 Gate 和冲突状态，不需要 Server、端口或 token。
        </div>
      </div>

      {showCreate && <CreateTaskModal onClose={() => { setShowCreate(false); void refetch(); }} />}
    </div>
  );
}
