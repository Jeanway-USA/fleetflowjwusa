import { StatStrip } from '@/components/shared/StatStrip';
import type { UnifiedContact } from '@/hooks/useCRMData';

interface CRMSummaryCardsProps {
  contacts: UnifiedContact[];
}

const TYPES: Array<[string, string]> = [
  ['broker', 'Brokers'],
  ['agent', 'Agents'],
  ['shipper', 'Shippers'],
  ['receiver', 'Receivers'],
  ['vendor', 'Vendors'],
];

export function CRMSummaryCards({ contacts }: CRMSummaryCardsProps) {
  const counts = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.contact_type] = (acc[c.contact_type] || 0) + 1;
    return acc;
  }, {});
  const totalActive = contacts.filter((c) => c.is_active).length;

  return <StatStrip cells={[{ label: 'Total active', value: totalActive }, ...TYPES.map(([type, label]) => ({ label, value: counts[type] || 0 }))]} />;
}
