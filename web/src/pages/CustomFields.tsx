import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const FIELD_TYPE_KEYS = [
  { value: 'text', labelKey: 'customFields.typeText' },
  { value: 'number', labelKey: 'customFields.typeNumber' },
  { value: 'date', labelKey: 'customFields.typeDate' },
  { value: 'select', labelKey: 'customFields.typeSelect' },
  { value: 'multi_select', labelKey: 'customFields.typeMultiSelect' },
];

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981',
  '#f59e0b', '#f97316', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#84cc16', '#64748b',
];

function FieldModal({ field, onClose, t }: { field?: any; onClose: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const qc = useQueryClient();
  const isEdit = !!field;

  const [form, setForm] = useState({
    name: field?.name || '',
    field_type: field?.fieldType || field?.field_type || 'text',
    color: field?.color || '',
    options: (field?.options
      ? (typeof field.options === 'string' ? JSON.parse(field.options) : field.options)
      : []
    ).join(', '),
    sort_order: field?.sortOrder ?? field?.sort_order ?? 0,
  });

  const showOptions = form.field_type === 'select' || form.field_type === 'multi_select';

  const createMut = useMutation({
    mutationFn: () => api.createCustomField({
      name: form.name,
      field_type: form.field_type,
      color: form.color || null,
      options: showOptions ? form.options.split(',').map((o: string) => o.trim()).filter(Boolean) : [],
      sort_order: Number(form.sort_order) || 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateCustomField(field!.id, {
      name: form.name,
      field_type: form.field_type,
      color: form.color || null,
      options: showOptions ? form.options.split(',').map((o: string) => o.trim()).filter(Boolean) : [],
      sort_order: Number(form.sort_order) || 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); onClose(); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    isEdit ? updateMut.mutate() : createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending;
  const error = createMut.error || updateMut.error;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? t('customFields.editField') : t('customFields.createField')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('customFields.nameLabel')}</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={t('customFields.namePlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('customFields.typeLabel')}</label>
              <select
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                value={form.field_type}
                onChange={e => setForm(f => ({ ...f, field_type: e.target.value }))}
              >
                {FIELD_TYPE_KEYS.map(ft => <option key={ft.value} value={ft.value}>{t(ft.labelKey)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('customFields.sortOrder')}</label>
              <input
                type="number"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>

          {showOptions && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">{t('customFields.optionsLabel')}</label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                value={form.options}
                onChange={e => setForm(f => ({ ...f, options: e.target.value }))}
                placeholder={t('customFields.optionsPlaceholder')}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('customFields.colorLabel')}</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, color: '' }))}
                className={cn('w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center text-[10px]',
                  !form.color ? 'border-gray-900 scale-110' : 'border-gray-200 hover:scale-105')}
              >
                ✕
              </button>
              {PRESET_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={cn('w-6 h-6 rounded-full border-2 transition-all',
                    form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {pending ? t('common.saving') : isEdit ? t('customFields.saveChanges') : t('customFields.createField')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldCard({ field, onEdit, onDelete, t }: { field: any; onEdit: () => void; onDelete: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const typeMeta = FIELD_TYPE_KEYS.find(ft => ft.value === (field.fieldType || field.field_type)) || FIELD_TYPE_KEYS[0];
  const options: string[] = typeof field.options === 'string' ? JSON.parse(field.options || '[]') : (field.options || []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 group hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{
              backgroundColor: field.color ? `${field.color}18` : '#f1f5f9',
              color: field.color || '#64748b',
            }}
          >
            {typeMeta.value === 'text' ? 'Aa' :
             typeMeta.value === 'number' ? '#' :
             typeMeta.value === 'date' ? '📅' :
             typeMeta.value === 'select' ? '◉' : '☑'}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{field.name}</h3>
            <p className="text-xs text-gray-400">{t(typeMeta.labelKey)}</p>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs transition-colors" title={t('common.edit')}>✎</button>
          <button onClick={onDelete} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs transition-colors" title={t('common.delete')}>✕</button>
        </div>
      </div>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {options.map(o => (
            <span key={o} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{o}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomFields() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const [showModal, setShowModal] = useState(false);
  const [editField, setEditField] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['custom-fields', activeProject],
    queryFn: () => api.getCustomFields(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteCustomField(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-fields'] }); setDeleteConfirm(null); },
  });

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('customFields.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('customFields.subtitle')}</p>
        </div>
        <button
          onClick={() => { setEditField(null); setShowModal(true); }}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          {t('customFields.addField')}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t('customFields.fieldCount'), value: (fields as any[]).length },
          { label: t('customFields.selectType'), value: (fields as any[]).filter((f: any) => (f.fieldType || f.field_type) === 'select' || (f.fieldType || f.field_type) === 'multi_select').length },
          { label: t('customFields.numDateType'), value: (fields as any[]).filter((f: any) => (f.fieldType || f.field_type) === 'number' || (f.fieldType || f.field_type) === 'date').length },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">{t('common.loading')}</div>
      ) : (fields as any[]).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">{t('customFields.noFields')}</p>
          <p className="text-xs mt-1 text-gray-300">{t('customFields.noFieldsHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(fields as any[]).map((f: any) => (
            <FieldCard
              key={f.id}
              field={f}
              t={t}
              onEdit={() => { setEditField(f); setShowModal(true); }}
              onDelete={() => setDeleteConfirm(f)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <FieldModal field={editField} t={t} onClose={() => { setShowModal(false); setEditField(null); }} />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('common.confirmDelete')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('customFields.deleteConfirmBody', { name: deleteConfirm.name })}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.id)}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? t('common.deleting') : t('common.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
