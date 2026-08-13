import { useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

type Props = {
  task: any;
  members: any[];
  canEdit: boolean;
  onUpdate: () => void;
};

type Feedback = { type: 'success' | 'error'; message: string } | null;

function lines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value ?? '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
}

function actionTone(action: string): string {
  if (action === 'resolve_blocker' || action === 'wait_dependencies') return 'border-red-200 bg-red-50/70 text-red-700';
  if (action === 'decompose') return 'border-violet-200 bg-violet-50/70 text-violet-700';
  if (action === 'complete') return 'border-emerald-200 bg-emerald-50/70 text-emerald-700';
  if (action === 'test') return 'border-amber-200 bg-amber-50/70 text-amber-700';
  return 'border-indigo-200 bg-indigo-50/70 text-indigo-700';
}

export default function AgentWorkflowPanel({ task, members, canEdit, onUpdate }: Props) {
  const defaultActor = task.claim?.agent || task.assignee || task.owner || 'local';
  const [actor, setActor] = useState(defaultActor);
  const [criteria, setCriteria] = useState(lines(task.acceptanceCriteria).join('\n'));
  const [splitText, setSplitText] = useState('');
  const [testStatus, setTestStatus] = useState<'passed' | 'failed'>('passed');
  const [testCommand, setTestCommand] = useState('');
  const [testSummary, setTestSummary] = useState('');
  const [testEvidence, setTestEvidence] = useState('');
  const [completionSummary, setCompletionSummary] = useState('');
  const [completionEvidence, setCompletionEvidence] = useState('');
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    setActor(task.claim?.agent || task.assignee || task.owner || 'local');
    setCriteria(lines(task.acceptanceCriteria).join('\n'));
  }, [task.taskId, task.updatedAt]);

  const checks = Array.isArray(task.completionChecks) ? task.completionChecks : [];
  const nextAction = task.nextAction ?? { action: 'view', label: '查看任务', reason: '读取任务上下文' };
  const tests = Array.isArray(task.testResults) ? task.testResults : [];
  const memberIdentifiers = useMemo(
    () => [...new Set(members.map(member => String(member.identifier ?? '')).filter(Boolean))],
    [members],
  );

  async function perform(label: string, action: () => Promise<unknown>, success: string) {
    setPending(label);
    setFeedback(null);
    try {
      await action();
      setFeedback({ type: 'success', message: success });
      onUpdate();
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || '操作失败' });
    } finally {
      setPending('');
    }
  }

  function parsedSplitItems() {
    return lines(splitText).map(line => {
      const test = /^\[(test|测试)\]\s*/i.test(line);
      const review = /^\[(review|评审)\]\s*/i.test(line);
      const title = line.replace(/^\[(test|测试|review|评审|task|任务)\]\s*/i, '').trim();
      return {
        title,
        type: test ? 'test' : (review ? 'review' : 'task'),
        labels: test ? ['test'] : (review ? ['review'] : []),
        acceptanceCriteria: test ? ['执行测试并记录命令、结果与证据'] : [],
        requiresTests: !test,
      };
    }).filter(item => item.title);
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">Agent 工作流</h3>
          <p className="text-[11px] text-gray-400 mt-1">拆分 → 领取 → 执行 → 测试 → 验收</p>
        </div>
        <span className={cn('text-[10px] px-2 py-1 rounded-full border font-medium', task.claimActive
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-gray-50 text-gray-600')}>
          {task.claimActive ? `${task.claim.agent} 已领取` : '未领取'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        <div className={cn('rounded-lg border px-3 py-2.5', actionTone(nextAction.action))}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">下一步：{nextAction.label}</span>
            <span className="text-[10px] font-mono uppercase opacity-60">{nextAction.action}</span>
          </div>
          <p className="text-xs mt-1 opacity-80">{nextAction.reason}</p>
        </div>

        {feedback && (
          <div className={cn('rounded-lg px-3 py-2 text-xs border', feedback.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700')}>
            {feedback.message}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[11px] font-medium text-gray-600">执行 Agent</label>
          <div className="flex gap-2">
            <input
              value={actor}
              onChange={event => setActor(event.target.value)}
              list="clawpm-agent-identifiers"
              disabled={!canEdit || task.status === 'done'}
              className="min-w-0 flex-1 border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-100 disabled:text-gray-600"
              placeholder="Agent identifier"
            />
            <datalist id="clawpm-agent-identifiers">
              {memberIdentifiers.map(identifier => <option key={identifier} value={identifier} />)}
            </datalist>
            {!task.claimActive && task.status !== 'done' ? (
              <button
                disabled={!canEdit || !actor.trim() || Boolean(pending) || nextAction.action !== 'claim'}
                title={nextAction.action !== 'claim' ? `请先完成：${nextAction.label}` : undefined}
                onClick={() => perform('claim', () => api.claimTask(task.taskId, actor.trim(), 120), '任务已领取，租约为 120 分钟。')}
                className="px-3 py-2 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-100 whitespace-nowrap"
              >{pending === 'claim' ? '领取中...' : '领取'}</button>
            ) : task.status !== 'done' ? (
              <button
                disabled={!canEdit || Boolean(pending)}
                onClick={() => perform('release', () => api.releaseTask(task.taskId, actor.trim()), '任务已释放。')}
                className="px-3 py-2 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-500 disabled:opacity-100 whitespace-nowrap"
              >{pending === 'release' ? '释放中...' : '释放'}</button>
            ) : null}
          </div>
          {task.claimActive && <p className="text-[10px] text-gray-500">租约到期：{new Date(task.claim.leaseUntil).toLocaleString('zh-CN')}</p>}
        </div>

        {task.blocker && canEdit && task.status !== 'done' && (
          <button
            disabled={Boolean(pending)}
            onClick={() => perform('unblock', () => api.resolveBlocker(task.taskId, '阻塞已处理', actor), '阻塞已解除。')}
            className="w-full px-3 py-2 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
          >{pending === 'unblock' ? '处理中...' : '解除当前阻塞'}</button>
        )}

        <details className="group border-t border-gray-200 pt-3" open={nextAction.action === 'define_acceptance'}>
          <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-700">
            <span>验收标准</span><span className="text-gray-500 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="mt-3 space-y-2">
            <textarea
              value={criteria}
              onChange={event => setCriteria(event.target.value)}
              disabled={!canEdit || task.status === 'done'}
              rows={4}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-100 disabled:text-gray-600"
              placeholder="每行一条可验证的验收标准"
            />
            <button
              disabled={!canEdit || !criteria.trim() || Boolean(pending) || task.status === 'done'}
              onClick={() => perform('criteria', () => api.updateTask(task.taskId, { acceptanceCriteria: lines(criteria), actor }), '验收标准已保存。')}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 text-white hover:bg-gray-900 disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-100"
            >{pending === 'criteria' ? '保存中...' : '保存验收标准'}</button>
          </div>
        </details>

        <details className="group border-t border-gray-200 pt-3" open={nextAction.action === 'decompose'}>
          <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-700">
            <span>拆分子任务</span><span className="text-gray-500 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="mt-3 space-y-2">
            <textarea
              value={splitText}
              onChange={event => setSplitText(event.target.value)}
              disabled={!canEdit || task.status === 'done'}
              rows={5}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-gray-100 disabled:text-gray-600"
              placeholder={'每行创建一个子任务\n实现核心逻辑\n[test] 执行回归测试'}
            />
            <p className="text-[10px] leading-4 text-gray-500">先拆“阶段/问题”，再继续拆到可独立实现并验证的叶子。使用 `[test]` 前缀创建测试任务，使用 `[review]` 创建评审任务。</p>
            <button
              disabled={!canEdit || parsedSplitItems().length === 0 || Boolean(pending) || task.status === 'done'}
              onClick={() => perform('split', async () => {
                await api.splitTask(task.taskId, parsedSplitItems(), actor);
                setSplitText('');
              }, `已创建 ${parsedSplitItems().length} 个子任务。`)}
              className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-100"
            >{pending === 'split' ? '拆分中...' : `创建 ${parsedSplitItems().length || ''} 个子任务`}</button>
          </div>
        </details>

        <details className="group border-t border-gray-200 pt-3" open={nextAction.action === 'test'}>
          <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-700">
            <span>测试任务与证据</span><span className="text-gray-500 group-open:rotate-90 transition-transform">›</span>
          </summary>
          <div className="mt-3 space-y-2">
            {tests.slice().reverse().map((result: any) => (
              <div key={result.id} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className={result.status === 'passed' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                    {result.status === 'passed' ? '✓ 通过' : '✕ 失败'} · {result.summary}
                  </span>
                  <span className="text-gray-500">{result.actor}</span>
                </div>
                {result.command && <code className="block mt-1 text-[10px] text-gray-600 break-all">{result.command}</code>}
              </div>
            ))}
            <div className="grid grid-cols-[110px_1fr] gap-2">
              <select value={testStatus} onChange={event => setTestStatus(event.target.value as 'passed' | 'failed')}
                disabled={!canEdit || task.status === 'done'} className="border border-gray-200 rounded-lg bg-white px-2 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600">
                <option value="passed">测试通过</option>
                <option value="failed">测试失败</option>
              </select>
              <input value={testCommand} onChange={event => setTestCommand(event.target.value)} disabled={!canEdit || task.status === 'done'}
                className="border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:bg-gray-100 disabled:text-gray-600" placeholder="测试命令，如 pnpm test" />
            </div>
            <input value={testSummary} onChange={event => setTestSummary(event.target.value)} disabled={!canEdit || task.status === 'done'}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:bg-gray-100 disabled:text-gray-600" placeholder="测试摘要" />
            <textarea value={testEvidence} onChange={event => setTestEvidence(event.target.value)} disabled={!canEdit || task.status === 'done'} rows={2}
              className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:bg-gray-100 disabled:text-gray-600" placeholder="证据路径或日志摘要，每行一条" />
            <button
              disabled={!canEdit || (!testCommand.trim() && !testEvidence.trim()) || Boolean(pending) || task.status === 'done'}
              onClick={() => perform('test', async () => {
                await api.recordTaskTest(task.taskId, { status: testStatus, command: testCommand, summary: testSummary, evidence: lines(testEvidence), actor });
                setTestCommand(''); setTestSummary(''); setTestEvidence('');
              }, testStatus === 'passed' ? '测试通过记录已写入。' : '测试失败，任务已回到执行状态并记录阻塞。')}
              className={cn('px-3 py-1.5 text-xs rounded-lg text-white disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-100', testStatus === 'passed'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-red-600 hover:bg-red-700')}
            >{pending === 'test' ? '记录中...' : '记录测试结果'}</button>
          </div>
        </details>

        <div className="border-t border-gray-200 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {checks.map((check: any) => (
              <div key={check.id} title={check.detail} className={cn('rounded-lg border px-2.5 py-2 text-[11px]', check.passed
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-gray-200 bg-gray-50 text-gray-600')}>
                <span className="mr-1">{check.passed ? '✓' : '○'}</span>{check.label}
              </div>
            ))}
          </div>

          {task.status === 'done' ? (
            <button
              disabled={!canEdit || Boolean(pending)}
              onClick={() => perform('reopen', () => api.reopenTask(task.taskId, '发现回归或新增工作', actor), '任务已重新打开。')}
              className="w-full px-3 py-2 text-xs rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
            >{pending === 'reopen' ? '处理中...' : '重新打开任务'}</button>
          ) : (
            <div className="space-y-2">
              <input value={completionSummary} onChange={event => setCompletionSummary(event.target.value)} disabled={!canEdit}
                className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:bg-gray-100 disabled:text-gray-600" placeholder="完成摘要" />
              <textarea value={completionEvidence} onChange={event => setCompletionEvidence(event.target.value)} disabled={!canEdit} rows={2}
                className="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none disabled:bg-gray-100 disabled:text-gray-600" placeholder="交付证据，每行一条：提交、代码路径、测试命令或安装包" />
              <button
                disabled={!canEdit || !task.claimActive || !completionEvidence.trim() || Boolean(pending)}
                onClick={() => perform('complete', () => api.completeTask(task.taskId, {
                  summary: completionSummary, evidence: lines(completionEvidence), actor,
                }), '任务已通过 Gate 并完成。')}
                className="w-full px-3 py-2 text-xs rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:opacity-100"
              >{pending === 'complete' ? '验收中...' : '通过 Gate 并完成'}</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
