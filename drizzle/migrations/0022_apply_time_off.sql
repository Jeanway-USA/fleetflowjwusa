-- Paid sick leave and time off (Oct 2026). Run once through Lovable. Safe to run again.
-- One ledger of hours per person: sick leave earned (1 hour per 40 worked in Washington), sick leave or PTO used, and
-- manual corrections. Balances are worked out from the ledger, so every hour can be traced. Nothing is deleted:
-- an entry that was a mistake is archived and stays on record.

CREATE TABLE IF NOT EXISTS public.time_off_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- The person's login (staff pay is kept by login).
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sick', 'pto', 'holiday')),
  entry_type text NOT NULL CHECK (entry_type IN ('accrual', 'use', 'adjustment')),
  -- Hours added (positive) or taken (negative).
  hours numeric NOT NULL,
  -- The day the leave was taken or the pay period the hours were earned in.
  effective_date date NOT NULL,
  -- For an accrual: the pay statement that earned it.
  source_id uuid,
  note text,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_off_entries_user_idx ON public.time_off_entries (org_id, user_id, kind);
-- A pay statement earns sick leave once, however many times it is made again.
CREATE UNIQUE INDEX IF NOT EXISTS time_off_one_accrual_per_statement
  ON public.time_off_entries (user_id, kind, source_id) WHERE entry_type = 'accrual' AND source_id IS NOT NULL AND archived_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.time_off_entries TO authenticated;
GRANT ALL ON public.time_off_entries TO service_role;
ALTER TABLE public.time_off_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_off_select ON public.time_off_entries;
CREATE POLICY time_off_select ON public.time_off_entries FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_payroll_access(auth.uid()) OR user_id = auth.uid()));
DROP POLICY IF EXISTS time_off_insert ON public.time_off_entries;
CREATE POLICY time_off_insert ON public.time_off_entries FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
-- New hires must be reported to the state within 20 days. This records that it was done.
CREATE TABLE IF NOT EXISTS public.new_hire_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payee_key text NOT NULL,
  reported_on date NOT NULL,
  reported_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, payee_key)
);
GRANT SELECT, INSERT ON public.new_hire_reports TO authenticated;
GRANT ALL ON public.new_hire_reports TO service_role;
ALTER TABLE public.new_hire_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS new_hire_reports_select ON public.new_hire_reports;
CREATE POLICY new_hire_reports_select ON public.new_hire_reports FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
DROP POLICY IF EXISTS new_hire_reports_insert ON public.new_hire_reports;
CREATE POLICY new_hire_reports_insert ON public.new_hire_reports FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

DROP POLICY IF EXISTS time_off_update ON public.time_off_entries;
CREATE POLICY time_off_update ON public.time_off_entries FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));