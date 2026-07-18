export interface RecentVault {
  path: string;
  name: string;
  lastOpenedAt: string;
}

const DATABASE = 'clawpm-client';
const STORE = 'recent-vaults';
const MAX_RECENT = 10;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'path' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开最近仓库数据库'));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('最近仓库操作失败'));
    });
  } finally {
    database.close();
  }
}

export async function listRecentVaults(): Promise<RecentVault[]> {
  const entries = await transact<RecentVault[]>('readonly', store => store.getAll());
  return entries
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
    .slice(0, MAX_RECENT);
}

export async function rememberVault(vault: Omit<RecentVault, 'lastOpenedAt'>): Promise<RecentVault[]> {
  const entry: RecentVault = { ...vault, lastOpenedAt: new Date().toISOString() };
  await transact('readwrite', store => store.put(entry));
  const entries = await listRecentVaults();
  const excess = entries.slice(MAX_RECENT);
  await Promise.all(excess.map(item => transact('readwrite', store => store.delete(item.path))));
  return entries.slice(0, MAX_RECENT);
}

export async function forgetVault(path: string): Promise<void> {
  await transact('readwrite', store => store.delete(path));
}
