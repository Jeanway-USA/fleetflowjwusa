## Problem

On the user's mobile browser (in-app/strict-privacy webview), `supabase.channel(...).subscribe()` in `src/hooks/useAuditLogs.ts` throws `WebSocket not available: The operation is insecure.` The throw escapes `useEffect`, bubbles to the nearest `ErrorBoundary`, and crashes the whole page with the red "Something went wrong" screen.

We already have a helper for exactly this: `src/lib/safe-channel.ts` (`safeChannel`) wraps channel creation + subscribe in try/catch and degrades to polling. Other hooks (e.g. dispatcher dashboard) use a local try/catch for the same reason.

## Fix

Single, narrow change in `src/hooks/useAuditLogs.ts`:

1. Replace the realtime `useEffect` body with `safeChannel(...)`:
   ```ts
   useEffect(() => {
     if (!orgId) return;
     return safeChannel(`audit_logs_${orgId}`, (ch) =>
       ch.on(
         'postgres_changes',
         { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: `org_id=eq.${orgId}` },
         () => {
           queryClient.invalidateQueries({ queryKey: ['audit-logs', orgId] });
           queryClient.invalidateQueries({ queryKey: ['audit-logs-metrics', orgId] });
         },
       ),
     );
   }, [orgId, queryClient]);
   ```
2. Add `import { safeChannel } from '@/lib/safe-channel';`.

When websockets are blocked, the audit list still loads from the initial query and the 60s `refetchInterval` on `useAuditMetrics` keeps numbers fresh; live prepend simply becomes a no-op instead of crashing the page.

## Out of scope

- No schema/migration changes.
- No UI changes to the Audit Trail page itself.
- Not auditing every other realtime subscriber in this pass — only the one currently crashing per the runtime error stack.
