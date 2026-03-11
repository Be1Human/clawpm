import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { setCurrentUser, setOnboarded } from '../lib/useCurrentUser';

type Role = 'dev' | 'pm' | 'design' | 'mgr' | 'other';
type Step = 1 | 2 | 3 | 4;

const COLORS = [
  { hex: '#6366f1', name: 'Indigo' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#10b981', name: 'Emerald' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#8b5cf6', name: 'Violet' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#ec4899', name: 'Pink' },
];

const ROLES: { id: Role; label: string; icon: string; desc: string }[] = [
  { id: 'dev', label: '开发工程师', icon: '💻', desc: '编码、架构、技术实现' },
  { id: 'pm', label: '产品经理', icon: '📋', desc: '需求分析、产品规划' },
  { id: 'design', label: '设计师', icon: '🎨', desc: 'UI/UX、视觉设计' },
  { id: 'mgr', label: '项目管理', icon: '👥', desc: '进度把控、资源协调' },
  { id: 'other', label: '其他', icon: '✨', desc: '其他角色' },
];

function toIdentifierSuggestion(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w-]/g, '')
    .slice(0, 30);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  // 检查数据库中是否已有成员（换浏览器时会触发此页面但成员已存在）
  const { data: existingMembers = [] } = useQuery<any[]>({
    queryKey: ['members'],
    queryFn: () => api.getMembers(),
  });
  const hasExistingMembers = (existingMembers as any[]).filter((m: any) => m.type === 'human').length > 0;

  function handleSelectExisting(identifier: string) {
    setCurrentUser(identifier);
    setOnboarded();
    navigate('/my/dashboard', { replace: true });
  }

  // Step 2 状态
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [identifierError, setIdentifierError] = useState('');
  const [identifierOk, setIdentifierOk] = useState(false);
  const [color, setColor] = useState(COLORS[0].hex);
  const [role, setRole] = useState<Role | ''>('');
  const [description, setDescription] = useState('');

  // Step 3 状态
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [skipProject, setSkipProject] = useState(false);

  // 自动根据名称生成 identifier 建议
  useEffect(() => {
    if (!identifierTouched && name) {
      setIdentifier(toIdentifierSuggestion(name));
    }
  }, [name, identifierTouched]);

  // 实时校验 identifier 格式
  useEffect(() => {
    if (!identifier) {
      setIdentifierError('');
      setIdentifierOk(false);
      return;
    }
    const valid = /^[\w-]{2,30}$/.test(identifier);
    if (!valid) {
      setIdentifierError('只允许字母、数字、下划线、连字符，长度 2-30');
      setIdentifierOk(false);
      return;
    }
    setIdentifierError('');
    setIdentifierOk(false);
    const timer = setTimeout(async () => {
      try {
        const res = await api.checkIdentifierAvailable(identifier);
        if (res.available) {
          setIdentifierOk(true);
          setIdentifierError('');
        } else {
          setIdentifierOk(false);
          setIdentifierError('该标识已被使用，请换一个');
        }
      } catch {
        // 网络错误时不阻断用户
        setIdentifierOk(true);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [identifier]);

  const step2Valid = name.trim().length > 0 && identifier.length >= 2 && !identifierError && role !== '';

  async function handleFinish() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.createMember({
        name: name.trim(),
        identifier: identifier.trim(),
        color,
        role,
        description: description.trim() || undefined,
        type: 'human',
      });
      if (!skipProject && projectName.trim() && projectName.trim() !== '默认项目') {
        await api.updateProject('default', {
          name: projectName.trim(),
          description: projectDesc.trim() || undefined,
        });
      }
      setCurrentUser(identifier.trim());
      setOnboarded();
      navigate('/my/dashboard', { replace: true });
    } catch (e: any) {
      alert('创建失败：' + (e.message || '未知错误'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo & Progress */}
        <div className="flex items-center justify-between mb-6 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="font-bold text-gray-800 text-lg">ClawPM</span>
          </div>
          {step > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Step {step - 1} / 3</span>
              <div className="flex gap-1.5">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i <= step - 1 ? 'w-6 bg-indigo-500' : 'w-4 bg-gray-200'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Step 1: 欢迎 / 已有成员时直接选择 */}
          {step === 1 && (
            <div className="p-8">
              {hasExistingMembers ? (
                /* 换浏览器场景：数据库已有成员，直接选择身份 */
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">👋</span>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-1">选择你的身份</h1>
                    <p className="text-sm text-gray-400">检测到已有成员数据，直接选择即可进入</p>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
                    {(existingMembers as any[])
                      .filter((m: any) => m.type === 'human')
                      .map((m: any) => (
                        <button
                          key={m.identifier}
                          onClick={() => handleSelectExisting(m.identifier)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left group"
                        >
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                            style={{ backgroundColor: m.color || '#6366f1' }}
                          >
                            {(m.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 text-sm">{m.name}</div>
                            <div className="text-xs text-gray-400">@{m.identifier}</div>
                          </div>
                          <span className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">进入 →</span>
                        </button>
                      ))}
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <button
                      onClick={() => setStep(2)}
                      className="w-full text-sm text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 py-2 rounded-xl transition-colors"
                    >
                      + 创建新身份
                    </button>
                  </div>
                </>
              ) : (
                /* 全新用户：展示欢迎信息 */
                <div className="text-center">
                  <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <span className="text-4xl">🚀</span>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-3">欢迎使用 ClawPM</h1>
                  <p className="text-gray-500 text-sm leading-relaxed mb-2">
                    AI 时代的项目管理工具
                  </p>
                  <p className="text-gray-400 text-xs leading-relaxed mb-8">
                    为人类与 Agent 协作而生 · 任务管理 · 迭代规划 · 需求追踪
                  </p>
                  <div className="grid grid-cols-3 gap-3 mb-8 text-center">
                    {[
                      { icon: '📌', label: '任务追踪' },
                      { icon: '🔄', label: '迭代管理' },
                      { icon: '🤝', label: 'AI 协作' },
                    ].map(item => (
                      <div key={item.label} className="bg-gray-50 rounded-xl p-3">
                        <div className="text-xl mb-1">{item.icon}</div>
                        <div className="text-xs text-gray-500 font-medium">{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    开始使用 →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: 身份建立 */}
          {step === 2 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">建立你的身份</h2>
              <p className="text-sm text-gray-400 mb-6">这将是你在 ClawPM 中的唯一标识</p>

              <div className="space-y-4">
                {/* 名称 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">显示名称 *</label>
                  <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="你的名字，例：张三"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                  />
                </div>

                {/* 标识符 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">唯一标识 *</label>
                  <div className="relative">
                    <input
                      value={identifier}
                      onChange={e => { setIdentifierTouched(true); setIdentifier(e.target.value); }}
                      placeholder="英文/拼音，例：zhangsan"
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 pr-8 ${
                        identifierError
                          ? 'border-red-300 focus:ring-red-100'
                          : identifierOk
                          ? 'border-green-300 focus:ring-green-100'
                          : 'border-gray-200 focus:ring-indigo-200 focus:border-indigo-300'
                      }`}
                    />
                    {identifierOk && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-xs">✓</span>
                    )}
                  </div>
                  {identifierError && (
                    <p className="text-xs text-red-500 mt-1">{identifierError}</p>
                  )}
                  {identifierOk && (
                    <p className="text-xs text-green-500 mt-1">✓ 可用</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">用于任务归属和 @ 引用，创建后不可修改</p>
                </div>

                {/* 头像颜色 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">头像颜色</label>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: color }}
                    >
                      {(name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {COLORS.map(c => (
                        <button
                          key={c.hex}
                          onClick={() => setColor(c.hex)}
                          className={`w-7 h-7 rounded-full transition-all ${
                            color === c.hex ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-110'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* 角色 */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">你的角色 *</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ROLES.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setRole(r.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                          role === r.id
                            ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-lg">{r.icon}</span>
                        <div>
                          <div className={`text-xs font-medium ${role === r.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                            {r.label}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 描述（可选） */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    个人描述 <span className="text-gray-400 font-normal">（可选）</span>
                  </label>
                  <input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="简短介绍自己..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  ← 返回
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!step2Valid}
                  className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                >
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 项目初始化 */}
          {step === 3 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">初始化你的项目</h2>
              <p className="text-sm text-gray-400 mb-6">给你的默认项目起一个有意义的名字</p>

              {!skipProject ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">项目名称</label>
                    <input
                      autoFocus
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      placeholder="例：我的产品、XX 项目..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      项目描述 <span className="text-gray-400 font-normal">（可选）</span>
                    </label>
                    <textarea
                      value={projectDesc}
                      onChange={e => setProjectDesc(e.target.value)}
                      placeholder="简要描述项目目标..."
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">
                  将使用默认项目名称，你可以之后在设置中修改
                </div>
              )}

              <div className="mt-4 flex items-center justify-center">
                <button
                  onClick={() => setSkipProject(!skipProject)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {skipProject ? '← 我想设置项目名称' : '跳过，稍后再设置'}
                </button>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  ← 返回
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:bg-indigo-700 transition-colors text-sm"
                >
                  下一步 →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: 完成确认 */}
          {step === 4 && (
            <div className="p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">一切就绪！</h2>
              <p className="text-sm text-gray-400 mb-6">确认你的设置，然后开始使用</p>

              {/* 用户信息预览 */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 mb-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900 text-lg">{name}</div>
                    <div className="text-sm text-gray-500">@{identifier}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                        {ROLES.find(r => r.id === role)?.icon} {ROLES.find(r => r.id === role)?.label}
                      </span>
                    </div>
                  </div>
                </div>
                {description && (
                  <p className="text-xs text-gray-500 mt-3 pl-1">{description}</p>
                )}
              </div>

              {/* 项目信息 */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3.5 mb-6">
                <span className="text-lg">📁</span>
                <div>
                  <div className="text-sm font-medium text-gray-700">
                    {!skipProject && projectName.trim() ? projectName.trim() : '默认项目'}
                  </div>
                  {!skipProject && projectDesc.trim() && (
                    <div className="text-xs text-gray-400 mt-0.5">{projectDesc.trim()}</div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  ← 修改
                </button>
                <button
                  onClick={handleFinish}
                  disabled={submitting}
                  className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-60 text-sm"
                >
                  {submitting ? '正在初始化...' : '进入 ClawPM 🚀'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 底部说明 */}
        <p className="text-center text-xs text-gray-400 mt-4">
          本地工具，数据存储在你的设备上，不上传任何信息
        </p>
      </div>
    </div>
  );
}
