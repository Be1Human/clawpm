export const LEGACY_TASK_FORMAT = 'clawpm-tasks@1';
export const TASK_FORMAT = 'clawpm-task@2';

export type VaultTask = Record<string, any> & {
  id: string;
  __file: string;
  __revision: number;
};

type LegacyTaskFile = {
  format?: string;
  tasks?: Array<Record<string, any>>;
};

type TaskFile = {
  format: typeof TASK_FORMAT;
  revision?: number;
  task?: Record<string, any>;
};

export type TaskStorageSummary = {
  legacyFiles: string[];
  taskFiles: string[];
  mode: 'empty' | 'legacy' | 'mixed' | 'per-task';
};

function isTaskPath(file: string): boolean {
  return /^(tasks|archive)\/[^/]+\.json$/.test(file);
}

function positiveRevision(value: unknown): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function isTaskFile(document: LegacyTaskFile | TaskFile): document is TaskFile {
  return document.format === TASK_FORMAT;
}

export function readVaultTasks(files: Record<string, string>): VaultTask[] {
  const order: string[] = [];
  const tasks = new Map<string, VaultTask>();

  // Legacy aggregates are loaded first. Per-task files then override matching IDs,
  // which keeps interrupted migrations readable without exposing duplicates.
  for (const [file, text] of Object.entries(files)) {
    if (!isTaskPath(file)) continue;
    const document = JSON.parse(text) as LegacyTaskFile | TaskFile;
    if (isTaskFile(document)) continue;
    for (const task of (document as LegacyTaskFile).tasks ?? []) {
      if (typeof task.id !== 'string' || !task.id) continue;
      if (!tasks.has(task.id)) order.push(task.id);
      tasks.set(task.id, { ...task, __file: file, __revision: 0 } as VaultTask);
    }
  }

  for (const [file, text] of Object.entries(files)) {
    if (!isTaskPath(file)) continue;
    const document = JSON.parse(text) as LegacyTaskFile | TaskFile;
    if (!isTaskFile(document) || !document.task) continue;
    const task = document.task;
    if (typeof task.id !== 'string' || !task.id) continue;
    if (!tasks.has(task.id)) order.push(task.id);
    tasks.set(task.id, {
      ...task,
      __file: file,
      __revision: positiveRevision(document.revision),
    } as VaultTask);
  }

  return order.map(id => tasks.get(id)!);
}

export function inspectTaskStorage(files: Record<string, string>): TaskStorageSummary {
  const legacyFiles: string[] = [];
  const taskFiles: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (!isTaskPath(file)) continue;
    const document = JSON.parse(text) as LegacyTaskFile | TaskFile;
    if (isTaskFile(document)) taskFiles.push(file);
    else if (Array.isArray((document as LegacyTaskFile).tasks)) legacyFiles.push(file);
  }
  const mode = legacyFiles.length > 0
    ? (taskFiles.length > 0 ? 'mixed' : 'legacy')
    : (taskFiles.length > 0 ? 'per-task' : 'empty');
  return { legacyFiles, taskFiles, mode };
}

export function serializeTaskFile(task: Record<string, any>, revision = 1): string {
  const { __file: _file, __revision: _revision, ...storedTask } = task;
  return `${JSON.stringify({
    format: TASK_FORMAT,
    revision: positiveRevision(revision),
    task: storedTask,
  }, null, 2)}\n`;
}
