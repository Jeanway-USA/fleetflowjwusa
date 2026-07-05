import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useIsMobile } from '@/hooks/use-mobile';
import { PayrollBlockerBadge } from '@/components/payroll/setup/PayrollBlockerBadge';
import { CompanyIndustrySection } from '@/components/payroll/setup/sections/CompanyIndustrySection';
import { SignatorySection } from '@/components/payroll/setup/sections/SignatorySection';
import { CompanyFinancialSetup } from '@/components/payroll/CompanyFinancialSetup';
import { Building2, Landmark, UserCheck } from 'lucide-react';

const SECTIONS = [
  { id: 'company', label: 'Company & Industry', icon: Building2, Component: CompanyIndustrySection },
  { id: 'signatory', label: 'Signatory', icon: UserCheck, Component: SignatorySection },
  { id: 'financial', label: 'Financial Setup', icon: Landmark, Component: CompanyFinancialSetup },
] as const;

export default function PayrollSetup() {
  const isMobile = useIsMobile();

  // Placeholder — wire to Gusto onboarding-status endpoint in a follow-up.
  const blockerCount: number | null = null;
  const isLoading = false;

  return (
    <div className="container mx-auto max-w-5xl p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Payroll Setup"
          description="Clear the items below before running W-2 payroll through Gusto."
        />
        <div className="sm:pt-1">
          <PayrollBlockerBadge count={blockerCount} isLoading={isLoading} />
        </div>
      </div>

      <div className="mt-6">
        {isMobile ? (
          <Accordion type="single" collapsible defaultValue={SECTIONS[0].id} className="space-y-3">
            {SECTIONS.map(({ id, label, icon: Icon, Component }) => (
              <AccordionItem
                key={id}
                value={id}
                className="rounded-lg border border-border bg-card px-4"
              >
                <AccordionTrigger className="py-3 text-left hover:no-underline">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-primary" />
                    {label}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-1">
                  <Component />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Tabs defaultValue={SECTIONS[0].id} className="w-full">
            <div className="-mx-1 overflow-x-auto pb-1">
              <TabsList className="inline-flex w-max min-w-full">
                {SECTIONS.map(({ id, label, icon: Icon }) => (
                  <TabsTrigger key={id} value={id} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {SECTIONS.map(({ id, Component }) => (
              <TabsContent key={id} value={id} className="mt-4">
                <Component />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
