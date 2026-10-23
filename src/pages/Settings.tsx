import { useMemo, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, FileText, HardDrive, Scale, Moon, Palette, Percent, Receipt, Sun, Users, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { CompanyTab } from '@/components/settings/CompanyTab';
import { BrandingTab } from '@/components/settings/BrandingTab';
import { StorageTab } from '@/components/settings/StorageTab';
import { DetentionRulesCard } from '@/components/settings/DetentionRulesCard';
import { OverDimensionRulesCard } from '@/components/settings/OverDimensionRulesCard';
import { InBondFeeCard } from '@/components/settings/InBondFeeCard';
import { TeamManagementTab } from '@/components/settings/TeamManagementTab';
import { OnboardingPreferencesCard } from '@/components/settings/OnboardingPreferencesCard';
import { DocumentTemplatesPanel } from '@/components/settings/DocumentTemplatesPanel';
import { AuditLogPanel } from '@/components/settings/AuditLogPanel';
import { PayrollTaxesCard } from '@/components/settings/PayrollTaxesCard';
import { StaffPayTab } from '@/components/settings/pay-packages/StaffPayTab';
import { PositionsTab } from '@/components/settings/positions/PositionsTab';
import { PayPackagesTab } from '@/components/settings/pay-packages/PayPackagesTab';

type Group = 'Company' | 'People' | 'Pay' | 'You';

interface Section {
  id: string;
  label: string;
  group: Group;
  icon: ComponentType<{ className?: string }>;
  render: () => JSX.Element;
}

const GROUPS: Group[] = ['People', 'Company', 'Pay', 'You'];

/** Pick light or dark. The same two choices the top bar toggle makes, shown as they will look. */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const choices = [
    { value: 'light' as const, label: 'Light', Icon: Sun, page: 'bg-white border-gray-200', bar: 'bg-gray-200' },
    { value: 'dark' as const, label: 'Dark', Icon: Moon, page: 'bg-zinc-900 border-zinc-700', bar: 'bg-zinc-700' },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Applies to this device and this login only.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-2 gap-3">
          {choices.map(({ value, label, Icon, page, bar }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'rounded-lg border-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                theme === value ? 'border-primary' : 'border-border hover:border-primary/50',
              )}
            >
              <div className={cn('mb-2 rounded-md border p-3', page)}>
                <div className="mb-2 h-2 w-12 rounded bg-carbon" />
                <div className={cn('mb-1 h-2 w-20 rounded', bar)} />
                <div className={cn('h-2 w-16 rounded', bar)} />
              </div>
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4" />
                {label}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { canSimulateRoles: isOwner, hasPayrollAccess } = useAuth();
  const [params, setParams] = useSearchParams();

  // Everything a person may open. The owner sees it all; others see their own look, plus pay if they run payroll.
  const sections = useMemo<Section[]>(() => {
    const all: Section[] = [
      { id: 'company', label: 'Company', group: 'Company', icon: Building2, render: () => <CompanyTab /> },
      { id: 'landstar-rules', label: 'Landstar rules', group: 'Company', icon: Scale, render: () => (
          <div className="space-y-6">
            <DetentionRulesCard />
            <OverDimensionRulesCard />
            <InBondFeeCard />
          </div>
        ) },
      { id: 'branding', label: 'Branding', group: 'Company', icon: Palette, render: () => <BrandingTab /> },
      { id: 'storage', label: 'Storage', group: 'Company', icon: HardDrive, render: () => <StorageTab /> },
      { id: 'team', label: 'Team', group: 'People', icon: Users, render: () => <TeamManagementTab /> },
      { id: 'positions', label: 'Positions', group: 'People', icon: Briefcase, render: () => <PositionsTab /> },
      {
        id: 'onboarding',
        label: 'Onboarding & documents',
        group: 'People',
        icon: FileText,
        render: () => (
          <div className="space-y-6">
            <OnboardingPreferencesCard />
            <DocumentTemplatesPanel />
            <AuditLogPanel />
          </div>
        ),
      },
      { id: 'pay-packages', label: 'Pay packages', group: 'Pay', icon: Wallet, render: () => <PayPackagesTab /> },
      { id: 'staff-pay', label: 'Staff pay', group: 'Pay', icon: Receipt, render: () => <StaffPayTab /> },
      { id: 'payroll-taxes', label: 'Payroll taxes', group: 'Pay', icon: Percent, render: () => <PayrollTaxesCard /> },
      { id: 'appearance', label: 'Appearance', group: 'You', icon: Sun, render: () => <AppearanceSection /> },
    ];
    if (isOwner) return all;
    return all.filter((s) => s.id === 'appearance' || s.id === 'pay-packages' || s.id === 'staff-pay' || (s.id === 'positions' && hasPayrollAccess));
  }, [isOwner, hasPayrollAccess]);

  // The address remembers the section, so a reload or a shared link lands where you were.
  const requested = params.get('tab');
  const grouped = GROUPS.map((g) => ({ group: g, items: sections.filter((s) => s.group === g) })).filter((g) => g.items.length > 0);
  const current = sections.find((s) => s.id === requested) ?? grouped[0].items[0];
  const choose = (id: string) => setParams({ tab: id }, { replace: true });

  return (
    <>
      <PageHeader
        title="Settings"
        description={isOwner ? 'Company, people, pay and how the app looks.' : 'Your preferences. Company settings are managed by the owner.'}
      />

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* Phone: one dropdown. Desk: the grouped list. */}
        <div className="md:hidden">
          <Select value={current.id} onValueChange={choose}>
            <SelectTrigger className="h-12" aria-label="Settings section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {grouped.map(({ group, items }) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {items.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav aria-label="Settings sections" className="hidden self-start md:sticky md:top-4 md:block">
          <div className="space-y-5">
            {grouped.map(({ group, items }) => (
              <div key={group}>
                <p className="mb-1 px-3 text-[13px] font-semibold text-muted-foreground">{group}</p>
                <ul className="space-y-0.5">
                  {items.map((s) => {
                    const active = s.id === current.id;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => choose(s.id)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                          )}
                        >
                          <s.icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
                          <span className="truncate">{s.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">{current.render()}</div>
      </div>
    </>
  );
}
