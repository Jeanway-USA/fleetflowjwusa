import { supabase } from '@/integrations/supabase/client';
import { fetchPayBreakdown, type PayBreakdown } from '@/lib/settlement-pay-breakdown';

export interface SettlementDocSettlement {
  id: string;
  org_id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  payment_date: string | null;
  status: string;
  gross_pay: number | null;
  reimbursements: number | null;
  net_pay: number | null;
  ytd_gross?: number | null;
  ytd_reimbursements?: number | null;
  ytd_net?: number | null;
}

export interface SettlementDocDriver {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  landstar_operator_id: string | null;
  pay_type: string | null;
  pay_rate: number | null;
}

export interface SettlementDocOrg {
  name: string | null;
  logo_url: string | null;
  dot_number: string | null;
  mc_number: string | null;
  tms_mode: string | null;
}

export interface SettlementDocItem {
  id: string;
  item_type: string;
  amount: number;
  description: string | null;
  load_id: string | null;
  expense_id: string | null;
}

export interface SettlementYtd {
  gross: number;
  reimbursements: number;
  net: number;
}

export interface SettlementDocumentData {
  settlement: SettlementDocSettlement;
  driver: SettlementDocDriver | null;
  org: SettlementDocOrg | null;
  items: SettlementDocItem[];
  reimbursementItems: SettlementDocItem[];
  breakdown: PayBreakdown;
  ytd: SettlementYtd;
  payrollContact: string;
}

export async function buildSettlementDocumentData(
  settlementId: string,
): Promise<SettlementDocumentData> {
  const { data: settlement, error: sErr } = await supabase
    .from('driver_settlements')
    .select('*')
    .eq('id', settlementId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!settlement) throw new Error('Settlement not found');
  const s = settlement as any;

  const [{ data: driver }, { data: org }, { data: items }, { data: settings }] =
    await Promise.all([
      supabase
        .from('drivers')
        .select(
          'first_name, last_name, email, phone, landstar_operator_id, pay_type, pay_rate',
        )
        .eq('id', s.driver_id)
        .maybeSingle(),
      supabase
        .from('organizations')
        .select('name, logo_url, dot_number, mc_number, tms_mode')
        .eq('id', s.org_id)
        .maybeSingle(),
      supabase
        .from('driver_settlement_items')
        .select('id, item_type, amount, description, load_id, expense_id')
        .eq('settlement_id', settlementId),
      supabase
        .from('company_settings')
        .select('setting_key, setting_value')
        .eq('org_id', s.org_id)
        .in('setting_key', ['payroll_contact']),
    ]);

  const itemRows = (items ?? []) as SettlementDocItem[];
  const reimbursementItems = itemRows.filter((i) => i.item_type === 'reimbursement');

  const breakdown = await fetchPayBreakdown(s, driver as any);

  // YTD aggregate across same calendar year as period_end.
  const year = (s.period_end || '').slice(0, 4);
  let ytd: SettlementYtd = {
    gross: Number(s.ytd_gross ?? 0),
    reimbursements: Number(s.ytd_reimbursements ?? 0),
    net: Number(s.ytd_net ?? 0),
  };
  if (year) {
    const { data: ytdRows } = await supabase
      .from('driver_settlements')
      .select('gross_pay, reimbursements, net_pay, status, period_end')
      .eq('org_id', s.org_id)
      .eq('driver_id', s.driver_id)
      .gte('period_end', `${year}-01-01`)
      .lte('period_end', `${year}-12-31`)
      .in('status', ['approved', 'paid', 'pending_approval']);
    if (ytdRows && ytdRows.length > 0) {
      const agg = ytdRows.reduce(
        (acc, r: any) => {
          acc.gross += Number(r.gross_pay ?? 0);
          acc.reimbursements += Number(r.reimbursements ?? 0);
          acc.net += Number(r.net_pay ?? 0);
          return acc;
        },
        { gross: 0, reimbursements: 0, net: 0 },
      );
      ytd = agg;
    }
  }

  const settingMap = new Map<string, string>(
    (settings ?? []).map((r: any) => [r.setting_key, r.setting_value]),
  );

  return {
    settlement: s as SettlementDocSettlement,
    driver: (driver ?? null) as SettlementDocDriver | null,
    org: (org ?? null) as SettlementDocOrg | null,
    items: itemRows,
    reimbursementItems,
    breakdown,
    ytd,
    payrollContact: settingMap.get('payroll_contact') ?? '',
  };
}

export const CORPORATE_HEADER = {
  name: 'JEANWAY LLC',
  subtitle: 'LANDSTAR BCO',
  address: '4700 DIPLOMACY RD, FORT WORTH, TX 76155-2627',
} as const;

export type SettlementStatusLabel = 'DRAFT' | 'PENDING' | 'APPROVED' | 'PAID';

export function statusLabel(status: string | null | undefined): SettlementStatusLabel {
  const s = (status ?? '').toLowerCase();
  if (s === 'paid') return 'PAID';
  if (s === 'approved') return 'APPROVED';
  if (s === 'pending_approval') return 'PENDING';
  return 'DRAFT';
}

export const LEGAL_DISCLOSURE =
  'This settlement reflects payment for independent contractor services under lease agreement. No federal, state, or local taxes have been withheld. The recipient is responsible for all applicable self-employment and income tax obligations. For payroll inquiries or disputes, please contact your dispatcher or payroll administrator.';
