/**
 * What FleetFlow knows about each state's payroll taxes, one entry per state, kept in code so it is versioned,
 * tested and easy to read. Nothing here is guessed: a figure is either a published 2026 number with its source,
 * or it is left blank and the Tax Hub says so ("enter your own rate", "calculate this by hand").
 *
 * Sources (read October 2026):
 *  - SUI taxable wage bases: EY Tax News, "2026 state unemployment insurance taxable wage bases" (table as of Jan 5, 2026).
 *  - New-employer SUI rates: Eddy, "2026 New Employer Rates and SUI Wage Base Limits" (as of Dec 29, 2025).
 *  - Texas: Texas Workforce Commission (entry-level rate 2.70% for all groups in 2026, wage base $9,000).
 *  - Washington: Employment Security Department (Paid Family & Medical Leave premium 1.13% in 2026, 71.43% employee
 *    and 28.57% employer, on wages up to the Social Security wage base).
 *  - IRS General Instructions for Forms W-2 and W-3 (2026): state PFML employee contributions are withheld after
 *    tax and stay inside wages.
 *
 * A state's real SUI rate is set by its agency in a letter to the employer. The new-employer rate here is only what a
 * new employer is assigned until that letter arrives, so the hub marks it "assumed" until the owner enters the letter's rate.
 */

export type SitMethod = 'none' | 'manual';

export interface StateProgram {
  key: string;
  label: string;
  /** 'automated' programs are calculated on every paycheck; 'manual' ones exist but must be handled by hand. */
  status: 'automated' | 'manual';
  note: string;
}

export interface StateInfo {
  code: string;
  name: string;
  /** 2026 SUI taxable wage base per employee. */
  suiWageBase: number;
  /** Rate a brand-new employer is assigned (decimal). Null when it depends on industry or the state has not set it. */
  newEmployerRate: number | null;
  /** True when sources disagreed on the wage base: confirm with the state. */
  confirmWageBase?: boolean;
  /** How state income tax is withheld. 'none' = the state has no wage income tax. 'manual' = not automated yet. */
  sit: SitMethod;
  programs: StateProgram[];
  /** Short plain-English note shown on the state's page. */
  note?: string;
}

type Row = [code: string, name: string, wageBase: number, newRate: number | null, noIncomeTax?: true, confirm?: true];

const ROWS: Row[] = [
  ['AL', 'Alabama', 8000, 0.027],
  ['AK', 'Alaska', 54200, 0.01, true],
  ['AZ', 'Arizona', 8000, 0.02],
  ['AR', 'Arkansas', 7000, 0.02],
  ['CA', 'California', 7000, 0.034],
  ['CO', 'Colorado', 30600, 0.0305],
  ['CT', 'Connecticut', 27000, 0.019],
  ['DE', 'Delaware', 14500, 0.01],
  ['DC', 'District of Columbia', 9000, null],
  ['FL', 'Florida', 7000, 0.027, true],
  ['GA', 'Georgia', 9500, 0.027],
  ['HI', 'Hawaii', 64500, 0.024],
  ['ID', 'Idaho', 58300, 0.01],
  ['IL', 'Illinois', 14250, 0.0335],
  ['IN', 'Indiana', 9500, 0.025],
  ['IA', 'Iowa', 20400, 0.01],
  ['KS', 'Kansas', 15100, 0.0175],
  ['KY', 'Kentucky', 12000, 0.027],
  ['LA', 'Louisiana', 7000, null],
  ['ME', 'Maine', 12000, 0.0254],
  ['MD', 'Maryland', 8500, 0.026],
  ['MA', 'Massachusetts', 15000, 0.0242],
  ['MI', 'Michigan', 9000, 0.027],
  ['MN', 'Minnesota', 44000, null],
  ['MS', 'Mississippi', 14000, 0.01],
  ['MO', 'Missouri', 9000, 0.02376],
  ['MT', 'Montana', 47300, null],
  ['NE', 'Nebraska', 9000, 0.0125],
  ['NV', 'Nevada', 43700, 0.0295, true],
  ['NH', 'New Hampshire', 14000, 0.017, true],
  ['NJ', 'New Jersey', 44800, 0.028],
  ['NM', 'New Mexico', 34800, null, undefined, true],
  ['NY', 'New York', 17600, 0.041],
  ['NC', 'North Carolina', 34200, 0.01],
  ['ND', 'North Dakota', 46600, 0.01],
  ['OH', 'Ohio', 9000, 0.0285],
  ['OK', 'Oklahoma', 25000, 0.015],
  ['OR', 'Oregon', 56700, 0.024],
  ['PA', 'Pennsylvania', 10000, 0.03822],
  ['RI', 'Rhode Island', 30800, 0.0121],
  ['SC', 'South Carolina', 14000, 0.0106],
  ['SD', 'South Dakota', 15000, 0.012, true],
  ['TN', 'Tennessee', 7000, 0.027, true, true],
  ['TX', 'Texas', 9000, 0.027, true],
  ['UT', 'Utah', 50700, 0.012],
  ['VT', 'Vermont', 15400, 0.01],
  ['VA', 'Virginia', 8000, 0.025],
  ['WA', 'Washington', 78200, null, true],
  ['WV', 'West Virginia', 9500, 0.027],
  ['WI', 'Wisconsin', 14000, 0.0305],
  ['WY', 'Wyoming', 33800, 0.0169, true],
];

const manual = (key: string, label: string, note: string): StateProgram => ({ key, label, status: 'manual', note });

/** Programs that exist in a state but are not calculated yet. Listed so nobody is surprised by them. */
const PROGRAMS: Record<string, StateProgram[]> = {
  WA: [
    { key: 'wa_pfml', label: 'Paid Family & Medical Leave (PFML)', status: 'automated', note: 'Premium 1.13% of wages up to the Social Security wage base; employees pay 71.43% and employers 28.57%. Employers with fewer than 50 employees do not pay the employer share but must still collect the employee share.' },
    { key: 'wa_cares', label: 'WA Cares Fund (long-term care)', status: 'automated', note: 'Employee-paid 0.58% of all wages, no wage cap. An employee with an approved exemption from the state pays nothing.' },
    manual('wa_li', 'L&I workers\' compensation', 'Charged by the hour worked, shared by employer and employee. Report hours each quarter to the Department of Labor & Industries.'),
  ],
  CA: [manual('ca_sdi', 'State Disability Insurance (SDI)', 'Employee-paid payroll tax on all wages.')],
  NJ: [manual('nj_ee', 'Employee unemployment, disability and family leave', 'Employees pay several small payroll taxes (for example 0.3825% for unemployment on wages up to $44,800).')],
  NY: [manual('ny_sdi', 'Disability (DBL) and Paid Family Leave', 'Employee contributions are withheld from pay.')],
  RI: [manual('ri_tdi', 'Temporary Disability Insurance (TDI)', 'Employee-paid payroll tax.')],
  HI: [manual('hi_tdi', 'Temporary Disability Insurance (TDI)', 'Shared by employer and employee.')],
  OR: [manual('or_pl', 'Paid Leave Oregon and Workers\' Benefit Fund', 'Employee and employer contributions apply.')],
  CO: [manual('co_famli', 'Colorado FAMLI', 'Premiums shared by employer and employee.')],
  CT: [manual('ct_pfml', 'Connecticut Paid Leave', 'Employee-paid payroll tax.')],
  MA: [manual('ma_pfml', 'Massachusetts Paid Family and Medical Leave', 'Employer and employee contributions apply.')],
  DE: [manual('de_pfml', 'Delaware Paid Leave', 'Premiums shared by employer and employee.')],
  MN: [manual('mn_pfml', 'Minnesota Paid Leave', 'Premiums shared by employer and employee.')],
  ME: [manual('me_pfml', 'Maine Paid Family and Medical Leave', 'Premiums shared by employer and employee.')],
  MD: [manual('md_famli', 'Maryland FAMLI', 'Contributions are scheduled by the state; check its start date.')],
  AK: [manual('ak_ui_ee', 'Employee unemployment contribution', 'Employees pay 0.50% on wages up to $54,200.')],
  PA: [manual('pa_ui_ee', 'Employee unemployment contribution', 'Employees pay 0.07% on all wages. Local earned income taxes may also apply.')],
};

export const STATE_INFO: Record<string, StateInfo> = Object.fromEntries(
  ROWS.map(([code, name, wageBase, newRate, none, confirm]): [string, StateInfo] => [
    code,
    {
      code,
      name,
      suiWageBase: wageBase,
      newEmployerRate: newRate,
      confirmWageBase: confirm,
      sit: none ? 'none' : 'manual',
      programs: PROGRAMS[code] ?? [],
    },
  ]),
);

STATE_INFO.TX.note = 'Texas has no state income tax. Employers pay unemployment tax to the Texas Workforce Commission (new-employer rate 2.70% in 2026, on the first $9,000 of each employee\'s pay).';
STATE_INFO.WA.note = 'Washington has no wage income tax. It has its own paid leave and long-term care payroll taxes and charges workers\' compensation by the hour. New-employer unemployment rates depend on the industry, so enter the rate on your Employment Security Department notice.';
STATE_INFO.NH.note = 'New Hampshire does not tax wages.';
STATE_INFO.TN.note = 'Sources disagreed on the 2026 wage base (7,000 or 9,000). Confirm with Tennessee Department of Labor.';
STATE_INFO.NM.note = 'Sources disagreed on the 2026 wage base. Confirm with New Mexico Department of Workforce Solutions.';

/** Washington's 2026 payroll programs (Employment Security Department). */
export const WA_2026 = {
  pfmlTotalRate: 0.0113,
  pfmlEmployeeShare: 0.7143,
  caresRate: 0.0058,
  /** Employers with fewer than this many employees do not pay the employer share of PFML. */
  employerShareMinHeadcount: 50,
};

export const STATE_CODES = Object.keys(STATE_INFO).sort();

export function stateInfo(code: string | null | undefined): StateInfo | null {
  return code ? STATE_INFO[code.trim().toUpperCase()] ?? null : null;
}

/** The pieces of a state's setup the engine needs, with where each figure came from. */
export interface ResolvedState {
  code: string;
  name: string;
  sutaRate: number;
  /** True when the rate is the new-employer default, not one the owner has entered from the state's letter. */
  rateAssumed: boolean;
  /** True when no rate is known at all (industry-based): unemployment tax is not being accrued. */
  rateMissing: boolean;
  sutaWageBase: number;
  sit: SitMethod;
  hasStateIncomeTax: boolean;
  /** The owner's flat estimate for a state whose withholding is not automated. Marked as an estimate everywhere. */
  sitEstimateRate: number;
  programs: StateProgram[];
}

/**
 * Combines the built-in state facts with what the owner saved for the org. The wage base is always the published one
 * (it is law, not a choice). The rate is the owner's when they entered one, otherwise the new-employer rate.
 */
export function resolveState(code: string, saved?: { suta_rate?: number | null; has_state_income_tax?: boolean | null; sit_rate?: number | null } | null): ResolvedState | null {
  const info = stateInfo(code);
  if (!info) return null;
  const savedRate = Number(saved?.suta_rate) || 0;
  const rate = savedRate > 0 ? savedRate : info.newEmployerRate ?? 0;
  return {
    code: info.code,
    name: info.name,
    sutaRate: rate,
    // A saved rate equal to the new-employer rate is most likely the starting value the system saved, not a rate the state assigned.
    rateAssumed: savedRate <= 0 || (info.newEmployerRate != null && Math.abs(savedRate - info.newEmployerRate) < 1e-9),
    rateMissing: rate <= 0,
    sutaWageBase: info.suiWageBase,
    sit: info.sit,
    hasStateIncomeTax: info.sit !== 'none',
    sitEstimateRate: info.sit === 'none' ? 0 : Number(saved?.sit_rate) || 0,
    programs: info.programs,
  };
}
