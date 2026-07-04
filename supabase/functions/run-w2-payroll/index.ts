// Edge function: run-w2-payroll
// Mirrors src/lib/w2-payroll.ts exactly. Do not diverge without updating both.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(
    (a) => origin === a || origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com'),
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

const PERIODS: Record<string, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const round2 = (n: number) => Math.round(n * 100) / 100;

function computeAnnualFit(annualTaxable: number, brackets: Array<{ over: number; base: number; rate: number }>): number {
  if (annualTaxable <= 0 || !brackets?.length) return 0;
  let match = brackets[0];
  for (const b of brackets) {
    if (annualTaxable > b.over) match = b;
    else break;
  }
  return match.base + (annualTaxable - match.over) * match.rate;
}

function calcW2(input: {
  gross: number;
  settings: any;
  w4: { filing_status: string; extra_withholding: number; dependents_amount: number };
  ytd: { ss_wages: number; medicare_wages: number; suta_wages: number };
  stateConfig: { state_code: string; suta_rate: number; suta_wage_base: number; has_state_income_tax: boolean; sit_rate: number };
}) {
  const { settings, w4, ytd, stateConfig } = input;
  const gross = Math.max(0, Number(input.gross) || 0);
  const periods = PERIODS[settings.pay_frequency] ?? 52;
  const annualGross = gross * periods;
  const stdDed = Number(settings.standard_deduction?.[w4.filing_status] ?? 0);
  const annualTaxable = Math.max(0, annualGross - stdDed);
  const brackets = settings.fit_brackets?.[w4.filing_status] ?? [];
  const annualFit = computeAnnualFit(annualTaxable, brackets);
  const annualFitAfterCredits = Math.max(0, annualFit - (Number(w4.dependents_amount) || 0));
  const periodFit = annualFitAfterCredits / periods + (Number(w4.extra_withholding) || 0);
  const federalIncomeTax = round2(Math.max(0, periodFit));

  const ssHead = Math.max(0, Number(settings.social_security_wage_base) - ytd.ss_wages);
  const ssTaxable = Math.min(gross, ssHead);
  const socialSecurityTax = round2(ssTaxable * Number(settings.social_security_rate));
  const employerSsTax = socialSecurityTax;

  const medicareTax = round2(gross * Number(settings.medicare_rate));
  const employerMedicareTax = medicareTax;

  const newMedYtd = ytd.medicare_wages + gross;
  const threshold = Number(settings.additional_medicare_threshold);
  const addlOver = Math.max(0, newMedYtd - threshold);
  const addlDone = Math.max(0, ytd.medicare_wages - threshold);
  const addlBase = Math.max(0, addlOver - addlDone);
  const additionalMedicareTax = round2(addlBase * Number(settings.additional_medicare_rate));

  const stateIncomeTax = stateConfig.has_state_income_tax
    ? round2(gross * (Number(stateConfig.sit_rate) || 0))
    : 0;

  const sutaHead = Math.max(0, Number(stateConfig.suta_wage_base) - ytd.suta_wages);
  const flSutaWageBaseApplied = Math.min(gross, sutaHead);
  const flSutaTax = round2(flSutaWageBaseApplied * Number(stateConfig.suta_rate));

  const employeeTotal = round2(federalIncomeTax + socialSecurityTax + medicareTax + additionalMedicareTax + stateIncomeTax);
  const netPay = round2(gross - employeeTotal);
  const employerFicaTotal = round2(employerSsTax + employerMedicareTax);

  return {
    grossPay: round2(gross),
    federalIncomeTax,
    socialSecurityTax,
    medicareTax,
    additionalMedicareTax,
    stateIncomeTax,
    employeeTotal,
    netPay,
    employerSsTax,
    employerMedicareTax,
    employerFicaTotal,
    flSutaTax,
    flSutaWageBaseApplied: round2(flSutaWageBaseApplied),
    stateCode: stateConfig.state_code,
  };
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    // Permission gate
    const { data: allowed } = await admin.rpc('has_payroll_access', { _user_id: userId });
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { data: orgIdData } = await admin.rpc('get_user_org_id', { _user_id: userId });
    const orgId = orgIdData as string | null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organization' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      period_start,
      period_end,
      payment_date,
      drivers, // [{ driver_id, gross_pay }]
    } = body ?? {};

    if (!period_start || !period_end || !payment_date || !Array.isArray(drivers) || drivers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'period_start, period_end, payment_date and drivers[] are required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      );
    }

    // Load org payroll settings (auto-seed if missing)
    let { data: settings } = await admin
      .from('payroll_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();
    if (!settings) {
      const { data: seeded } = await admin
        .from('payroll_settings')
        .insert({ org_id: orgId })
        .select('*')
        .single();
      settings = seeded;
    }
    if (!settings) throw new Error('Failed to load payroll settings');

    const results: any[] = [];

    for (const row of drivers) {
      const driverId = row.driver_id as string;
      const gross = Number(row.gross_pay) || 0;
      if (!driverId || gross <= 0) continue;

      // Validate driver belongs to org & is W-2
      const { data: driver } = await admin
        .from('drivers')
        .select('id, org_id, employment_type, tax_state')
        .eq('id', driverId)
        .maybeSingle();
      if (!driver || driver.org_id !== orgId) {
        results.push({ driver_id: driverId, error: 'Driver not in organization' });
        continue;
      }
      if (driver.employment_type !== 'w2_company') {
        results.push({ driver_id: driverId, error: 'Driver is not W-2' });
        continue;
      }

      // Resolve tax state: driver -> org default -> FL
      const resolvedState = (driver.tax_state || (settings as any).default_tax_state || 'FL').toUpperCase();

      // Ensure state configs exist for this org, then load the row
      await admin.rpc('seed_state_tax_configurations', { _org_id: orgId });
      let { data: stateRow } = await admin
        .from('state_tax_configurations')
        .select('state_code, suta_rate, suta_wage_base, has_state_income_tax, sit_rate')
        .eq('org_id', orgId)
        .eq('state_code', resolvedState)
        .maybeSingle();
      const stateConfig = stateRow
        ? {
            state_code: stateRow.state_code,
            suta_rate: Number(stateRow.suta_rate),
            suta_wage_base: Number(stateRow.suta_wage_base),
            has_state_income_tax: !!stateRow.has_state_income_tax,
            sit_rate: Number(stateRow.sit_rate),
          }
        : { state_code: resolvedState, suta_rate: 0, suta_wage_base: 0, has_state_income_tax: false, sit_rate: 0 };

      // W-4 (fallback to defaults)
      const { data: w4Row } = await admin
        .from('driver_w4_info')
        .select('filing_status, extra_withholding, dependents_amount')
        .eq('driver_id', driverId)
        .maybeSingle();
      const w4 = {
        filing_status: w4Row?.filing_status ?? 'single',
        extra_withholding: Number(w4Row?.extra_withholding ?? 0),
        dependents_amount: Number(w4Row?.dependents_amount ?? 0),
      };

      // YTD (sum of prior payroll rows in same calendar year, same state for SUTA)
      const year = new Date(period_end).getUTCFullYear();
      const yearStart = `${year}-01-01`;
      const { data: prior } = await admin
        .from('driver_payroll')
        .select('gross_pay, fl_suta_wage_base_applied, tax_state')
        .eq('driver_id', driverId)
        .eq('employment_type', 'w2_company')
        .gte('period_end', yearStart)
        .lte('period_end', period_end);
      const ytd = {
        ss_wages: (prior ?? []).reduce((s, r) => s + Number(r.gross_pay || 0), 0),
        medicare_wages: (prior ?? []).reduce((s, r) => s + Number(r.gross_pay || 0), 0),
        suta_wages: (prior ?? [])
          .filter((r) => !r.tax_state || r.tax_state === resolvedState)
          .reduce((s, r) => s + Number(r.fl_suta_wage_base_applied || 0), 0),
      };

      const b = calcW2({ gross, settings, w4, ytd, stateConfig });

      // Insert immutable payroll row
      const { data: inserted, error: insErr } = await admin
        .from('driver_payroll')
        .insert({
          org_id: orgId,
          driver_id: driverId,
          period_start,
          period_end,
          payment_date,
          gross_pay: b.grossPay,
          net_pay: b.netPay,
          status: 'approved',
          employment_type: 'w2_company',
          federal_income_tax: b.federalIncomeTax,
          social_security_tax: b.socialSecurityTax,
          medicare_tax: b.medicareTax,
          additional_medicare_tax: b.additionalMedicareTax,
          state_income_tax: b.stateIncomeTax,
          tax_state: b.stateCode,
          employer_ss_tax: b.employerSsTax,
          employer_medicare_tax: b.employerMedicareTax,
          employer_fica_total: b.employerFicaTotal,
          fl_suta_tax: b.flSutaTax,
          fl_suta_wage_base_applied: b.flSutaWageBaseApplied,
          filing_status: w4.filing_status,
          w4_extra_withholding: w4.extra_withholding,
          w4_dependents_amount: w4.dependents_amount,
        })
        .select('id')
        .single();

      if (insErr) {
        results.push({ driver_id: driverId, error: insErr.message });
        continue;
      }


      results.push({ driver_id: driverId, payroll_id: inserted!.id, breakdown: b });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
