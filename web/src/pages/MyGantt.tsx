import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useI18n, getDateLocale } from '@/lib/i18n';
import TreeGanttView from '@/components/TreeGanttView';
import { sortTreeByPriority, filterTreeKeepAncestors, flattenTree } from '@/lib/tree';

export default function MyGantt() {
  const { t, locale } = useI18n();
  const dateLocale = getDateLocale(locale);

  const activeProject = useActiveProject();
  const currentUser = useCurrentUser();

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['my-gantt-tree', activeProject, currentUser],
    queryFn: () => api.getTaskTree(currentUser ? { owner: currentUser } : undefined),
    enabled: !!currentUser,
  });
  const { data: milestones = [] } = useQuery({
    queryKey: ['milestones', activeProject],
    queryFn: () => api.getMilestones(),
    enabled: !!currentUser,
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <div className="text-5xl opacity-30">👤</div>
          <p className="text-gray-500">{t('myDashboard.selectIdentityFirst')}</p>
        </div>
      </div>
    );
  }

  const sortedTree = useMemo(() => sortTreeByPriority(tree as any[]), [tree]);
  const filteredTree = useMemo(
    () => filterTreeKeepAncestors(sortedTree, (node: any) => !!(node.startDate || node.dueDate || node.createdAt)),
    [sortedTree]
  );
  const totalNodes = useMemo(() => flattenTree(filteredTree as any[]).length, [filteredTree]);

  return (
    <TreeGanttView
      tree={filteredTree as any[]}
      milestones={milestones as any[]}
      isLoading={isLoading}
      t={t}
      dateLocale={dateLocale}
      title={t('nav.ganttChart')}
      subtitle={t('myTasks.subtreeInfo', { user: currentUser, count: totalNodes })}
    />
  );
}
