import { useCallback, useEffect, useState } from 'react';

export type RecentType = 'load' | 'driver' | 'truck' | 'trailer' | 'contact';

export interface RecentItem {
  type: RecentType;
  id: string;
  label: string;
  href: string;
  ts: number;
}

const KEY = 'jw-recents:v1';
const MAX = 20;

function read(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: RecentItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
    window.dispatchEvent(new CustomEvent('jw:recents-changed'));
  } catch {
    /* ignore quota */
  }
}

export function pushRecent(item: Omit<RecentItem, 'ts'>) {
  if (!item.id || !item.label) return;
  const existing = read().filter((r) => !(r.type === item.type && r.id === item.id));
  write([{ ...item, ts: Date.now() }, ...existing]);
}

export function clearRecents() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent('jw:recents-changed'));
  } catch { /* ignore */ }
}

export function useRecents(limit = 8): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>(() => read());

  useEffect(() => {
    const handler = () => setItems(read());
    window.addEventListener('jw:recents-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('jw:recents-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return items.slice(0, limit);
}

export function useTrackRecent(item: Omit<RecentItem, 'ts'> | null) {
  const stable = useCallback(() => {
    if (item) pushRecent(item);
  }, [item?.type, item?.id, item?.label, item?.href]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    stable();
  }, [stable]);
}
