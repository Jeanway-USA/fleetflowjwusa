import { Building2 } from 'lucide-react';
import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';

export function CompanyIndustrySection() {
  return (
    <PayrollSetupSectionCard
      icon={Building2}
      title="Company & Industry"
      description="Confirm your legal company details, addresses, and NAICS industry classification. Gusto requires these before running payroll."
    />
  );
}
