import { useEffect } from 'react';
import { chooseVault, initializeVaultSession, reopenVault, useVaultSession } from '@/vault/session';
import { isTauriRuntime } from '@/vault/desktop';

export default function VaultGateway({ children }: { children: React.ReactNode }) {
  const session = useVaultSession();

  useEffect(() => {
    void initializeVaultSession();
  }, []);

  if (session.status === 'ready') return <>{children}</>;

  const unavailable = !isTauriRuntime();
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
      <section className="w-full max-w-md border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">ClawPM Vault</p>
        <h1 className="mt-2 text-xl font-semibold">打开本地需求库</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          选择包含 <code>clawpm.json</code> 的目录。ClawPM 只在本机直接读取和写入该目录，不启动本地服务。
        </p>
        {unavailable ? (
          <p className="mt-5 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            浏览器预览无法访问本地 Vault。请使用 <code>pnpm --filter web dev:desktop</code> 启动桌面客户端。
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void chooseVault()}
            className="mt-5 w-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            选择 Vault 目录
          </button>
        )}
        {session.status === 'error' && (
          <p className="mt-4 text-sm text-rose-700">{session.message}</p>
        )}
        {session.recent.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">最近仓库</p>
            <div className="mt-2 space-y-1">
              {session.recent.map(vault => (
                <button
                  type="button"
                  key={vault.path}
                  disabled={unavailable}
                  onClick={() => void reopenVault(vault.path)}
                  className="block w-full border border-slate-200 px-3 py-2 text-left text-sm hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block truncate font-medium">{vault.name}</span>
                  <span className="block truncate text-xs text-slate-500">{vault.path}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
