import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Wraps supabase.functions.invoke with automatic stale-session recovery.
 *
 * If the edge function returns 401 / "Invalid token" / "session_expired",
 * we sign the user out and bounce them to /auth so they can sign back in
 * cleanly instead of seeing a generic "non-2xx" error.
 */
export async function invokeWithAuth<T = unknown>(
  functionName: string,
  options?: Parameters<typeof supabase.functions.invoke>[1],
): Promise<{ data: T | null; error: Error | null; sessionExpired?: boolean }> {
  const { data, error } = await supabase.functions.invoke(functionName, options);

  if (error) {
    // supabase-js FunctionsHttpError exposes .context.response for the raw Response.
    // Older SDKs only expose error.message. We check both.
    const ctx: any = (error as any).context;
    const status: number | undefined = ctx?.status ?? ctx?.response?.status;
    const message = (error.message || '').toLowerCase();

    let bodyText = '';
    try {
      if (ctx?.response?.clone) {
        bodyText = await ctx.response.clone().text();
      }
    } catch {
      // ignore
    }

    const looksSessionExpired =
      status === 401 ||
      message.includes('invalid token') ||
      message.includes('unauthorized') ||
      message.includes('session_expired') ||
      bodyText.includes('session_expired') ||
      bodyText.includes('Invalid token');

    if (looksSessionExpired) {
      console.warn(`[invokeWithAuth] Session expired calling ${functionName} — signing out.`);
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
      toast.error('Your session expired. Please sign in again to continue.');
      if (typeof window !== 'undefined') {
        window.location.assign('/auth');
      }
      return { data: null, error: new Error('Session expired'), sessionExpired: true };
    }
  }

  return { data: (data as T) ?? null, error: error ? new Error(error.message) : null };
}
