import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, withBasePath, getServerOrigin } from '@/api/client';
import { useI18n } from '@/lib/i18n';

const CATEGORY_CONFIG: Record<string, { labelKey: string; color: string; bgColor: string; icon: string }> = {
  bug:      { labelKey: 'intake.catBug',      color: '#dc2626', bgColor: '#fef2f2', icon: '🐛' },
  feature:  { labelKey: 'intake.catFeature',  color: '#2563eb', bgColor: '#eff6ff', icon: '✨' },
  feedback: { labelKey: 'intake.catFeedback', color: '#6366f1', bgColor: '#eef2ff', icon: '💬' },
};

const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bgColor: string }> = {
  pending:   { labelKey: 'intake.statusPending',   color: '#f59e0b', bgColor: '#fffbeb' },
  accepted:  { labelKey: 'intake.statusAccepted',  color: '#16a34a', bgColor: '#f0fdf4' },
  rejected:  { labelKey: 'intake.statusRejected',  color: '#dc2626', bgColor: '#fef2f2' },
  deferred:  { labelKey: 'intake.statusDeferred',  color: '#6366f1', bgColor: '#eef2ff' },
  duplicate: { labelKey: 'intake.statusDuplicate', color: '#64748b', bgColor: '#f1f5f9' },
};

export default function IntakeList() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // Review panel state
  const [reviewAction, setReviewAction] = useState<string>('');
  const [reviewNote, setReviewNote] = useState('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [owner, setOwner] = useState('');
  const [reviewPriority, setReviewPriority] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['intake', statusFilter, categoryFilter],
    queryFn: () => api.getIntakeList({
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
    }),
  });

  const { data: stats } = useQuery({
    queryKey: ['intake-stats'],
    queryFn: () => api.getIntakeStats(),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.getMembers(),
  });

  const reviewMutation = useMutation({
    mutationFn: (params: { intakeId: string; data: any }) =>
      api.reviewIntake(params.intakeId, params.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intake'] });
      qc.invalidateQueries({ queryKey: ['intake-stats'] });
      setSelectedItem(null);
      setReviewAction('');
      setReviewNote('');
      setParentTaskId('');
      setOwner('');
      setReviewPriority('');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (intakeId: string) => api.reopenIntake(intakeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intake'] });
      qc.invalidateQueries({ queryKey: ['intake-stats'] });
      setSelectedItem(null);
    },
  });

  function handleReview() {
    if (!selectedItem || !reviewAction) return;
    reviewMutation.mutate({
      intakeId: selectedItem.intakeId,
      data: {
        action: reviewAction,
        review_note: reviewNote || undefined,
        parent_task_id: parentTaskId || undefined,
        owner: owner || undefined,
        priority: reviewPriority || undefined,
      },
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t('intake.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('intake.subtitle')}</p>
          </div>
          <button
            onClick={() => {
              const intakeUrl = `${getServerOrigin()}${withBasePath('/intake/submit')}`;
              navigator.clipboard.writeText(intakeUrl);
            }}
            className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
          >
            {t('intake.copyLink')}
          </button>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-5 gap-3 mb-6">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
                className="bg-white rounded-xl p-3.5 border transition-all hover:shadow-sm text-left"
                style={{
                  borderColor: statusFilter === key ? cfg.color : '#e5e7eb',
                  backgroundColor: statusFilter === key ? cfg.bgColor : 'white',
                }}
              >
                <div className="text-2xl font-bold" style={{ color: cfg.color }}>
                  {(stats as any)[key] || 0}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{t(cfg.labelKey)}</div>
              </button>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div className="flex gap-2 mb-4">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">{t('intake.allStatuses')}</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{t(cfg.labelKey)}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">{t('intake.allCategories')}</option>
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.icon} {t(cfg.labelKey)}</option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center text-gray-400 py-12">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-2">📮</div>
              <p>{t('intake.noItems')}</p>
            </div>
          ) : (
            items.map((item: any) => {
              const cat = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.feedback;
              const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
              const isSelected = selectedItem?.id === item.id;

              return (
                <div key={item.id}>
                  <button
                    onClick={() => setSelectedItem(isSelected ? null : item)}
                    className="w-full text-left bg-white rounded-xl border p-4 hover:shadow-sm transition-all"
                    style={{ borderColor: isSelected ? '#6366f1' : '#e5e7eb' }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-mono text-gray-400">{item.intakeId}</span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ color: cat.color, backgroundColor: cat.bgColor }}
                          >
                            {cat.icon} {t(cat.labelKey)}
                          </span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ color: st.color, backgroundColor: st.bgColor }}
                          >
                            {t(st.labelKey)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                            {item.priority}
                          </span>
                        </div>
                        <h3 className="text-sm font-medium text-gray-900 truncate">{item.title}</h3>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                          <span>{t('intake.submitter')}: {item.submitter}</span>
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                          {item.reviewedBy && <span>{t('intake.reviewer')}: {item.reviewedBy}</span>}
                          {item.taskId && (
                            <span className="text-indigo-500 font-medium">→ {item.taskId}</span>
                          )}
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-300 transition-transform ${isSelected ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Detail + Review panel */}
                  {isSelected && (
                    <div className="bg-white border border-t-0 rounded-b-xl p-4 -mt-1" style={{ borderColor: '#6366f1' }}>
                      {/* Description */}
                      {item.description && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                          {item.description}
                        </div>
                      )}

                      {/* Review note */}
                      {item.reviewNote && (
                        <div className="mb-4 p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                          <span className="font-medium">{t('intake.reviewNote')}:</span> {item.reviewNote}
                        </div>
                      )}

                      {/* Actions (pending only) */}
                      {item.status === 'pending' && (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            {[
                              { action: 'accept', labelKey: 'intake.accept', color: '#16a34a', bg: '#f0fdf4' },
                              { action: 'reject', labelKey: 'intake.reject', color: '#dc2626', bg: '#fef2f2' },
                              { action: 'defer',  labelKey: 'intake.defer',  color: '#6366f1', bg: '#eef2ff' },
                              { action: 'duplicate', labelKey: 'intake.duplicate', color: '#64748b', bg: '#f1f5f9' },
                            ].map(btn => (
                              <button
                                key={btn.action}
                                onClick={() => setReviewAction(reviewAction === btn.action ? '' : btn.action)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all"
                                style={{
                                  borderColor: reviewAction === btn.action ? btn.color : '#e5e7eb',
                                  backgroundColor: reviewAction === btn.action ? btn.bg : 'white',
                                  color: reviewAction === btn.action ? btn.color : '#6b7280',
                                }}
                              >
                                {t(btn.labelKey)}
                              </button>
                            ))}
                          </div>

                          {reviewAction && (
                            <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                              {/* Accept extra config */}
                              {reviewAction === 'accept' && (
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('intake.parentNode')}</label>
                                    <input
                                      value={parentTaskId}
                                      onChange={e => setParentTaskId(e.target.value)}
                                      placeholder={t('intake.parentPlaceholder')}
                                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('intake.owner')}</label>
                                    <select
                                      value={owner}
                                      onChange={e => setOwner(e.target.value)}
                                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                                    >
                                      <option value="">{t('intake.unspecified')}</option>
                                      {(members as any[]).map((m: any) => (
                                        <option key={m.identifier} value={m.identifier}>{m.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 mb-1">{t('intake.priority')}</label>
                                    <select
                                      value={reviewPriority}
                                      onChange={e => setReviewPriority(e.target.value)}
                                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white"
                                    >
                                      <option value="">{t('intake.keepOriginal')}</option>
                                      {['P0', 'P1', 'P2', 'P3'].map(p => (
                                        <option key={p} value={p}>{p}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}

                              {/* Review note */}
                              <div>
                                <label className="block text-[11px] font-medium text-gray-500 mb-1">
                                  {t('intake.reviewNote')} {reviewAction === 'reject' && <span className="text-red-500">*</span>}
                                </label>
                                <textarea
                                  value={reviewNote}
                                  onChange={e => setReviewNote(e.target.value)}
                                  placeholder={reviewAction === 'reject' ? t('intake.rejectReasonPlaceholder') : t('intake.optionalNote')}
                                  rows={2}
                                  className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                                />
                              </div>

                              <div className="flex justify-end">
                                <button
                                  onClick={handleReview}
                                  disabled={reviewMutation.isPending || (reviewAction === 'reject' && !reviewNote.trim())}
                                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  {reviewMutation.isPending ? t('intake.processing') : t('common.confirm')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Deferred can be reopened */}
                      {item.status === 'deferred' && (
                        <button
                          onClick={() => reopenMutation.mutate(item.intakeId)}
                          disabled={reopenMutation.isPending}
                          className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                        >
                          {reopenMutation.isPending ? t('intake.processing') : t('intake.reopen')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
