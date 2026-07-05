import { Percent } from 'lucide-react';
import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';

export function TaxSetupSection() {
  return (
    <PayrollSetupSectionCard
      icon={Percent}
      title="Tax Setup"
      description="Provide federal and state tax IDs, deposit schedules, and unemployment rates so Gusto can file and remit payroll taxes."
    />
  );
}
