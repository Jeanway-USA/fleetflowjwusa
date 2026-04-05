

## Fix: Demo Controls Tier Switching

### Problem Analysis
The Demo Controls tier-switching buttons likely fail silently because:

1. **Silent RLS failure**: Supabase `.update()` returns `{ data: null, error: null }` when RLS blocks the operation (0 rows matched). The current code only checks `if (error)`, so it proceeds to show a success toast even when nothing was updated.

2. **Same-route navigation**: When clicking "Solo BCO" while already on `/fleet-loads`, `navigate('/fleet-loads')` is a no-op — React Router doesn't re-render the page.

3. **Potential org mismatch**: If the demo user's session was created previously and the org was recreated, the `user_roles.org_id` might not match the `profiles.org_id`, causing `is_owner()` to return false.

### Changes

**1. `src/components/demo/DemoControls.tsx`** — Fix tier switching reliability
- After the `.update()` call, verify rows were actually affected by re-querying the org or using `.select()` on the update.
- Force navigation even if already on the target route by using `navigate(landing, { replace: true })` combined with a key change or `window.location` as a fallback for same-route transitions.
- Add a `window.location.reload()` after navigation if the tier change requires a full sidebar re-render on the same route.

**2. `supabase/functions/demo-login/index.ts`** — Harden org/role consistency
- When the sign-in succeeds on the first attempt (existing user, correct password), still verify that `profiles.org_id` exists and `user_roles` has the correct `org_id`. If not, fix the linkage before returning the session.
- This prevents stale org references from causing RLS failures.

### Technical Details

```typescript
// DemoControls.tsx — verify update worked
const { data, error } = await supabase
  .from('organizations')
  .update({ subscription_tier: tier })
  .eq('id', orgId)
  .select('subscription_tier')
  .single();

if (error || !data) throw new Error('Tier update blocked');

await refreshOrgData();
toast.success(`Switched to ${TIERS.find(t => t.value === tier)?.label} view`);

// Force re-render even on same route
const landing = tier === 'agency' ? '/agency-loads' 
  : tier === 'fleet_owner' ? '/executive-dashboard' 
  : '/fleet-loads';
navigate(landing, { replace: true });
// If same page, force reload
if (window.location.pathname === landing) {
  window.location.reload();
}
```

```typescript
// demo-login/index.ts — add consistency check on successful first sign-in
if (signInData?.session) {
  const userId = signInData.session.user.id;
  // Verify org linkage exists
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", userId)
    .single();
    
  if (!profile?.org_id) {
    // Re-create org and link (same logic as new user setup)
    // ...
  }
  
  return new Response(
    JSON.stringify({ session: signInData.session }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Files
| File | Change |
|------|--------|
| `src/components/demo/DemoControls.tsx` | Verify update succeeded with `.select()`, force reload on same-route navigation |
| `supabase/functions/demo-login/index.ts` | Verify org/role linkage on every successful sign-in, not just on first creation |

