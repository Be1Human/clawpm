export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/** Get the stored locale for non-React contexts */
function getStoredLocale(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('clawpm-locale') : null;
  return stored === 'zh' ? 'zh-CN' : 'en-US';
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(getStoredLocale(), { month: 'short', day: 'numeric' });
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  const isZh = getStoredLocale() === 'zh-CN';
  if (diff < 60) return isZh ? '刚刚' : 'Just now';
  if (diff < 3600) {
    const min = Math.floor(diff / 60);
    return isZh ? `${min} 分钟前` : `${min} min ago`;
  }
  if (diff < 86400) {
    const hrs = Math.floor(diff / 3600);
    return isZh ? `${hrs} 小时前` : `${hrs} hrs ago`;
  }
  const days = Math.floor(diff / 86400);
  return isZh ? `${days} 天前` : `${days} days ago`;
}

export function getDaysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  return Math.floor((d.getTime() - now.getTime()) / 86400000);
}
