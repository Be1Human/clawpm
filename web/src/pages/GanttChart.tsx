import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useI18n, getDateLocale } from '@/lib/i18n';
import TreeGanttView from '@/components/TreeGanttView';
import { sortTreeByPriority, filterTreeKeepAncestors } from '@/lib/tree';

export default function GanttChart() {
  const { t, locale } = useI18n();
  const dateLocale = getDateLocale(locale);
  const activeProject = useActiveProject();
  const { data: tree = [], isLoading } = useQuery({
    queryKey: ['gantt-tree', activeProject],
    queryFn: () => api.getTaskTree(),
  });
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones', activeProject], queryFn: () => api.getMilestones() });
  const { data: members = [] } = useQuery({ queryKey: ['members', activeProject], queryFn: () => api.getMembers() });

  const [filterOwner, setFilterOwner] = useState('');

  const sortedTree = useMemo(() => sortTreeByPriority(tree as any[]), [tree]);
  const filteredTree = useMemo(() => {
    const ownerFiltered = filterOwner
      ? filterTreeKeepAncestors(sortedTree, (node: any) => node.owner === filterOwner)
      : sortedTree;
    return filterTreeKeepAncestors(ownerFiltered, (node: any) => !!(node.startDate || node.dueDate || node.createdAt));
  }, [sortedTree, filterOwner]);

  return (
    <TreeGanttView
      tree={filteredTree as any[]}
      milestones={milestones as any[]}
      isLoading={isLoading}
      t={t}
      dateLocale={dateLocale}
      title={t('nav.ganttChart')}
      subtitle="按需求树展开，时间条与树行一一对应"
      extraControls={
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-sm">{t('gantt.groupByOwner')}:</span>
          <select
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            className="bg-white border border-gray-200 text-gray-600 text-sm rounded-lg px-2 py-1"
          >
            <option value="">{t('common.all')}</option>
            {members.map((m: any) => (
              <option key={m.identifier} value={m.identifier}>{m.name}</option>
            ))}
          </select>
        </div>
      }
    />
  );
}
