DROP FUNCTION IF EXISTS public.get_w2_totals(integer);

CREATE OR REPLACE FUNCTION public.get_w2_totals(_year integer)
RETURNS TABLE(
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
  state_tax_box17 numeric,
  has_w4 boolean,
  has_state_tax boolean,
  has_i9 boolean,
  i9_address text,
  i9_full_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    ROUND(COALESCE(SUM(l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0)),0),2),
    ROUND(COALESCE(SUM(w.federal_income_withholding),0),2),
    ROUND(COALESCE(SUM(l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0)),0),2),
    ROUND(COALESCE(SUM(w.ee_social_security),0),2),
    ROUND(COALESCE(SUM(l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0)),0),2),
    ROUND(COALESCE(SUM(w.ee_medicare + COALESCE(w.additional_medicare,0)),0),2),
    ROUND(COALESCE(SUM(CASE WHEN COALESCE(w.state_sit,0) > 0 THEN l.gross_taxable_pay + COALESCE(l.one_time_bonus,0) - COALESCE(l.one_time_deduction,0) ELSE 0 END),0),2),
    ROUND(COALESCE(SUM(w.state_sit),0),2),
    (MAX(w4.id::text) IS NOT NULL),
    (MAX(st.id::text) IS NOT NULL),
    (MAX(i9.id::text) IS NOT NULL),
    MAX(i9.address),
    MAX(i9.full_name)
  FROM public.drivers d
  LEFT JOIN public.internal_payroll_ledger l
    ON l.driver_id = d.id AND l.org_id = _org AND l.status = 'finalized'
   AND EXTRACT(YEAR FROM l.period_end) = _year
  LEFT JOIN public.tax_withholding_ledger w
    ON w.ledger_id = l.id AND w.org_id = _org
  LEFT JOIN public.driver_w4_info w4
    ON w4.driver_id = d.id AND w4.org_id = _org
  LEFT JOIN public.driver_state_tax_info st
    ON st.driver_id = d.id AND st.org_id = _org
  LEFT JOIN public.driver_i9_info i9
    ON i9.driver_id = d.id AND i9.org_id = _org
  WHERE d.org_id = _org
    AND COALESCE(d.employment_type::text,'w2_company') IN ('w2_company','W2','w2')
  GROUP BY d.id, d.first_name, d.last_name, d.tax_state
  HAVING COALESCE(SUM(l.gross_taxable_pay),0) > 0
  ORDER BY d.last_name, d.first_name;
END $$;

GRANT EXECUTE ON FUNCTION public.get_w2_totals(int) TO authenticated;