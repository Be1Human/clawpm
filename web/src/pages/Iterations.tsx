import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useI18n } from '@/lib/i18n';

const STATUS_COLORS: Record<string, { bg: string; text: string; labelKey: string }> = {
  planned: { bg: 'bg-gray-100', text: 'text-gray-600', labelKey: 'status.planned' },
  active: { bg: 'bg-blue-100', text: 'text-blue-700', labelKey: 'status.active' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', labelKey: 'status.completed' },
};

export default function Iterations() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '' });
  const [filterStatus, setFilterStatus] = useState('');

  const { data: iterations = [], isLoading } = useQuery({
    queryKey: ['iterations', filterStatus],
    queryFn: () => api.getIterations(filterStatus || undefined),
  });

  const createMut = useMutation({
    mutationFn: () => api.createIteration(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['iterations'] });
      setShowCreate(false);
      setForm({ name: '', description: '', start_date: '', end_date: '' });
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('iterations.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('iterations.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600"
          >
            <option value="">{t('iterations.allStatuses')}</option>
            <option value="planned">{t('status.planned')}</option>
            <option value="active">{t('status.active')}</option>
            <option value="completed">{t('status.completed')}</option>
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
          >
            {t('iterations.newIteration')}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{t('iterations.createIteration')}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input
                placeholder={t('iterations.namePlaceholder')}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-300 outline-none"
                autoFocus
              />
            </div>
            <div className="col-span-2">
              <textarea
                placeholder={t('iterations.descPlaceholder')}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-300 outline-none h-16 resize-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">{t('iterations.startDate')}</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">{t('iterations.endDate')}</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { if (form.name.trim()) createMut.mutate(); }}
              disabled={!form.name.trim() || createMut.isPending}
              className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('common.create')}
            </button>
            <button onClick={() => setShowCreate(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">{t('common.loading')}</div>
      ) : (iterations as any[]).length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">{t('iterations.noIterations')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 text-sm text-indigo-500 hover:text-indigo-700"
          >
            {t('iterations.createFirst')}
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {(iterations as any[]).map((iter: any) => {
            const status = STATUS_COLORS[iter.status] || STATUS_COLORS.planned;
            const rate = iter.completionRate ?? 0;
            return (
              <div
                key={iter.id}
                onClick={() => navigate(`/iterations/${iter.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{iter.name}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.bg} ${status.text}`}>
                        {t(status.labelKey)}
                      </span>
                    </div>
                    {iter.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{iter.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
                      {iter.startDate && <span>{iter.startDate} ~ {iter.endDate || '?'}</span>}
                      <span>{t('iterations.taskCount', { count: iter.taskCount ?? 0 })}</span>
                      <span>{t('iterations.completedCount', { count: iter.completedCount ?? 0 })}</span>
                    </div>
                  </div>
                  {/* Completion ring */}
                  <div className="flex-shrink-0 ml-4">
                    <svg width="44" height="44" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                      <circle
                        cx="22" cy="22" r="18" fill="none"
                        stroke={rate >= 100 ? '#22c55e' : '#6366f1'}
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 18 * rate / 100} ${2 * Math.PI * 18}`}
                        strokeLinecap="round"
                        transform="rotate(-90 22 22)"
                      />
                      <text x="22" y="24" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="600">
                        {Math.round(rate)}%
                      </text>
                    </svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
