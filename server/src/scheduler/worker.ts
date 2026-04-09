import { ScheduleService } from '../services/schedule-service.js';

const POLL_INTERVAL_MS = 60_000; // 60 秒

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export const SchedulerWorker = {
  /**
   * 启动调度器轮询（幂等：重复调用不会创建多个 interval）
   */
  start(): void {
    if (timer) return; // 已启动

    // 首次启动时回填 next_run_at
    try {
      const backfilled = ScheduleService.backfillNextRunAt();
      if (backfilled > 0) {
        console.log(`[SchedulerWorker] 回填了 ${backfilled} 个任务的 next_run_at`);
      }
    } catch (e: any) {
      console.error('[SchedulerWorker] 回填 next_run_at 失败:', e.message);
    }

    timer = setInterval(() => {
      this.tick();
    }, POLL_INTERVAL_MS);

    console.log(`[SchedulerWorker] 已启动，轮询间隔 ${POLL_INTERVAL_MS / 1000}s`);

    // 启动后立即执行一次
    setTimeout(() => this.tick(), 1000);
  },

  /**
   * 停止轮询
   */
  stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
      console.log('[SchedulerWorker] 已停止');
    }
  },

  /**
   * 单次轮询周期
   */
  tick(): void {
    if (isRunning) {
      console.log('[SchedulerWorker] 上一次轮询尚未完成，跳过本次');
      return;
    }

    isRunning = true;
    try {
      const result = ScheduleService.processDueTasks();
      if (result.processed > 0) {
        console.log(`[SchedulerWorker] 扫描 ${result.processed} 个到期任务: triggered=${result.triggered}, skipped=${result.skipped}, errors=${result.errors}`);
      }
    } catch (e: any) {
      console.error('[SchedulerWorker] 轮询异常:', e.message);
    } finally {
      isRunning = false;
    }
  },

  /**
   * 是否正在运行
   */
  isActive(): boolean {
    return timer !== null;
  },
};
