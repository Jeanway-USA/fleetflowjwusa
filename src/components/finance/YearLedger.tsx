import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/formatters';
import { readSettlementDetails } from '@/lib/read-settlement-lines';
import { buildLedger, type LedgerLine, type LedgerResult, type LedgerRow } from '@/lib/ledger-proof';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Roster, type RosterEntry } from '@/components/fleet/Roster';

const money = (v: number) => (v < 0 ? `−${formatCurrency(-v)}` : formatCurrency(v));

/**
 * Landstar's year-to-date Settlement Details lists every line of money in the settlement, so it adds up to the year's
 * Settled Amt. This sorts those lines into plain categories and compares each cost with your records.
 */
export function YearLedger() {
  const thisYear = new Date().getFullYear();
  const fileInput = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(thisYear);
  const [fileName, setFileName] = useState('');
  const [lines, setLines] = useState<LedgerLine[] | null>(null);
  const [printedTotal, setPrintedTotal] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [busy, setBusy] = useState(false);

  const compute = async (source: LedgerLine[], forYear: number) => {
    const { data, error } = await supabase
      .from('expenses')
      .select('expense_type, amount, description')
      .is('deleted_at', null)
      .gte('expense_date', `${forYear}-01-01`)
      .lte('expense_date', `${forYear}-12-31`)
      .limit(10000);
    if (error) throw error;
    setLedger(buildLedger(source, (data ?? []) as any[]));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setLedger(null);
    try {
      const read = await readSettlementDetails(await file.arrayBuffer());
      if (read.lines.length === 0) throw new Error('No settlement lines were found in that file.');
      setLines(read.lines);
      setPrintedTotal(read.printedTotal);
      setFileName(file.name);
      await compute(read.lines, year);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not read that file');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const recheck = async (forYear = year) => {
    if (!lines) return;
    setBusy(true);
    try {
      await compute(lines, forYear);
    } catch (err: any) {
      toast.error(err.message ?? 'Could not check again');
    } finally {
      setBusy(false);
    }
  };

  const entry = (row: LedgerRow): RosterEntry => {
    const off = row.difference !== null && Math.abs(row.difference) >= 0.005;
    return {
      id: row.category.key,
      title: row.category.label,
      subtitle: [row.category.note, `${row.lines} ${row.lines === 1 ? 'line' : 'lines'}`].filter(Boolean).join('. '),
      chips: row.difference === null ? undefined : (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${off ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success'}`}>
          {off ? 'Off' : 'Matches'}
        </span>
      ),
      facts: [
        { label: row.category.kind === 'cash' ? 'Money out (in is negative)' : 'Landstar', value: money(row.landstar) },
        ...(row.app !== null ? [{ label: 'Your records', value: money(row.app), tone: off ? ('bad' as const) : undefined }] : []),
        ...(row.difference !== null && off ? [{ label: 'Yours is off by', value: money(row.difference), tone: 'bad' as const }] : []),
      ],
    };
  };

  const rows = ledger?.rows ?? [];
  const compared = rows.filter((r) => r.category.kind === 'cost' || r.category.kind === 'advance');
  const cash = rows.filter((r) => r.category.kind === 'cash');
  const revenue = rows.filter((r) => r.category.kind === 'revenue');
  const offCount = compared.filter((r) => r.difference !== null && Math.abs(r.difference) >= 0.005).length;
  const years = Array.from({ length: 4 }, (_, i) => thisYear - i);

  return (
    <Panel
      title="Year to date, line by line"
      description="Landstar's year-to-date Settlement Details lists every line of money in your settlement. It adds up to your Settled Amt, and each cost here is set beside your records."
      flush
      aside={
        <>
          <input ref={fileInput} type="file" accept=".xlsx,.xls" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
          <Select
            value={String(year)}
            onValueChange={(v) => {
              setYear(Number(v));
              void recheck(Number(v));
            }}
          >
            <SelectTrigger className="h-11 w-28" aria-label="Year"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="h-11 gap-2" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {ledger ? 'Choose another file' : 'Choose Settlement Details file'}
          </Button>
          {ledger && <Button variant="outline" className="h-11" onClick={() => recheck()} disabled={busy}>Check again</Button>}
        </>
      }
    >
      {!ledger ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          In Landstar's BCO Analytics, open Settlement Overview, pick the year, and export Settlement Details. The file adds up to the Settled Amt shown at the top of that page.
        </p>
      ) : (
        <>
          <div className="border-t px-4">
            <StatementLine label="From" note={`${lines?.length ?? 0} lines`} value={<span className="text-base font-medium">{fileName}</span>} muted />
            <StatementLine label="Money in from revenue" note="Linehaul, fuel surcharge, accessorials and their reversals" value={money(ledger.totals.revenue)} rule="single" />
            <StatementLine label="Everything else, in and out" note="Advances, fees, deductions, escrow, loans and refunds" value={money(ledger.settled - ledger.totals.revenue)} rule="single" />
            <StatementLine
              label="Settled Amt"
              note={
                printedTotal === null
                  ? 'The lines added together'
                  : Math.abs(printedTotal - ledger.settled) < 0.005
                    ? `Matches the total Landstar prints under the file (${money(printedTotal)})`
                    : `Landstar prints ${money(printedTotal)} under the file, so some lines were not read`
              }
              value={money(ledger.settled)}
              strong
              rule="double"
              tone={printedTotal !== null && Math.abs(printedTotal - ledger.settled) < 0.005 ? 'good' : undefined}
            />
          </div>

          <h4 className="border-t px-4 pt-3 font-condensed text-lg font-bold">Costs and advances, against your records</h4>
          <p className="px-4 pb-2 text-[13px] text-muted-foreground">
            {offCount === 0 ? 'Every category agrees with your records.' : `${offCount} ${offCount === 1 ? 'category is' : 'categories are'} off. A category that is off is where to look for missing or doubled lines.`}
          </p>
          <Roster entries={compared.map(entry)} bordered={false} empty="No costs in this file." />

          {cash.length > 0 && (
            <>
              <h4 className="border-t px-4 pt-3 font-condensed text-lg font-bold">Cash that is not profit</h4>
              <p className="px-4 pb-2 text-[13px] text-muted-foreground">Escrow, loan money and refunds move your Settled Amt but not your profit, so the app does not record them.</p>
              <Roster entries={cash.map(entry)} bordered={false} empty="" />
            </>
          )}

          {revenue.length > 0 && (
            <>
              <h4 className="border-t px-4 pt-3 font-condensed text-lg font-bold">Revenue lines</h4>
              <Roster entries={revenue.map(entry)} bordered={false} empty="" />
            </>
          )}
        </>
      )}
    </Panel>
  );
}
