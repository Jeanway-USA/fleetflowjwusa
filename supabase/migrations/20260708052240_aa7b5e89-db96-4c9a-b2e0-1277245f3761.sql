
CREATE TABLE public.tax_filing_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  form_key text NOT NULL,
  confirmation_reference text NOT NULL,
  filed_on date NOT NULL,
  filed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, form_key)
);

GRANT SELECT, INSERT ON public.tax_filing_completions TO authenticated;
GRANT ALL ON public.tax_filing_completions TO service_role;

ALTER TABLE public.tax_filing_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payroll admins can view org filings"
  ON public.tax_filing_completions FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));

CREATE POLICY "Payroll admins can add filings"
  ON public.tax_filing_completions FOR INSERT
  TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_payroll_access(auth.uid()));
