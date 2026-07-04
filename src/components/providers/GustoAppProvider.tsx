import { useEffect, useState, type ReactNode } from 'react';
import { GustoProvider } from '@gusto/embedded-react-sdk';
import { gustoFleetFlowTheme } from '@/lib/gusto/theme';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Wraps the app in Gusto's embedded provider. The SDK issues `/v1/*` REST
 * calls against our `run-w2-payroll` edge function, which proxies them to
 * Gusto using the org's stored company token. We must attach the Supabase
 * session bearer + apikey so the edge function can authenticate the caller.
 */
export function GustoAppProvider({ children }: { children: ReactNode }) {
  const baseUrl = `${SUPABASE_URL}/functions/v1/run-w2-payroll`;
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAccessToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return (
    <GustoProvider
      config={{ baseUrl, headers }}
      theme={gustoFleetFlowTheme}
    >
      {children}
    </GustoProvider>
  );
}
