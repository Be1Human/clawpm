import { eq, and, or, sql, isNull, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { tasks, taskScheduleRuns, taskNotes, milestones } from '../db/schema.js';
import { NotificationService } from './notification-service.js';
import cronParser from 'cron-parser';

// ── Types ───────────────────────────────────────────────────────────────────

export interface TriggerContext {
  triggerType: string;   // 'recurring' | 'scheduled' | 'milestone' | 'manual'
  triggerSource: string; // 'scheduler_poller' | 'milestone_event' | 'manual_api' | 'mcp:xxx'
  scheduledAt?: string;
  payload?: Record<string, unknown>;
  runKey: string;
}

export interface TriggerResult {
  ok: boolean;
  taskId: string;
  triggeredAt?: string;
  runId?: number;
  statusBefore?: string;
  statusAfter?: string;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export interface ProcessResult {
  processed: number;
  triggered: number;
  skipped: number;
  errors: number;
}

const VALID_MODES = ['once', 'recurring', 'scheduled', 'milestone_driven', 'on_demand'] as const;

// ── Service ─────────────────────────────────────────────────────────────────

export const ScheduleService = {

  /**
   * 校验调度配置的合法性
   */
  validateSchedule(input: { schedule_mode?: string; schedule_cron?: string; schedule_config?: Record<string, any> }): void {
    const mode = input.schedule_mode || 'once';
    if (!VALID_MODES.includes(mode as any)) {
      throw new Error(`无效的调度类型: ${mode}，允许值: ${VALID_MODES.join(', ')}`);
    }

    const config = input.schedule_config || {};

    switch (mode) {
      case 'once':
        if (input.schedule_cron) throw new Error('once 模式下 schedule_cron 必须为空');
        break;

      case 'recurring':
        if (!input.schedule_cron) throw new Error('recurring 模式下 schedule_cron 必填');
        try {
          cronParser.parseExpression(input.schedule_cron, {
            tz: (config as any).timezone || 'Asia/Shanghai',
          });
        } catch (e: any) {
          throw new Error(`无效的 cron 表达式: ${input.schedule_cron} — ${e.message}`);
        }
        break;

      case 'scheduled':
        if (input.schedule_cron) throw new Error('scheduled 模式下 schedule_cron 必须为空');
        if (!config.trigger_at) throw new Error('scheduled 模式下 schedule_config.trigger_at 必填');
        if (isNaN(new Date(config.trigger_at).getTime())) {
          throw new Error(`无效的触发时间: ${config.trigger_at}`);
        }
        break;

      case 'milestone_driven':
        if (input.schedule_cron) throw new Error('milestone_driven 模式下 schedule_cron 必须为空');
        if (!config.milestone_id) throw new Error('milestone_driven 模式下 schedule_config.milestone_id 必填');
        if (!config.trigger_on) throw new Error('milestone_driven 模式下 schedule_config.trigger_on 必填');
        // 验证里程碑存在
        const db0 = getDb();
        const ms = db0.select().from(milestones).where(eq(milestones.id, config.milestone_id)).get();
        if (!ms) throw new Error(`里程碑不存在: id=${config.milestone_id}`);
        break;

      case 'on_demand':
        if (input.schedule_cron) throw new Error('on_demand 模式下 schedule_cron 必须为空');
        break;
    }
  },

  /**
   * 计算任务的下一次触发时间
   */
  computeNextRun(task: any, now?: Date): string | null {
    const mode = task.scheduleMode || task.schedule_mode || 'once';
    const currentTime = now || new Date();

    if (mode === 'once' || mode === 'on_demand') return null;

    if (task.schedulePaused || task.schedule_paused) return null;

    let config: any = {};
    try {
      config = typeof task.scheduleConfig === 'string'
        ? JSON.parse(task.scheduleConfig || '{}')
        : (task.scheduleConfig || {});
    } catch { config = {}; }

    if (mode === 'recurring') {
      const cronStr = task.scheduleCron || task.schedule_cron;
      if (!cronStr) return null;

      try {
        const tz = config.timezone || 'Asia/Shanghai';
        // 检查有效期
        if (config.end_at && new Date(config.end_at) < currentTime) return null;

        const interval = cronParser.parseExpression(cronStr, {
          currentDate: currentTime,
          tz,
        });
        const next = interval.next().toDate();

        // 检查 start_at / end_at 窗口
        if (config.start_at && next < new Date(config.start_at)) {
          // 下一次在 start_at 之前，从 start_at 重新计算
          const interval2 = cronParser.parseExpression(cronStr, {
            currentDate: new Date(config.start_at),
            tz,
          });
          const next2 = interval2.next().toDate();
          if (config.end_at && next2 > new Date(config.end_at)) return null;
          return next2.toISOString();
        }
        if (config.end_at && next > new Date(config.end_at)) return null;

        return next.toISOString();
      } catch {
        return null;
      }
    }

    if (mode === 'scheduled') {
      const triggerAt = config.trigger_at;
      if (!triggerAt) return null;
      const triggerTime = new Date(triggerAt);
      // 如果已经过了触发时间且已触发过，返回 null
      const lastTriggered = task.scheduleLastTriggeredAt || task.schedule_last_triggered_at;
      if (lastTriggered) return null; // 已触发过了
      if (triggerTime <= currentTime) return null; // 时间已过（会被轮询器捕获）
      return triggerTime.toISOString();
    }

    if (mode === 'milestone_driven') {
      // 里程碑驱动的任务没有固定的下次触发时间
      return null;
    }

    return null;
  },

  /**
   * 刷新任务的 schedule_next_run_at
   */
  refreshNextRun(taskId: string): void {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return;

    const nextRun = this.computeNextRun(task);
    db.update(tasks).set({
      scheduleNextRunAt: nextRun,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskId)).run();
  },

  /**
   * 触发任务 —— 所有触发的统一入口
   */
  triggerTask(taskStrId: string, ctx: TriggerContext): TriggerResult {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskStrId)).get();
    if (!task) return { ok: false, taskId: taskStrId, error: '任务不存在' };

    const now = new Date().toISOString();

    // 幂等检查：runKey 是否已存在
    const existingRun = db.select().from(taskScheduleRuns)
      .where(eq(taskScheduleRuns.runKey, ctx.runKey)).get();
    if (existingRun) {
      return { ok: true, taskId: taskStrId, skipped: true, skipReason: '已触发过（runKey 重复）' };
    }

    let config: any = {};
    try { config = JSON.parse(task.scheduleConfig || '{}'); } catch { config = {}; }

    // 检查是否应跳过
    if ((task as any).archivedAt) {
      this._writeRun(db, task, ctx, now, 'skipped', '任务已归档');
      return { ok: true, taskId: taskStrId, skipped: true, skipReason: '任务已归档' };
    }

    if (task.schedulePaused) {
      this._writeRun(db, task, ctx, now, 'skipped', '调度已暂停');
      return { ok: true, taskId: taskStrId, skipped: true, skipReason: '调度已暂停' };
    }

    // 执行触发
    const statusBefore = task.status;
    let statusAfter = statusBefore;
    const updates: Record<string, any> = {
      scheduleLastTriggeredAt: now,
      scheduleLastError: null,
      updatedAt: now,
    };

    const autoActivate = config.auto_activate !== false; // 默认 true
    const reopenOnTrigger = config.reopen_on_trigger === true;
    const resetProgress = config.reset_progress_on_trigger === true;

    if ((statusBefore === 'backlog' || statusBefore === 'planned') && autoActivate) {
      updates.status = 'active';
      statusAfter = 'active';
    } else if ((statusBefore === 'done' || statusBefore === 'review') && reopenOnTrigger) {
      updates.status = 'active';
      statusAfter = 'active';
      if (resetProgress) {
        updates.progress = 0;
      }
    }

    db.update(tasks).set(updates as any).where(eq(tasks.id, task.id)).run();

    // 写运行记录
    const runId = this._writeRun(db, task, ctx, now, 'triggered');

    // 写任务备注
    const triggerDesc = ctx.triggerType === 'manual'
      ? `手动触发 (by ${ctx.triggerSource})`
      : `${ctx.triggerType} 触发 (by ${ctx.triggerSource})`;
    try {
      db.insert(taskNotes).values({
        taskId: task.id,
        content: `[系统调度] ${now.slice(0, 19)} 由 ${triggerDesc}`,
        author: 'system',
      }).run();
    } catch {}

    // 发送通知
    try {
      if (config.notify_owner && task.owner) {
        NotificationService.create({
          projectId: task.projectId || 1,
          recipientId: task.owner,
          type: 'task_assigned',
          title: `调度触发: ${task.title}`,
          content: `任务 ${taskStrId} 已由 ${triggerDesc}`,
          taskId: taskStrId,
        });
      }
      if (config.notify_assignee && (task as any).assignee) {
        NotificationService.create({
          projectId: task.projectId || 1,
          recipientId: (task as any).assignee,
          type: 'task_assigned',
          title: `调度触发: ${task.title}`,
          content: `任务 ${taskStrId} 已由 ${triggerDesc}`,
          taskId: taskStrId,
        });
      }
    } catch {}

    // 更新 next_run_at
    const mode = task.scheduleMode || 'once';
    if (mode === 'recurring') {
      // 重新计算下一次执行时间
      const refreshedTask = db.select().from(tasks).where(eq(tasks.id, task.id)).get();
      if (refreshedTask) {
        const nextRun = this.computeNextRun(refreshedTask);
        db.update(tasks).set({ scheduleNextRunAt: nextRun } as any).where(eq(tasks.id, task.id)).run();
      }
    } else if (mode === 'scheduled') {
      // 定时任务触发后清空 next_run_at
      db.update(tasks).set({ scheduleNextRunAt: null } as any).where(eq(tasks.id, task.id)).run();
    }

    return {
      ok: true,
      taskId: taskStrId,
      triggeredAt: now,
      runId,
      statusBefore,
      statusAfter,
    };
  },

  /**
   * 扫描到期任务并执行触发 —— 由 SchedulerWorker 调用
   */
  processDueTasks(now?: Date): ProcessResult {
    const db = getDb();
    const currentTime = now || new Date();
    const result: ProcessResult = { processed: 0, triggered: 0, skipped: 0, errors: 0 };

    // 1. 扫描 recurring 和 scheduled 的 due 任务
    const dueTasks = db.select().from(tasks).where(
      and(
        sql`${tasks.scheduleMode} IN ('recurring', 'scheduled')`,
        sql`${tasks.scheduleNextRunAt} IS NOT NULL`,
        sql`${tasks.scheduleNextRunAt} <= ${currentTime.toISOString()}`,
        eq(tasks.schedulePaused, 0),
        isNull(tasks.archivedAt),
      )
    ).all();

    for (const task of dueTasks) {
      result.processed++;
      try {
        const mode = task.scheduleMode || 'once';
        const scheduledAt = (task as any).scheduleNextRunAt;
        const runKey = `${task.taskId}:${mode}:${scheduledAt}`;

        const triggerResult = this.triggerTask(task.taskId, {
          triggerType: mode,
          triggerSource: 'scheduler_poller',
          scheduledAt,
          runKey,
        });

        if (triggerResult.skipped) {
          result.skipped++;
        } else if (triggerResult.ok) {
          result.triggered++;
        } else {
          result.errors++;
          // 记录错误到任务
          db.update(tasks).set({
            scheduleLastError: triggerResult.error || 'unknown error',
          } as any).where(eq(tasks.id, task.id)).run();
        }
      } catch (e: any) {
        result.errors++;
        try {
          db.update(tasks).set({
            scheduleLastError: e.message || 'unexpected error',
          } as any).where(eq(tasks.id, task.id)).run();
        } catch {}
      }
    }

    return result;
  },

  /**
   * 处理里程碑完成事件 —— 触发所有关联的 milestone_driven 任务
   */
  handleMilestoneCompleted(milestoneId: number, now?: Date): number {
    const db = getDb();
    const currentTime = now || new Date();
    let triggered = 0;

    // 查找所有 milestone_driven 且关联此里程碑的任务
    const allTasks = db.select().from(tasks).where(
      and(
        eq(tasks.scheduleMode, 'milestone_driven'),
        eq(tasks.schedulePaused, 0),
        isNull(tasks.archivedAt),
      )
    ).all();

    for (const task of allTasks) {
      let config: any = {};
      try { config = JSON.parse(task.scheduleConfig || '{}'); } catch { continue; }

      if (config.milestone_id !== milestoneId) continue;
      if (config.trigger_on && config.trigger_on !== 'completed') continue;

      const runKey = `${task.taskId}:milestone:${milestoneId}:completed:${currentTime.toISOString()}`;

      const result = this.triggerTask(task.taskId, {
        triggerType: 'milestone',
        triggerSource: 'milestone_event',
        runKey,
        payload: { milestoneId, event: 'completed' },
      });

      if (result.ok && !result.skipped) triggered++;
    }

    return triggered;
  },

  /**
   * 查看某个任务的运行历史
   */
  listRuns(taskStrId: string, limit: number = 20) {
    const db = getDb();
    const runs = db.select().from(taskScheduleRuns)
      .where(eq(taskScheduleRuns.taskStrId, taskStrId))
      .orderBy(desc(taskScheduleRuns.id))
      .limit(limit)
      .all();

    return runs.map(r => ({
      runId: r.id,
      taskId: r.taskStrId,
      triggerType: r.triggerType,
      triggerSource: r.triggerSource,
      scheduledAt: r.scheduledAt,
      triggeredAt: r.triggeredAt,
      status: r.status,
      payload: (() => { try { return JSON.parse(r.payload || '{}'); } catch { return {}; } })(),
      errorMessage: r.errorMessage,
    }));
  },

  /**
   * 查询即将触发或刚触发的任务
   */
  listDueTasks(opts: { withinMinutes?: number; projectId?: number; includeJustTriggered?: boolean }) {
    const db = getDb();
    const within = opts.withinMinutes || 60;
    const now = new Date();
    const windowStart = new Date(now.getTime() - within * 60000).toISOString();
    const windowEnd = new Date(now.getTime() + within * 60000).toISOString();

    const conditions: any[] = [
      sql`${tasks.scheduleMode} != 'once'`,
      isNull(tasks.archivedAt),
    ];

    if (opts.projectId) {
      conditions.push(eq(tasks.projectId, opts.projectId));
    }

    const allScheduled = db.select().from(tasks).where(and(...conditions)).all();

    const results: any[] = [];
    for (const task of allScheduled) {
      const nextRun = (task as any).scheduleNextRunAt;
      const lastTriggered = (task as any).scheduleLastTriggeredAt;

      let dueType: string | null = null;

      // upcoming: nextRun 在窗口内
      if (nextRun && nextRun >= windowStart && nextRun <= windowEnd) {
        dueType = nextRun <= now.toISOString() ? 'just_triggered' : 'upcoming';
      }
      // just_triggered: lastTriggered 在窗口内
      if (!dueType && opts.includeJustTriggered !== false && lastTriggered && lastTriggered >= windowStart) {
        dueType = 'just_triggered';
      }

      if (dueType) {
        results.push({
          taskId: task.taskId,
          title: task.title,
          scheduleMode: task.scheduleMode,
          scheduleNextRunAt: nextRun || null,
          scheduleLastTriggeredAt: lastTriggered || null,
          status: task.status,
          owner: task.owner,
          dueType,
        });
      }
    }

    return results;
  },

  /**
   * 暂停/恢复调度
   */
  setPaused(taskStrId: string, paused: boolean): boolean {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskStrId)).get();
    if (!task) return false;

    db.update(tasks).set({
      schedulePaused: paused ? 1 : 0,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskStrId)).run();

    return true;
  },

  /**
   * 回填所有非 once 任务的 next_run_at（服务启动时调用）
   */
  backfillNextRunAt(): number {
    const db = getDb();
    const scheduledTasks = db.select().from(tasks).where(
      sql`${tasks.scheduleMode} != 'once' AND ${tasks.scheduleMode} != 'on_demand'`
    ).all();

    let updated = 0;
    for (const task of scheduledTasks) {
      const nextRun = this.computeNextRun(task);
      const current = (task as any).scheduleNextRunAt;
      if (nextRun !== current) {
        db.update(tasks).set({ scheduleNextRunAt: nextRun } as any).where(eq(tasks.id, task.id)).run();
        updated++;
      }
    }
    return updated;
  },

  // ── Internal helpers ──────────────────────────────────────────────────────

  _writeRun(db: any, task: any, ctx: TriggerContext, now: string, status: string, errorMessage?: string): number {
    db.insert(taskScheduleRuns).values({
      projectId: task.projectId || 1,
      taskId: task.id,
      taskStrId: task.taskId,
      runKey: ctx.runKey,
      triggerType: ctx.triggerType,
      triggerSource: ctx.triggerSource,
      scheduledAt: ctx.scheduledAt || null,
      triggeredAt: now,
      status,
      payload: JSON.stringify(ctx.payload || {}),
      errorMessage: errorMessage || null,
    }).run();

    // 获取刚插入的 ID
    const lastRun = db.select().from(taskScheduleRuns)
      .where(eq(taskScheduleRuns.runKey, ctx.runKey)).get();
    return lastRun?.id || 0;
  },
};
