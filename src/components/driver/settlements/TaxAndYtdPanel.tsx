import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import type { SettlementRow } from '@/hooks/useDriverSettlementsPage';
import { downloadTaxDocument, useMyTaxDocuments } from '@/hooks/useDriverTaxDocuments';
import { DBtn, Panel, PanelHead, Stat, StatCell, StatRow } from '@/components/driver/ui/driver-ui';

interface Props {
  settlements: SettlementRow[];
  ytd: { grossYtd: number; netYtd: number; milesYtd: number } | undefined;
  ytdLoading: boolean;
}

export function TaxAndYtdPanel({ ytd, ytdLoading }: Props) {
  const { data: taxDocs = [], isLoading: taxLoading } = useMyTaxDocuments();

  const years = useMemo(() => {
    const set = new Set<number>();
    taxDocs.forEach((d) => set.add(d.tax_year));
    return Array.from(set).sort((a, b) => b - a);
  }, [taxDocs]);

  const [year, setYear] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  // Default to newest available year once data loads
  useEffect(() => {
    if (!year && years.length > 0) setYear(String(years[0]));
    if (year && !years.includes(Number(year))) setYear(years[0] ? String(years[0]) : '');
  }, [years, year]);

  const hasDocs = years.length > 0;

  const handle1099Download = async () => {
    const doc = taxDocs.find((d) => d.tax_year === Number(year));
    if (!doc) {
      toast.error('No 1099 found for that year');
      return;
    }
    try {
      setDownloading(true);
      await downloadTaxDocument(doc.file_path, `1099-NEC-${doc.tax_year}.pdf`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Panel>
        <PanelHead title={`${new Date().getFullYear()} so far`} aside={`As of ${format(new Date(), 'MMM d, h:mm a')}`} />
        {ytdLoading || !ytd ? (
          <div className="space-y-2 px-4 pb-4"><Skeleton className="h-12 w-full" /></div>
        ) : (
          <>
            <div className="px-4 pb-4">
              <p className="text-xs text-muted-foreground">Net pay</p>
              <p className="font-condensed text-4xl font-bold tabular-nums leading-tight text-success">{formatCurrency(ytd.netYtd)}</p>
            </div>
            <StatRow>
              <StatCell><Stat label="Gross revenue">{formatCurrency(ytd.grossYtd)}</Stat></StatCell>
              <StatCell><Stat label="Loaded miles">{ytd.milesYtd.toLocaleString()}</Stat></StatCell>
            </StatRow>
          </>
        )}
      </Panel>

      <Panel>
        <PanelHead title="1099 tax statements" aside="Owner-operators" />
        <div className="space-y-3 px-4 pb-4">
          {taxLoading ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <Select value={year} onValueChange={setYear} disabled={!hasDocs}>
              <SelectTrigger className="h-11" aria-label="Tax year">
                <SelectValue placeholder={hasDocs ? 'Select year' : 'No forms available'} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <DBtn tone="secondary" size="lg" className="w-full" onClick={handle1099Download} disabled={!hasDocs || !year || downloading || taxLoading}>
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {hasDocs && year ? `Download 1099-NEC (${year})` : 'Download 1099-NEC'}
          </DBtn>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hasDocs
              ? '1099-NEC forms are issued each January for the prior tax year. Contact dispatch if you need a correction.'
              : "Your administrator hasn't uploaded a 1099 yet. You'll be notified when one is available."}
          </p>
        </div>
      </Panel>
    </div>
  );
}
