import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePersistedState } from '@/hooks/usePersistedState';

describe('usePersistedState', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('starts with the initial value and remembers changes for the next visit', () => {
    const first = renderHook(() => usePersistedState('page.status', 'all'));
    expect(first.result.current[0]).toBe('all');
    act(() => first.result.current[1]('delivered'));
    expect(first.result.current[0]).toBe('delivered');
    first.unmount();

    const second = renderHook(() => usePersistedState('page.status', 'all'));
    expect(second.result.current[0]).toBe('delivered');
  });

  it('keeps different pages separate and accepts an updater function', () => {
    const a = renderHook(() => usePersistedState('a.count', 1));
    const b = renderHook(() => usePersistedState('b.count', 10));
    act(() => a.result.current[1]((n) => n + 1));
    expect(a.result.current[0]).toBe(2);
    expect(b.result.current[0]).toBe(10);
  });

  it('falls back to the initial value if storage holds something unreadable', () => {
    window.sessionStorage.setItem('ff:bad', '{not json');
    const r = renderHook(() => usePersistedState('bad', 'fallback'));
    expect(r.result.current[0]).toBe('fallback');
  });
});
