import { useSyncExternalStore } from 'react';
import { getActiveProject, subscribeActiveProject } from '@/api/client';

/** 响应式地读取当前活跃项目 slug，切换时自动重渲染 */
export function useActiveProject(): string {
  return useSyncExternalStore(subscribeActiveProject, getActiveProject);
}
