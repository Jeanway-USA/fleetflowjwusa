import { Landmark } from 'lucide-react';
import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';

export function BankDetailsSection() {
  return (
    <PayrollSetupSectionCard
      icon={Landmark}
      title="Bank Details"
      description="Connect and verify the company bank account Gusto will debit for payroll and taxes."
    />
  );
}
