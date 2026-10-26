import { PageHeader } from '@/components/shared/PageHeader';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  useW2Totals, use1099Totals, useEmployerInfo,
  type W2Row, type Row1099,
} from '@/hooks/useTaxHubData';
import { generate1099NecPdf } from '@/lib/pdf/generate1099NecPdf';
import { useDriverTin, formatTin } from '@/hooks/useSensitiveDriverData';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  AlertTriangle, CheckCircle2, Download, FileText, Landmark, Building2,
  Calculator, Users, Receipt, Loader2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';


// -----------------------------------------------------------
// 1099 tab
// -----------------------------------------------------------
/** Forms 1099-NEC are required at $600 for payments through 2025 and at $2,000 for payments made after 2025 (P.L. 119-21), unless federal tax was withheld. */
export const threshold1099 = (year: number) => (year >= 2026 ? 2000 : 600);

export function Form1099Tab({ year }: { year: number }) {
  const { orgId } = useAuth();
  const { data: employer } = useEmployerInfo();
  const { data: rows = [], isLoading, refetch } = use1099Totals(year);
  const [showBelow, setShowBelow] = useState(false);

  const filtered = useMemo(
    () => rows.filter((r) => showBelow || Number(r.nonemployee_comp_box1) >= threshold1099(year) || Number(r.fed_tax_withheld_box4) > 0),
    [rows, showBelow],
  );

  const generate = useMutation({
    mutationFn: async (row: Row1099) => {
      if (!employer) throw new Error('Employer info missing');
      if (!row.tin_last4) throw new Error('W-9 / TIN missing — collect it from the contractor first.');
      let tinFull: string | null = null;
      let tinType: string | null = null;
      try {
        const { data: tinRows } = await supabase.rpc('get_driver_tin' as never, {
          _driver_id: row.driver_id,
        } as never);
        const arr = tinRows as any[] | null;
        const tr = arr && arr.length > 0 ? arr[0] : null;
        tinFull = tr?.tin ?? null;
        tinType = tr?.tin_type ?? null;
      } catch {
        tinFull = null;
      }
      const blob = generate1099NecPdf({ year, employer, recipient: row, tinFull, tinType });
      // Path must be driver-first: the tax-documents bucket policies key on folder[1] = drivers.id
      const path = `${row.driver_id}/${year}/1099_nec.pdf`;
      const { error: upErr } = await supabase.storage.from('tax-documents')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      await supabase.from('tax_documents' as never).upsert({
        org_id: orgId,
        driver_id: row.driver_id,
        tax_year: year,
        file_path: path,
        document_type: '1099_nec',
        status: 'issued',
      } as never, { onConflict: 'driver_id,tax_year,file_path' } as never);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `1099NEC_${row.last_name}_${row.first_name}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => { toast.success('1099-NEC generated and saved'); refetch(); },
    onError: (e: any) => toast.error(e.message ?? 'Generation failed'),
  });

  const missingEmployer = !employer?.ein || !employer?.address_line1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" /> 1099-NEC Preparation — {year}</CardTitle>
          <CardDescription>Contractors with ${threshold1099(year).toLocaleString()}+ in nonemployee compensation for the year, from approved/paid settlements.</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <Label className="flex items-center gap-2 text-sm">
            <Switch checked={showBelow} onCheckedChange={setShowBelow} />
            Show below ${threshold1099(year).toLocaleString()}
          </Label>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingEmployer && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Employer identity incomplete</AlertTitle>
            <AlertDescription>
              Enter your legal business name, EIN, and address at the top of this page before generating tax forms.
            </AlertDescription>
          </Alert>
        )}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No qualifying 1099-NEC recipients for {year}.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>Legal name</TableHead>
                  <TableHead>TIN</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Box 1 NEC</TableHead>
                  <TableHead className="text-right">Box 4 Fed. Withheld</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const missingW9 = !r.tin_last4;
                  return (
                    <TableRow key={r.driver_id}>
                      <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                      <TableCell>{r.legal_name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {r.tin_last4
                          ? <FullTinBadge driverId={r.driver_id} last4={r.tin_last4} />
                          : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> No W-9</Badge>}
                      </TableCell>
                      <TableCell>{r.tax_state || '—'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(r.nonemployee_comp_box1)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.fed_tax_withheld_box4)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline"
                          disabled={missingEmployer || missingW9 || generate.isPending}
                          onClick={() => generate.mutate(r)}>
                          <Download className="h-3.5 w-3.5 mr-1" /> 1099
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function FullTinBadge({ driverId, last4 }: { driverId: string; last4: string }) {
  const { data, isLoading } = useDriverTin(driverId);
  if (isLoading) return <Badge variant="outline">•••• {last4}</Badge>;
  const full = data?.tin ? formatTin(data.tin, data.tin_type) : null;
  return <Badge variant="outline" className="font-mono">{full || `•••• ${last4}`}</Badge>;
}

