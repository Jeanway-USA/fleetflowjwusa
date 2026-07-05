import { UserCheck } from 'lucide-react';
import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';

export function SignatorySection() {
  return (
    <PayrollSetupSectionCard
      icon={UserCheck}
      title="Signatory"
      description="Designate and verify the authorized signatory who will sign federal and state payroll forms on the company's behalf."
    />
  );
}
