/**
 * Fixed Overhead Matrix
 * -----------------------------------------------------------
 * Baseline monthly fixed costs the fleet carries whether the
 * trucks roll or not. Edit values here to tune the Cost-Per-Day
 * runway model surfaced in the P&L Summary tab.
 *
 * Values are in USD per month. This is intentionally a typed
 * constant (no DB migration) so it can be lifted into a settings
 * UI later without churn.
 */

export type FixedOverheadCategory =
  | 'insurance'
  | 'communications'
  | 'equipment'
  | 'labor';

export interface FixedOverheadEntry {
  id: string;
  label: string;
  category: FixedOverheadCategory;
  monthlyAmount: number;
  notes?: string;
}

export const FIXED_OVERHEAD_MATRIX: FixedOverheadEntry[] = [
  {
    id: 'unladen-liability',
    label: 'Unladen (Bobtail) Liability',
    category: 'insurance',
    monthlyAmount: 450,
    notes: 'Non-trucking liability while not under dispatch',
  },
  {
    id: 'communications',
    label: 'Communications (ELD / Phones / Dispatch SaaS)',
    category: 'communications',
    monthlyAmount: 375,
  },
  {
    id: 'physical-damage',
    label: 'Physical Damage Insurance',
    category: 'insurance',
    monthlyAmount: 1200,
    notes: 'Per-tractor coverage — adjust as fleet scales',
  },
  {
    id: 'vehicle-lease',
    label: 'Vehicle Lease Payments',
    category: 'equipment',
    monthlyAmount: 3200,
  },
  {
    id: 'baseline-driver-salary',
    label: 'Baseline Driver Salary Profile',
    category: 'labor',
    monthlyAmount: 5200,
    notes: 'Guaranteed W-2 minimums / base draw',
  },
];

export const sumFixedOverhead = (entries: FixedOverheadEntry[] = FIXED_OVERHEAD_MATRIX): number =>
  entries.reduce((acc, e) => acc + (Number(e.monthlyAmount) || 0), 0);

export const TOTAL_FIXED_OVERHEAD_MONTHLY = sumFixedOverhead(FIXED_OVERHEAD_MATRIX);
