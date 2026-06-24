import { useEffect } from 'react';

interface Options {
  onSubmit?: () => void;
  onCancel?: () => void;
  onSaveDraft?: () => void;
  disabled?: boolean;
  /** When true (default), the handler is bound to document. Set false for scoped use. */
  enabled?: boolean;
}

const isEditable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    el.isContentEditable
  );
};

const isTextarea = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && el.tagName === 'TEXTAREA';

/**
 * Standard form keyboard shortcuts:
 *  - Enter → submit (skipped inside textarea unless ⌘/Ctrl+Enter)
 *  - Esc → cancel
 *  - ⌘/Ctrl+S → save draft (or submit if no draft handler)
 */
export function useFormShortcuts({
  onSubmit,
  onCancel,
  onSaveDraft,
  disabled,
  enabled = true,
}: Options) {
  useEffect(() => {
    if (!enabled || disabled) return;

    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // ⌘/Ctrl+S → save
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        (onSaveDraft ?? onSubmit)?.();
        return;
      }

      // Esc → cancel (only when not inside a native select dropdown)
      if (e.key === 'Escape' && onCancel) {
        // Let Radix dialogs/popovers handle their own Esc first if open
        if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]')) return;
        onCancel();
        return;
      }

      // Enter → submit
      if (e.key === 'Enter' && onSubmit) {
        if (isTextarea(e.target) && !mod) return; // allow newlines
        if (isEditable(e.target) && !mod) {
          // For inputs, default Enter triggers form submit; only intercept if no form
          const form = (e.target as HTMLElement).closest('form');
          if (form) return;
        }
        if (mod || !isEditable(e.target)) {
          e.preventDefault();
          onSubmit();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSubmit, onCancel, onSaveDraft, disabled, enabled]);
}
