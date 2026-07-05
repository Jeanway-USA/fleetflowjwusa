import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  UserCheck,
  Landmark,
  Percent,
  MapPin,
  CalendarClock,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

import { syncOnboardingSteps, type GustoOnboardingStep } from '@/services/gustoCompanyApi';
import { CompanyIndustrySection } from '@/components/payroll/setup/sections/CompanyIndustrySection';
import { SignatorySection } from '@/components/payroll/setup/sections/SignatorySection';
import { TaxSetupSection } from '@/components/payroll/setup/sections/TaxSetupSection';
import { PayScheduleManager } from '@/components/payroll/PayScheduleManager';
import { StateTaxStep } from './steps/StateTaxStep';
import { MicroDepositVerifyStep } from './steps/MicroDepositVerifyStep';

interface StepDef {
  id: string;
  label: string;
  description: string;
  icon: typeof Building2;
  match: string[];
  Component: React.ComponentType;
}

const STEPS: StepDef[] = [
  {
    id: 'company',
    label: 'Company & industry',
    description: 'Legal name, primary work address, and NAICS.',
    icon: Building2,
    match: ['add_addresses', 'select_industry', 'company', 'industry'],
    Component: CompanyIndustrySection,
  },
  {
    id: 'federal_tax',
    label: 'Federal tax details',
    description: 'EIN and Form 941 election so Gusto can file quarterly taxes.',
    icon: Percent,
    match: ['federal_tax', 'add_federal_tax'],
    Component: TaxSetupSection,
  },
  {
    id: 'signatory',
    label: 'Signatory',
    description: 'Authorized officer who signs payroll tax forms.',
    icon: UserCheck,
    match: ['signatory', 'add_signatory'],
    Component: SignatorySection,
  },
  {
    id: 'bank',
    label: 'Bank account',
    description: 'Verified bank account funds direct deposit and tax payments.',
    icon: Landmark,
    match: ['bank_account', 'add_bank_account', 'verify_bank_account'],
    Component: MicroDepositVerifyStep,
  },
  {
    id: 'state_tax',
    label: 'State tax registrations',
    description: 'Per-state SUTA/withholding account IDs for driver home states.',
    icon: MapPin,
    match: ['state_tax', 'add_state_taxes'],
    Component: StateTaxStep,
  },
  {
    id: 'pay_schedule',
    label: 'Pay schedule',
    description: 'How often drivers are paid and the next check date.',
    icon: CalendarClock,
    match: ['pay_schedule', 'add_pay_schedule'],
    Component: PayScheduleManager,
  },
];

function isStepCompleted(step: StepDef, remote: GustoOnboardingStep[]): boolean {
  for (const r of remote) {
    const id = String(r.id ?? r.step ?? '').toLowerCase();
    const title = String(r.title ?? '').toLowerCase();
    if (step.match.some((m) => id.includes(m) || title.includes(m))) {
      return Boolean(r.completed);
    }
  }
  return false;
}

/**
 * White-labeled employer onboarding portal.
 * Composes the existing Gusto setup sections into a single stepper card that
 * reflects live progress from Gusto's /companies/{uuid}/onboarding_status.
 */
export function EmployerOnboardingPortal() {
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ['gusto-onboarding-steps'],
    queryFn: async () => {
      const res = await syncOnboardingSteps();
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    retry: false,
    staleTime: 60_000,
  });

  const remote = useMemo<GustoOnboardingStep[]>(
    () => (Array.isArray(data?.onboarding_steps) ? data!.onboarding_steps : []),
    [data],
  );

  const completedCount = STEPS.filter((s) => isStepCompleted(s, remote)).length;
  const pct = Math.round((completedCount / STEPS.length) * 100);
  const notProvisioned = error instanceof Error && /not provisioned/i.test(error.message);

  return (
    <Card className="card-elevated">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              W-2 Payroll Onboarding
            </CardTitle>
            <CardDescription>
              Complete every step below so Gusto can run payroll, pay drivers by
              direct deposit, and file Form 941, SUTA, and W-2s on your behalf.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={completedCount === STEPS.length ? 'default' : 'secondary'}>
              {completedCount} / {STEPS.length} complete
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetch().then((r) => {
                  if (r.error) toast.error(r.error.message);
                });
              }}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
        <Progress value={pct} className="mt-3 h-2" />
      </CardHeader>
      <CardContent>
        {notProvisioned ? (
          <p className="text-sm text-muted-foreground">
            Gusto company is not provisioned for this organization yet. Once the
            company is provisioned, each onboarding step below will unlock.
          </p>
        ) : null}
        <Accordion type="multiple" className="space-y-2">
          {STEPS.map((step, idx) => {
            const done = isStepCompleted(step, remote);
            const Icon = step.icon;
            return (
              <AccordionItem
                key={step.id}
                value={step.id}
                className="rounded-lg border bg-card px-3"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex flex-1 items-center gap-3 pr-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {idx + 1}
                    </div>
                    <Icon className="h-4 w-4 text-primary" />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium">{step.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {step.description}
                      </div>
                    </div>
                    {done ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Circle className="h-3 w-3" /> Pending
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-1">
                  <step.Component />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
