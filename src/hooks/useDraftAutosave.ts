import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Options<T> {
  /** Stable identifier for this form, e.g. 'new-load', 'work-order'. */
  formId: string;
  /** Current form state. */
  value: T;
  /** Whether autosave is active (typically dialog open + dirty). */
  enabled: boolean;
  /** Debounce ms (default 1000). */
  debounceMs?: number;
}

interface Draft<T> {
  value: T;
  savedAt: number;
}

const PREFIX = 'jw-draft';

function keyFor(formId: string, orgId: string | null, userId: string | null) {
  return `${PREFIX}:${formId}:${orgId ?? 'no-org'}:${userId ?? 'anon'}`;
}

export function useDraftAutosave<T>({ formId, value, enabled, debounceMs = 1000 }: Options<T>) {
  const { orgId, user } = useAuth();
  const userId = user?.id ?? null;
  const storageKey = keyFor(formId, orgId, userId);

  const [restored, setRestored] = useState<Draft<T> | null>(null);
  const checkedRef = useRef(false);

  // On enable, check for an existing draft once.
  useEffect(() => {
    if (!enabled || checkedRef.current) return;
    checkedRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Draft<T>;
        if (parsed && typeof parsed.savedAt === 'number') {
          setRestored(parsed);
        }
      }
    } catch { /* ignore */ }
  }, [enabled, storageKey]);

  // Debounced autosave.
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ value, savedAt: Date.now() }));
      } catch { /* quota */ }
    }, debounceMs);
    return () => clearTimeout(t);
  }, [value, enabled, storageKey, debounceMs]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setRestored(null);
    checkedRef.current = true;
  }, [storageKey]);

  const dismissRestore = useCallback(() => setRestored(null), []);

  return { restored, clearDraft, dismissRestore };
}
