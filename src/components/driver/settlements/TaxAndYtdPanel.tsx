import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileSpreadsheet, TrendingUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import type { SettlementRow } from '@/hooks/useDriverSettlementsPage';
import {
  downloadTaxDocument,
  useMyTaxDocuments,
} from '@/hooks/useDriverTaxDocuments';

interface Props {
  settlements: SettlementRow[];
  ytd: { grossYtd: number; netYtd: number; milesYtd: number } | undefined;
  ytdLoading: boolean;
}

export function TaxAndYtdPanel({ settlements, ytd, ytdLoading }: Props) {
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
    if (year && !years.includes(Number(year))) {
      setYear(years[0] ? String(years[0]) : '');
    }
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
    <div className="space-y-4">
      {/* 1099 Tax Statements */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">1099 Tax Statements</p>
              <p className="text-[11px] text-muted-foreground">
                For 1099 owner-operators
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Tax Year
            </label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handle1099Download}
          >
            <Download className="h-4 w-4" />
            Download 1099-NEC ({year})
          </Button>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            1099-NEC forms are issued each January for the prior tax year. Contact
            dispatch if you need a correction.
          </p>
        </CardContent>
      </Card>

      {/* YTD Snapshot */}
      <Card className="card-elevated">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Year-to-Date Snapshot
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date().getFullYear()} totals
                </p>
              </div>
            </div>
          </div>

          {ytdLoading || !ytd ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="space-y-3">
              <YtdRow label="YTD Gross Revenue" value={formatCurrency(ytd.grossYtd)} />
              <YtdRow
                label="YTD Loaded Miles"
                value={`${ytd.milesYtd.toLocaleString()} mi`}
              />
              <YtdRow
                label="YTD Net Pay"
                value={formatCurrency(ytd.netYtd)}
                emphasis
              />
            </div>
          )}

          <p className="text-[10px] text-muted-foreground tabular-nums">
            As of {format(new Date(), 'MMM d, yyyy h:mm a')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function YtdRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={
          emphasis
            ? 'text-lg font-bold text-success tabular-nums'
            : 'text-base font-semibold text-foreground tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  );
}
