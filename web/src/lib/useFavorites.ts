import { useState, useCallback } from 'react';

export interface FavoriteItem {
  taskId: string;
  title: string;
  addedAt: number;
}

const STORAGE_KEY = 'clawpm-favorites';

function loadFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFavorites(list: FavoriteItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(loadFavorites);

  const isFavorite = useCallback((taskId: string) => {
    return favorites.some(f => f.taskId === taskId);
  }, [favorites]);

  const toggleFavorite = useCallback((taskId: string, title: string) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.taskId === taskId);
      const next = exists
        ? prev.filter(f => f.taskId !== taskId)
        : [...prev, { taskId, title, addedAt: Date.now() }];
      saveFavorites(next);
      return next;
    });
  }, []);

  const clearFavorites = useCallback(() => {
    setFavorites([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { favorites, isFavorite, toggleFavorite, clearFavorites };
}
