import { useEffect, type ReactNode } from 'react';
import { chooseVault, initializeVaultSession, reopenVault, useVaultSession } from '@/vault/session';
import { isElectronRuntime } from '@/vault/desktop';

export default function VaultGateway({ children }: { children: ReactNode }) {
  const session = useVaultSession();
  const desktop = isElectronRuntime();

  useEffect(() => {
    if (desktop) void initializeVaultSession();
  }, [desktop]);

  if (!desktop || session.status === 'ready') return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f7] p-6 text-gray-900">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">ClawPM</p>
        <h1 className="mt-2 text-xl font-semibold text-gray-900">打开或初始化 Git 工程</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          选择 Git 工程根目录。已有项目会打开 <code>.clawpm</code>；尚未创建时会让你确认初始化。
        </p>
        <button
          type="button"
          onClick={() => void chooseVault()}
          className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          打开或初始化 Git 工程
        </button>
        {session.status === 'error' && <p className="mt-4 text-sm text-rose-600">{session.message}</p>}
        {session.recent.length > 0 && (
          <div className="mt-6 border-t border-gray-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">最近项目</p>
            <div className="mt-2 space-y-1.5">
              {session.recent.map(vault => (
                <button
                  type="button"
                  key={vault.path}
                  onClick={() => void reopenVault(vault.path)}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <span className="block truncate font-medium text-gray-800">{vault.name}</span>
                  <span className="block truncate text-xs text-gray-400">{vault.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
