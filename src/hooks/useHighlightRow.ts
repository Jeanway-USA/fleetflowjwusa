import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Reads `?highlight=<id>` from the URL and applies a temporary ring to a DOM
 * element with `data-row-id="<id>"`. Clears the query param once applied so
 * refreshes don't re-trigger the animation.
 *
 * Returns the current highlight id (if any) so parent components (e.g. a
 * virtualized DataTable) can scroll it into view.
 */
export function useHighlightRow(): string | null {
  const [params, setParams] = useSearchParams();
  const highlightId = params.get('highlight');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    setActiveId(highlightId);

    // Wait for the row to mount (data may still be loading).
    let cleared = false;
    const applyRing = () => {
      const el = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(highlightId)}"]`);
      if (!el) return false;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.setAttribute('data-highlight', 'true');
      window.setTimeout(() => {
        el.removeAttribute('data-highlight');
        setActiveId(null);
      }, 2500);
      return true;
    };

    if (applyRing()) {
      // Clear the query param so refresh doesn't retrigger.
      const next = new URLSearchParams(params);
      next.delete('highlight');
      setParams(next, { replace: true });
      return;
    }

    // Row not yet mounted — observe DOM until it appears (max ~5s).
    const observer = new MutationObserver(() => {
      if (cleared) return;
      if (applyRing()) {
        cleared = true;
        observer.disconnect();
        const next = new URLSearchParams(params);
        next.delete('highlight');
        setParams(next, { replace: true });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => {
      cleared = true;
      observer.disconnect();
      setActiveId(null);
    }, 5000);

    return () => {
      cleared = true;
      observer.disconnect();
      window.clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  return activeId;
}
