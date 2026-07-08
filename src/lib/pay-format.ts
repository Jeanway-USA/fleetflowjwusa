export type DriverPayType =
  | 'cpm'
  | 'per_mile' // legacy alias for cpm
  | 'flat'
  | 'percentage'
  | 'hourly'
  | string
  | null
  | undefined;

export function formatPayRate(payType: DriverPayType, payRate: number | null | undefined): string {
  const rate = Number(payRate ?? 0);
  switch (payType) {
    case 'percentage':
      return `${rate}%`;
    case 'cpm':
    case 'per_mile':
      return `$${rate.toFixed(2)}/mile`;
    case 'hourly':
      return `$${rate.toFixed(2)}/hr`;
    case 'flat':
      return `$${rate.toFixed(2)} flat`;
    default:
      return `$${rate.toFixed(2)}`;
  }
}

export function payTypeLabel(payType: DriverPayType): string {
  switch (payType) {
    case 'percentage':
      return 'Percentage of Line-Haul';
    case 'cpm':
    case 'per_mile':
      return 'CPM (Cents per Mile)';
    case 'hourly':
      return 'Hourly (legacy)';
    case 'flat':
      return 'Flat Salary';
    default:
      return '—';
  }
}
