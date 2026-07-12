
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ein text,
  ADD COLUMN IF NOT EXISTS business_address_line1 text,
  ADD COLUMN IF NOT EXISTS business_address_line2 text,
  ADD COLUMN IF NOT EXISTS business_city text,
  ADD COLUMN IF NOT EXISTS business_state text,
  ADD COLUMN IF NOT EXISTS business_zip text;

ALTER TABLE public.state_tax_configurations
  ADD COLUMN IF NOT EXISTS suta_account_number text,
  ADD COLUMN IF NOT EXISTS sit_account_number text,
  ADD COLUMN IF NOT EXISTS deposit_frequency text,
  ADD COLUMN IF NOT EXISTS agency_notes text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'state_tax_configurations_deposit_frequency_check') THEN
    ALTER TABLE public.state_tax_configurations
      ADD CONSTRAINT state_tax_configurations_deposit_frequency_check
      CHECK (deposit_frequency IS NULL OR deposit_frequency IN ('monthly','quarterly','annual','semiweekly'));
  END IF;
END $$;

ALTER TABLE public.tax_withholding_ledger
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS state_suta numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_sit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_medicare numeric NOT NULL DEFAULT 0;

UPDATE public.tax_withholding_ledger
   SET state_suta = COALESCE(state_suta,0) + COALESCE(tx_twc_unemployment,0) + COALESCE(fl_reemployment,0)
 WHERE (COALESCE(tx_twc_unemployment,0) + COALESCE(fl_reemployment,0)) > 0
   AND COALESCE(state_suta,0) = 0;

UPDATE public.tax_withholding_ledger t
   SET state_code = COALESCE(
        t.state_code,
        (SELECT UPPER(d.tax_state) FROM public.internal_payroll_ledger l
          JOIN public.drivers d ON d.id = l.driver_id
         WHERE l.id = t.ledger_id))
 WHERE t.state_code IS NULL;

ALTER TABLE public.tax_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_documents_document_type_check') THEN
    ALTER TABLE public.tax_documents
      ADD CONSTRAINT tax_documents_document_type_check
      CHECK (document_type IN ('w2','1099_nec','1099_misc','w4','w9','other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tax_documents_status_check') THEN
    ALTER TABLE public.tax_documents
      ADD CONSTRAINT tax_documents_status_check
      CHECK (status IN ('draft','issued','void'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_w2_totals(_year int)
RETURNS TABLE (
  driver_id uuid,
  first_name text,
  last_name text,
  tax_state text,
  wages_box1 numeric,
  fit_box2 numeric,
  ss_wages_box3 numeric,
  ss_tax_box4 numeric,
  medicare_wages_box5 numeric,
  medicare_tax_box6 numeric,
  state_wages_box16 numeric,
  state_tax_box17 numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(),'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  _org := public.get_user_org_id(auth.uid());

  RETURN QUERY
  SELECT
    d.id,
    d.first_name,
    d.last_name,
    UPPER(COALESCE(d.tax_state,'')) AS tax_state,
    ROUND(COALESCE(SUM(l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0)),0),2) AS wages_box1,
    ROUND(COALESCE(SUM(w.federal_income_withholding),0),2) AS fit_box2,
    ROUND(COALESCE(SUM(l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0)),0),2) AS ss_wages_box3,
    ROUND(COALESCE(SUM(w.ee_social_security),0),2) AS ss_tax_box4,
    ROUND(COALESCE(SUM(l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0)),0),2) AS medicare_wages_box5,
    ROUND(COALESCE(SUM(w.ee_medicare + COALESCE(w.additional_medicare,0)),0),2) AS medicare_tax_box6,
    ROUND(COALESCE(SUM(CASE WHEN COALESCE(w.state_sit,0) > 0 THEN l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0) ELSE 0 END),0),2) AS state_wages_box16,
    ROUND(COALESCE(SUM(w.state_sit),0),2) AS state_tax_box17
  FROM public.drivers d
  LEFT JOIN public.internal_payroll_ledger l
    ON l.driver_id = d.id
   AND l.org_id = _org
   AND l.status = 'finalized'
   AND EXTRACT(YEAR FROM l.period_end) = _year
  LEFT JOIN public.tax_withholding_ledger w
    ON w.ledger_id = l.id
   AND w.org_id = _org
  WHERE d.org_id = _org
    AND COALESCE(d.employment_type::text,'W2') IN ('W2','w2')
  GROUP BY d.id, d.first_name, d.last_name, d.tax_state
  HAVING COALESCE(SUM(l.gross_taxable_pay),0) > 0
  ORDER BY d.last_name, d.first_name;
END $$;

GRANT EXECUTE ON FUNCTION public.get_w2_totals(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_1099_totals(_year int)
RETURNS TABLE (
  driver_id uuid,
  first_name text,
  last_name text,
  tax_state text,
  legal_name text,
  business_name text,
  tin_last4 text,
  address text,
  nonemployee_comp_box1 numeric,
  fed_tax_withheld_box4 numeric,
  state_tax_withheld_box5 numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_owner(auth.uid()) OR public.has_role(auth.uid(),'payroll_admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  _org := public.get_user_org_id(auth.uid());

  RETURN QUERY
  SELECT
    d.id,
    d.first_name,
    d.last_name,
    UPPER(COALESCE(d.tax_state,'')) AS tax_state,
    w9.legal_name,
    w9.business_name,
    w9.tin_last4,
    w9.address,
    ROUND(COALESCE(SUM(s.gross_pay - COALESCE(s.reimbursements,0)),0),2) AS nonemployee_comp_box1,
    ROUND(COALESCE(SUM(s.tax_withholding),0),2) AS fed_tax_withheld_box4,
    0::numeric AS state_tax_withheld_box5
  FROM public.drivers d
  LEFT JOIN public.driver_settlements s
    ON s.driver_id = d.id
   AND s.org_id = _org
   AND s.status IN ('approved','paid')
   AND EXTRACT(YEAR FROM COALESCE(s.payment_date, s.period_end)) = _year
  LEFT JOIN public.driver_w9_info w9
    ON w9.driver_id = d.id
   AND w9.org_id = _org
  WHERE d.org_id = _org
    AND COALESCE(d.employment_type::text,'') IN ('1099','contractor','independent_contractor')
  GROUP BY d.id, d.first_name, d.last_name, d.tax_state,
           w9.legal_name, w9.business_name, w9.tin_last4, w9.address
  ORDER BY d.last_name, d.first_name;
END $$;

GRANT EXECUTE ON FUNCTION public.get_1099_totals(int) TO authenticated;
