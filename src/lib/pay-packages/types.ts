/**
 * Pay packages: pay that is configured, not coded. A package is a named list of components (base pay, bonuses,
 * deductions and so on); each component says how it is worked out. Nothing here holds a rate or a bonus.
 */

export const COMPONENT_TYPES = [
  'base_pay',
  'safety_bonus',
  'performance_bonus',
  'mileage_bonus',
  'detention',
  'accessorial_share',
  'benefit',
  'deduction',
  'advance_recovery',
  'escrow_contribution',
  'custom',
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const CALCULATION_METHODS = [
  'flat_weekly',
  'flat_daily',
  'per_mile',
  'percentage_of_net_revenue',
  'percentage_of_gross',
  'fixed_amount',
  'formula',
  'per_hour',
  'overtime_hour',
] as const;
export type CalculationMethod = (typeof CALCULATION_METHODS)[number];

export const POSITION_TYPES = ['driver', 'dispatcher', 'office', 'other'] as const;
export type PositionType = (typeof POSITION_TYPES)[number];

/** Component types that take money away from the person by default. */
export const DEDUCTION_TYPES: ComponentType[] = ['deduction', 'advance_recovery', 'escrow_contribution'];

export interface PayPackage {
  id: string;
  org_id?: string;
  name: string;
  description: string | null;
  position_type: PositionType | string;
  is_active: boolean;
  effective_start: string | null;
  effective_end: string | null;
  archived_at?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  /** The latest saved version number. */
  version_number?: number;
}

export interface PayComponent {
  id: string;
  package_id?: string;
  component_type: ComponentType;
  label: string;
  calculation_method: CalculationMethod;
  /** The rate, percent or amount. For the formula method the formula is used instead. */
  value: number;
  /** How to read `value`: usd, usd_per_mile, usd_per_day, usd_per_week, or percent. */
  unit: string;
  /** Only used by the formula method. */
  formula?: string | null;
  is_taxable: boolean;
  is_deduction: boolean;
  sort_order: number;
  is_active: boolean;
}

/** What a saved version holds: the package and every component as they were. */
export interface PackageSnapshot {
  package: Pick<PayPackage, 'id' | 'name' | 'description' | 'position_type' | 'is_active' | 'effective_start' | 'effective_end'>;
  components: PayComponent[];
}

export interface PayPackageVersion {
  id: string;
  package_id: string;
  version_number: number;
  snapshot: PackageSnapshot;
  change_note: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface PayPackageAssignment {
  id: string;
  org_id?: string;
  package_id: string;
  driver_id: string | null;
  user_id?: string | null;
  effective_start: string;
  effective_end: string | null;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
}

/** A change to one component, for one settlement period only. */
export interface ComponentOverride {
  component_id: string;
  value?: number;
  formula?: string | null;
  is_active?: boolean;
}

/** A one-off line added for one settlement period only. */
export interface ExtraLine {
  label: string;
  amount: number;
  is_deduction: boolean;
  is_taxable: boolean;
}

export interface PayPackageOverride {
  id: string;
  org_id?: string;
  driver_id: string;
  package_id: string | null;
  period_start: string;
  period_end: string;
  component_overrides: ComponentOverride[];
  extra_lines: ExtraLine[];
  reason: string | null;
  created_by?: string | null;
  created_at?: string;
}

/** What happened in the pay period: the numbers every component draws on. */
export interface PayWeekInput {
  periodStart: string;
  periodEnd: string;
  miles: number;
  /** Everything billed on the loads, before Landstar's cut. */
  grossRevenue: number;
  /** What the truck earned on the loads, after Landstar's cut. */
  netRevenue: number;
  loadCount: number;
  daysWorked: number;
  /** The driver-payable extras on the loads (stop-offs, layover and the like). */
  accessorials: number;
  detentionHours: number;
  detentionPay: number;
  /** Safety incidents in the period, for bonus formulas. */
  incidents: number;
  /** Paid shift hours in the period, straight time (up to 40 a week) and overtime (over 40 a week). Staff on the shift clock only. */
  regularHours?: number;
  overtimeHours?: number;
}

export interface PayLine {
  componentId: string;
  componentType: ComponentType;
  label: string;
  method: CalculationMethod | 'extra';
  amount: number;
  isDeduction: boolean;
  isTaxable: boolean;
  /** Plain-English working: "812 miles at $0.55". */
  detail: string;
  /** Set when a formula could not be worked out; the line is then 0. */
  error?: string;
  sortOrder: number;
}

export interface PayResult {
  lines: PayLine[];
  /** Taxable earnings: what the withholding is worked out on. */
  taxableGross: number;
  /** Earnings that are not taxable (they are paid as reimbursements). */
  nonTaxable: number;
  deductions: number;
  net: number;
  errors: string[];
}

export const EMPTY_WEEK: PayWeekInput = {
  periodStart: '',
  periodEnd: '',
  miles: 0,
  grossRevenue: 0,
  netRevenue: 0,
  loadCount: 0,
  daysWorked: 0,
  accessorials: 0,
  detentionHours: 0,
  detentionPay: 0,
  incidents: 0,
};

export const COMPONENT_LABELS: Record<ComponentType, string> = {
  base_pay: 'Base pay',
  safety_bonus: 'Safety bonus',
  performance_bonus: 'Performance bonus',
  mileage_bonus: 'Mileage bonus',
  detention: 'Detention',
  accessorial_share: 'Share of extra charges',
  benefit: 'Benefit',
  deduction: 'Deduction',
  advance_recovery: 'Advance recovery',
  escrow_contribution: 'Escrow contribution',
  custom: 'Custom',
};

export const METHOD_LABELS: Record<CalculationMethod, string> = {
  flat_weekly: 'Flat amount each week',
  flat_daily: 'Flat amount for each day worked',
  per_mile: 'Rate for each mile',
  percentage_of_net_revenue: 'Percent of what the truck earned',
  percentage_of_gross: 'Percent of everything billed',
  fixed_amount: 'One fixed amount',
  formula: 'Formula',
  per_hour: 'Hourly rate (hours up to 40 a week)',
  overtime_hour: 'Overtime (1.5 times the hourly rate)',
};

/** The unit a value is read in, for each method. */
export const METHOD_UNITS: Record<CalculationMethod, string> = {
  flat_weekly: 'usd_per_week',
  flat_daily: 'usd_per_day',
  per_mile: 'usd_per_mile',
  percentage_of_net_revenue: 'percent',
  percentage_of_gross: 'percent',
  fixed_amount: 'usd',
  formula: 'usd',
  per_hour: 'usd_per_hour',
  overtime_hour: 'usd_per_hour',
};

export const FORMULA_VARIABLES: Array<{ name: string; meaning: string }> = [
  { name: 'miles', meaning: 'Paid miles in the period' },
  { name: 'gross', meaning: 'Everything billed on the loads' },
  { name: 'net', meaning: 'What the truck earned after Landstar' },
  { name: 'loads', meaning: 'Number of loads delivered' },
  { name: 'days', meaning: 'Days worked' },
  { name: 'accessorials', meaning: 'Driver-payable extra charges' },
  { name: 'detention_hours', meaning: 'Detention hours' },
  { name: 'detention_pay', meaning: 'Detention billed' },
  { name: 'incidents', meaning: 'Safety incidents in the period' },
  { name: 'hours', meaning: 'Paid shift hours (straight time plus overtime)' },
  { name: 'regular_hours', meaning: 'Paid shift hours up to 40 a week' },
  { name: 'overtime_hours', meaning: 'Paid shift hours over 40 a week' },
  { name: 'base', meaning: 'Total of the base pay lines above this one' },
  { name: 'earnings', meaning: 'Total of every earning line above this one' },
];
