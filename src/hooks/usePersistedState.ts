import { useCallback, useState } from 'react';

/**
 * Like useState, but the value is kept for the browser session, so a search or filter is still there when you open a
 * record and come back, or move to another page and return. It is cleared when the tab is closed, so a filter left on
 * yesterday never hides today's work. Storage being unavailable (private mode) just means it behaves like useState.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `ff:${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.sessionStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          /* storage unavailable: keep going without remembering */
        }
        return resolved;
      });
    },
    [storageKey],
  );

  return [value, set];
}
