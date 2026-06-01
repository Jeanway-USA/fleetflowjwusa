import { supabase } from '@/integrations/supabase/client';

type Channel = ReturnType<typeof supabase.channel>;

let warned = false;

/**
 * Safely creates and subscribes to a Supabase Realtime channel.
 *
 * Some browsers (in-app webviews like Instagram/Facebook/Gmail, Firefox with
 * strict tracking protection, certain private modes) throw a SecurityError
 * ("WebSocket not available: The operation is insecure") when supabase-js
 * tries to open a websocket. That throw bubbles up through React renders into
 * the nearest ErrorBoundary and crashes the section.
 *
 * This helper wraps `supabase.channel(name)` + the user's `build` callback +
 * `.subscribe()` in a try/catch. On failure it logs a single console.warn and
 * returns a no-op cleanup so callers can use it as a drop-in replacement
 * inside useEffect.
 *
 * Usage:
 *   useEffect(() => {
 *     const cleanup = safeChannel('my-channel', (ch) =>
 *       ch.on('postgres_changes', { ... }, handler)
 *     );
 *     return cleanup;
 *   }, [...]);
 */
export function safeChannel(
  name: string,
  build: (channel: Channel) => Channel,
): () => void {
  let channel: Channel | null = null;
  try {
    const base = supabase.channel(name);
    channel = build(base);
    channel.subscribe();
  } catch (err) {
    if (!warned) {
      warned = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[realtime] Live updates unavailable in this browser, falling back to polling.',
        err,
      );
    }
    channel = null;
  }

  return () => {
    if (channel) {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    }
  };
}
