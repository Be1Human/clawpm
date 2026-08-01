export type VaultRecord = Record<string, any>;

export type WorkflowCheck = {
  id: 'acceptance' | 'blocker' | 'dependencies' | 'children' | 'verification' | 'evidence';
  label: string;
  passed: boolean;
  detail: string;
};

export type NextTaskAction = {
  action: 'decompose' | 'claim' | 'define_acceptance' | 'wait_dependencies' | 'resolve_blocker' | 'advance_children' | 'progress' | 'test' | 'complete' | 'reopen' | 'view';
  label: string;
  reason: string;
  blockedBy: string[];
};

export function textLines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(line => line.trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export function taskActor(value: unknown, fallback = 'local'): string {
  const actor = String(value ?? '').trim();
  return actor || fallback;
}

export function isClaimActive(task: VaultRecord, now = Date.now()): boolean {
  if (!task.claim?.agent) return false;
  if (task.claim.active === false) return false;
  if (!task.claim.leaseUntil) return true;
  const leaseUntil = Date.parse(task.claim.leaseUntil);
  return Number.isNaN(leaseUntil) || leaseUntil > now;
}

export function verificationRequired(task: VaultRecord): boolean {
  if (typeof task.verification?.required === 'boolean') return task.verification.required;
  return !['epic', 'chore', 'spike'].includes(String(task.type ?? 'task'));
}

export function hasPassingVerification(task: VaultRecord, allTasks: VaultRecord[]): boolean {
  if ((task.testResults ?? []).some((result: VaultRecord) => result.status === 'passed')) return true;
  return allTasks.some(child => (
    child.parent === task.id
    && child.type === 'test'
    && child.status === 'done'
    && (child.testResults ?? []).some((result: VaultRecord) => result.status === 'passed')
  ));
}

export function unresolvedDependencies(task: VaultRecord, allTasks: VaultRecord[]): string[] {
  const dependencies = Array.isArray(task.deps) ? task.deps.map(String) : [];
  return dependencies.filter(id => allTasks.find(candidate => candidate.id === id)?.status !== 'done');
}

export function openChildren(task: VaultRecord, allTasks: VaultRecord[]): VaultRecord[] {
  return allTasks.filter(child => child.parent === task.id && child.status !== 'done' && !child.archivedAt);
}

export function decompositionReasons(task: VaultRecord, allTasks: VaultRecord[]): string[] {
  if (String(task.type ?? '').toLowerCase() === 'test') return [];
  if (allTasks.some(child => child.parent === task.id && !child.archivedAt)) return [];
  const description = textLines(task.description);
  const criteria = textLines(task.acceptanceCriteria);
  const reasons: string[] = [];
  if (String(task.type ?? '').toLowerCase() === 'epic') reasons.push('Epic 必须先拆成可独立验收的子任务');
  if (description.length >= 8) reasons.push(`描述包含 ${description.length} 个工作项，仍像实现清单`);
  if (description.length >= 5 && criteria.length <= 1) reasons.push('多个工作项只对应一条验收标准，粒度过大');
  return reasons;
}

function storedEvidence(task: VaultRecord): string[] {
  const completionEvidence = textLines(task.completion?.evidence);
  const testEvidence = (task.testResults ?? [])
    .filter((result: VaultRecord) => result.status === 'passed')
    .flatMap((result: VaultRecord) => [...textLines(result.evidence), ...textLines(result.command)]);
  return [...completionEvidence, ...testEvidence];
}

export function completionChecks(
  task: VaultRecord,
  allTasks: VaultRecord[],
  pendingEvidence?: unknown,
): WorkflowCheck[] {
  const criteria = textLines(task.acceptanceCriteria);
  const dependencies = unresolvedDependencies(task, allTasks);
  const children = openChildren(task, allTasks);
  const mustVerify = verificationRequired(task);
  const verified = !mustVerify || hasPassingVerification(task, allTasks);
  const evidence = [...storedEvidence(task), ...textLines(pendingEvidence)];

  return [
    {
      id: 'acceptance',
      label: '验收标准',
      passed: criteria.length > 0,
      detail: criteria.length > 0 ? `已定义 ${criteria.length} 条` : '至少定义 1 条可验证的验收标准',
    },
    {
      id: 'blocker',
      label: '阻塞',
      passed: !task.blocker,
      detail: task.blocker ? String(task.blocker) : '无未解决阻塞',
    },
    {
      id: 'dependencies',
      label: '前置依赖',
      passed: dependencies.length === 0,
      detail: dependencies.length > 0 ? `未完成：${dependencies.join('、')}` : '前置依赖已完成',
    },
    {
      id: 'children',
      label: '子任务',
      passed: children.length === 0,
      detail: children.length > 0 ? `仍有 ${children.length} 个未完成子任务` : '子任务已完成',
    },
    {
      id: 'verification',
      label: '测试验证',
      passed: verified,
      detail: verified ? (mustVerify ? '已有通过的测试记录' : '该任务不强制测试') : '需要通过的测试记录或已完成的测试子任务',
    },
    {
      id: 'evidence',
      label: '交付证据',
      passed: evidence.length > 0,
      detail: evidence.length > 0 ? `已有 ${evidence.length} 条证据` : '需要代码路径、提交、测试命令或产物位置',
    },
  ];
}

export function nextTaskAction(task: VaultRecord, allTasks: VaultRecord[]): NextTaskAction {
  if (task.status === 'done') {
    return { action: 'reopen', label: '重新打开', reason: '任务已经完成，可在出现回归时重新进入执行流程', blockedBy: [] };
  }

  const dependencies = unresolvedDependencies(task, allTasks);
  if (dependencies.length > 0) {
    return {
      action: 'wait_dependencies',
      label: '等待前置任务',
      reason: `先完成 ${dependencies.join('、')}`,
      blockedBy: dependencies,
    };
  }
  if (task.blocker) {
    return { action: 'resolve_blocker', label: '解除阻塞', reason: String(task.blocker), blockedBy: ['blocker'] };
  }
  if (textLines(task.acceptanceCriteria).length === 0) {
    return { action: 'define_acceptance', label: '定义验收标准', reason: '开始实现前先明确可验证的完成条件', blockedBy: ['acceptance'] };
  }
  const children = openChildren(task, allTasks);
  if (children.length > 0) {
    return {
      action: 'advance_children',
      label: '推进子任务',
      reason: `仍有 ${children.length} 个子任务未完成`,
      blockedBy: children.map(child => child.id),
    };
  }
  const decomposition = decompositionReasons(task, allTasks);
  if (decomposition.length > 0) {
    return {
      action: 'decompose',
      label: '继续拆解任务',
      reason: decomposition.join('；'),
      blockedBy: ['decomposition'],
    };
  }
  if (!isClaimActive(task)) {
    return { action: 'claim', label: '领取叶子任务', reason: '任务已满足叶子准入条件，可以领取执行', blockedBy: [] };
  }
  if (Number(task.progress ?? 0) < 100 && !hasPassingVerification(task, allTasks)) {
    return { action: 'progress', label: '推进实现', reason: '记录本次进展，完成后进入测试', blockedBy: [] };
  }
  if (verificationRequired(task) && !hasPassingVerification(task, allTasks)) {
    return { action: 'test', label: '执行测试', reason: '完成 Gate 需要通过的测试记录', blockedBy: ['verification'] };
  }
  const checks = completionChecks(task, allTasks);
  const blocked = checks.filter(check => !check.passed && check.id !== 'evidence');
  if (blocked.length > 0) {
    return {
      action: blocked[0].id === 'verification' ? 'test' : 'progress',
      label: blocked[0].id === 'verification' ? '执行测试' : '继续推进',
      reason: blocked.map(check => check.detail).join('；'),
      blockedBy: blocked.map(check => check.id),
    };
  }
  return { action: 'complete', label: '提交验收', reason: '核心 Gate 已通过，补充交付证据后可完成', blockedBy: [] };
}

export function appendHistory(
  task: VaultRecord,
  event: VaultRecord,
  timestamp = new Date().toISOString(),
): VaultRecord[] {
  const history = Array.isArray(task.history) ? task.history : [];
  return [
    ...history,
    {
      id: event.id ?? `evt-${Date.now()}-${history.length + 1}`,
      at: timestamp,
      recordedAt: timestamp,
      ...event,
    },
  ];
}

export function defaultVerification(type: string): { required: boolean } {
  return { required: !['epic', 'chore', 'spike'].includes(type) };
}
