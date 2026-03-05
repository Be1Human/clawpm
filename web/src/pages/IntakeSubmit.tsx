import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';

const CATEGORY_OPTIONS = [
  { value: 'bug', label: 'Bug 报告', icon: '🐛', color: '#dc2626', bgColor: '#fef2f2' },
  { value: 'feature', label: '功能建议', icon: '✨', color: '#2563eb', bgColor: '#eff6ff' },
  { value: 'feedback', label: '一般反馈', icon: '💬', color: '#6366f1', bgColor: '#eef2ff' },
];

const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

export default function IntakeSubmit() {
  const [searchParams] = useSearchParams();
  const projectSlug = searchParams.get('project') || undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('feedback');
  const [submitter, setSubmitter] = useState('');
  const [priority, setPriority] = useState('P2');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [intakeId, setIntakeId] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !submitter.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.submitIntake({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        submitter: submitter.trim(),
        priority,
        project: projectSlug,
      });
      setIntakeId(result.intakeId);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f4f5f7' }}>
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">提交成功！</h2>
          <p className="text-gray-500 mb-4">
            你的反馈已提交，编号为 <span className="font-mono font-bold text-indigo-600">{intakeId}</span>
          </p>
          <p className="text-sm text-gray-400 mb-6">项目成员会尽快审核你的反馈</p>
          <button
            onClick={() => {
              setSubmitted(false);
              setTitle('');
              setDescription('');
              setCategory('feedback');
              setSubmitter('');
              setPriority('P2');
            }}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            继续提交
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: '#f4f5f7' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
            >
              C
            </div>
            <span className="text-lg font-bold text-gray-900">ClawPM</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">提交反馈</h1>
          <p className="text-gray-500 text-sm">提交 Bug 报告、功能建议或一般反馈</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
          {/* 标题 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="简要描述你的问题或建议"
              required
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
            />
          </div>

          {/* 类别 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">类别</label>
            <div className="flex gap-2">
              {CATEGORY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all"
                  style={{
                    borderColor: category === opt.value ? opt.color : '#e5e7eb',
                    backgroundColor: category === opt.value ? opt.bgColor : 'white',
                    color: category === opt.value ? opt.color : '#6b7280',
                  }}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 详细描述 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">详细描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="详细描述问题或建议，支持 Markdown 格式"
              rows={5}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all resize-y"
            />
          </div>

          {/* 提交人 + 优先级 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                你的名字 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={submitter}
                onChange={e => setSubmitter(e.target.value)}
                placeholder="你的名字"
                required
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">建议优先级</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all appearance-none bg-white"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2.5 rounded-xl">{error}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !title.trim() || !submitter.trim()}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? '提交中...' : '提交反馈'}
          </button>
        </form>
      </div>
    </div>
  );
}
