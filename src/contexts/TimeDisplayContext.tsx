/**
 * Time-display preference: Company Time vs Local Time.
 *
 * - `mode === 'company'` → render every appointment using the org's
 *   `company_timezone` as the viewer's effective zone.
 * - `mode === 'local'`   → use the browser's resolved IANA zone.
 *
 * Each stop is still always rendered in its OWN zone (08:00 CST); the viewer's
 * effective zone only drives the optional secondary line (06:00 PDT).
 *
 * Persists to `profiles.time_display_pref` for signed-in users and mirrors to
 * localStorage so the first paint after reload uses the right mode before the
 * profile fetch resolves.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getBrowserTimezone } from '@/lib/datetime';

export type TimeDisplayMode = 'company' | 'local';

interface TimeDisplayContextValue {
  mode: TimeDisplayMode;
  setMode: (mode: TimeDisplayMode) => void;
  companyTz: string;
  localTz: string;
  /** The zone the viewer's "effective" time is shown in. */
  viewerTz: string;
}

const TimeDisplayContext = createContext<TimeDisplayContextValue | undefined>(undefined);

const LS_KEY = 'time-display-mode';
const DEFAULT_TZ = 'America/Chicago';

function readInitialMode(): TimeDisplayMode {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === 'local' ? 'local' : 'company';
  } catch {
    return 'company';
  }
}

export function TimeDisplayProvider({ children }: { children: ReactNode }) {
  const { user, orgId } = useAuth();
  const [mode, setModeState] = useState<TimeDisplayMode>(readInitialMode);
  const [companyTz, setCompanyTz] = useState<string>(DEFAULT_TZ);
  const localTz = useMemo(() => getBrowserTimezone(), []);

  // Load org's company_timezone + user's persisted preference
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const { data: org } = await supabase
        .from('organizations')
        .select('company_timezone')
        .eq('id', orgId)
        .maybeSingle();
      if (!cancelled && org?.company_timezone) setCompanyTz(org.company_timezone);

      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('time_display_pref')
          .eq('user_id', user.id)
          .maybeSingle();
        const pref = profile?.time_display_pref;
        if (!cancelled && (pref === 'company' || pref === 'local')) {
          setModeState(pref);
          try { localStorage.setItem(LS_KEY, pref); } catch { /* ignore */ }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, user?.id]);

  const setMode = (next: TimeDisplayMode) => {
    setModeState(next);
    try { localStorage.setItem(LS_KEY, next); } catch { /* ignore */ }
    if (user?.id) {
      void supabase
        .from('profiles')
        .update({ time_display_pref: next })
        .eq('user_id', user.id);
    }
  };

  const value = useMemo<TimeDisplayContextValue>(() => {
    const viewerTz = mode === 'company' ? companyTz : localTz;
    return { mode, setMode, companyTz, localTz, viewerTz };
  }, [mode, companyTz, localTz]);

  return <TimeDisplayContext.Provider value={value}>{children}</TimeDisplayContext.Provider>;
}

export function useTimeDisplay(): TimeDisplayContextValue {
  const ctx = useContext(TimeDisplayContext);
  if (!ctx) {
    // Safe fallback so components used outside the provider (e.g. PublicLoadTracker)
    // still render without crashing.
    const localTz = getBrowserTimezone();
    return {
      mode: 'local',
      setMode: () => undefined,
      companyTz: DEFAULT_TZ,
      localTz,
      viewerTz: localTz,
    };
  }
  return ctx;
}
