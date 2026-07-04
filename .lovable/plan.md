## Fix: Log super-admin actions everywhere except the Super Admin page itself

### Root cause
`log_audit_event()` currently bails out for any user in `public.super_admins`, so every edit you make (fleet loads, drivers, settlements, etc.) is silently dropped.

### Change

Rewrite `public.log_audit_event()` so it:

1. **Always logs** the change, regardless of whether the actor is a super admin.
2. **Skips only writes to Super Admin-page tables** — those are the internal admin surfaces you don't want noise from:
   - `super_admins`
   - `changelog`
   - `subscription_plans`
   - `promo_codes`
   - `internal_config`
   - `user_feedback`
   - `organizations` (super-admin-only writes)
3. Continues to record `user_role` (including `super_admin`) so the UI can badge or filter those rows.

Everything else — the existing trigger set on ~30 tables, RLS, and the Audit Trail UI — stays as is.

### Files
- 1 new migration: `supabase/migrations/<ts>_audit_log_super_admin_fix.sql` (replaces the function body only; no trigger changes).

Approve and I'll ship it.
