import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useTaxHub } from '@/hooks/useTaxHub';
import { useEmployerInfo } from '@/hooks/useTaxHubData';
import { OverviewTab } from '@/components/taxhub/OverviewTab';
import { PeopleTab } from '@/components/taxhub/PeopleTab';
import { FilingsTab } from '@/components/taxhub/FilingsTab';
import { W2Tab } from '@/components/taxhub/W2Tab';
import { StatesTab } from '@/components/taxhub/StatesTab';
import { RecordsTab } from '@/components/taxhub/RecordsTab';
import { Form1099Tab } from '@/components/taxhub/Contractors1099';
import type { TabKey } from '@/components/taxhub/shared';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'people', label: 'People' },
  { key: 'filings', label: 'Filings' },
  { key: 'w2', label: 'W-2s' },
  { key: 'states', label: 'States' },
  { key: 'records', label: 'Records' },
  { key: 'contractors', label: '1099s' },
];

/**
 * Payroll taxes in one place: what each person owes, what the company owes on top, what is due and when, and the year-end forms.
 * Everything is worked out from the pay records, so the W-2s, the quarterly returns and the totals always agree.
 */
export default function TaxHub() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [tab, setTab] = useState<TabKey>('overview');
  const hub = useTaxHub(year);
  const employer = useEmployerInfo();
  const years = useMemo(() => [thisYear + 1, thisYear, thisYear - 1, thisYear - 2].filter((y) => y <= thisYear), [thisYear]);
  const stateIds = useMemo(() => Object.fromEntries(hub.saved.filter((s) => s.sit_account_number).map((s) => [s.code, s.sit_account_number as string])), [hub.saved]);
  const fixCount = hub.data?.issues.filter((i) => i.level === 'fix').length ?? 0;

  return (
    <div>
      <PageHeader title="Tax hub" description="Payroll taxes for employees: what is withheld, what the company owes, what is due, and the year-end forms">
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-11 w-32" aria-label="Tax year"><SelectValue /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </PageHeader>

      {hub.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>The Tax Hub could not load</AlertTitle>
          <AlertDescription>{hub.error.message}</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="h-11 shrink-0 px-4">
              {t.label}
              {t.key === 'overview' && fixCount > 0 && <span className="ml-2 rounded-sm bg-destructive px-1.5 text-xs text-destructive-foreground">{fixCount}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {hub.isLoading || !hub.data || !hub.ctx ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
        ) : (
          <>
            <TabsContent value="overview"><OverviewTab hub={hub.data} year={year} onOpen={setTab} /></TabsContent>
            <TabsContent value="people"><PeopleTab hub={hub.data} ctx={hub.ctx} year={year} /></TabsContent>
            <TabsContent value="filings"><FilingsTab hub={hub.data} year={year} /></TabsContent>
            <TabsContent value="w2"><W2Tab hub={hub.data} year={year} employer={employer.data} stateIds={stateIds} /></TabsContent>
            <TabsContent value="states"><StatesTab hub={hub.data} saved={hub.saved} /></TabsContent>
            <TabsContent value="records"><RecordsTab hub={hub.data} year={year} /></TabsContent>
            <TabsContent value="contractors"><Form1099Tab year={year} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
