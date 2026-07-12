import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePayrollConfig } from '@/hooks/usePayrollConfig';
import {
  useW2Totals, use1099Totals, useEmployerInfo,
  type W2Row, type Row1099,
} from '@/hooks/useTaxHubData';
import { generateW2Pdf } from '@/lib/pdf/generateW2Pdf';
import { generate1099NecPdf } from '@/lib/pdf/generate1099NecPdf';
import { useDriverTin, formatTin } from '@/hooks/useSensitiveDriverData';
import { FederalFilingRegistry } from '@/components/finance/inhouse-payroll/FederalFilingRegistry';
import { StateFilingRegistry } from '@/components/finance/inhouse-payroll/StateFilingRegistry';
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
// State detail sheet
// -----------------------------------------------------------
function StateDetailSheet({
  open, onOpenChange, stateCode, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; stateCode: string | null; onSaved: () => void }) {
  const { orgId } = useAuth();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useQuery({
    queryKey: ['state_tax_row', orgId, stateCode],
    enabled: !!orgId && !!stateCode && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('state_tax_configurations' as never)
        .select('*')
        .eq('org_id', orgId!)
        .eq('state_code', stateCode!)
        .maybeSingle();
      if (error) throw error;
      setForm(data ?? { state_code: stateCode });
      return data;
    },
  });

  const save = async () => {
    if (!orgId || !stateCode) return;
    setSaving(true);
    try {
      const payload = {
        org_id: orgId,
        state_code: stateCode,
        suta_rate: Number(form.suta_rate) || 0,
        suta_wage_base: Number(form.suta_wage_base) || 0,
        has_state_income_tax: !!form.has_state_income_tax,
        sit_rate: Number(form.sit_rate) || 0,
        suta_account_number: form.suta_account_number || null,
        sit_account_number: form.sit_account_number || null,
        deposit_frequency: form.deposit_frequency || null,
        agency_notes: form.agency_notes || null,
      };
      const { error } = await supabase
        .from('state_tax_configurations' as never)
        .upsert(payload as never, { onConflict: 'org_id,state_code' } as never);
      if (error) throw error;
      toast.success(`${stateCode} tax configuration saved`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{stateCode} — State Tax Configuration</SheetTitle>
          <SheetDescription>
            Rates are set by each state's labor & revenue departments.
            Update here whenever they issue a new rate notice.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SUTA rate (decimal)</Label>
              <Input type="number" step="0.0001" value={form.suta_rate ?? ''}
                onChange={(e) => setForm({ ...form, suta_rate: e.target.value })} />
              <p className="text-xs text-muted-foreground">e.g. 0.027 = 2.7%</p>
            </div>
            <div className="space-y-2">
              <Label>SUTA wage base ($)</Label>
              <Input type="number" step="1" value={form.suta_wage_base ?? ''}
                onChange={(e) => setForm({ ...form, suta_wage_base: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>SUTA account number</Label>
            <Input value={form.suta_account_number ?? ''}
              onChange={(e) => setForm({ ...form, suta_account_number: e.target.value })}
              placeholder="Agency-assigned ID" />
          </div>
          <div className="flex items-center justify-between border rounded-md p-3">
            <div>
              <Label>State income tax applies</Label>
              <p className="text-xs text-muted-foreground">Toggle off for no-SIT states (FL, TX, TN, NV, etc.)</p>
            </div>
            <Switch checked={!!form.has_state_income_tax}
              onCheckedChange={(v) => setForm({ ...form, has_state_income_tax: v })} />
          </div>
          {form.has_state_income_tax && (
            <>
              <div className="space-y-2">
                <Label>SIT rate (decimal)</Label>
                <Input type="number" step="0.0001" value={form.sit_rate ?? ''}
                  onChange={(e) => setForm({ ...form, sit_rate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>SIT withholding account #</Label>
                <Input value={form.sit_account_number ?? ''}
                  onChange={(e) => setForm({ ...form, sit_account_number: e.target.value })} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label>Deposit frequency</Label>
            <Select value={form.deposit_frequency ?? ''}
              onValueChange={(v) => setForm({ ...form, deposit_frequency: v })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="semiweekly">Semiweekly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Agency contact / notes</Label>
            <Textarea rows={3} value={form.agency_notes ?? ''}
              onChange={(e) => setForm({ ...form, agency_notes: e.target.value })} />
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// -----------------------------------------------------------
// Multi-state overview
// -----------------------------------------------------------
function MultiStateTab({ year }: { year: number }) {
  const { orgId } = useAuth();
  const { data: config } = usePayrollConfig();
  const [detailState, setDetailState] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: agg = [] } = useQuery({
    queryKey: ['multi_state_agg', orgId, year],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select(`id, tax_state, employment_type, status,
                 internal_payroll_ledger!inner(id, status, period_end,
                   gross_taxable_pay, one_time_bonus, one_time_deduction,
                   tax_withholding_ledger(state_suta, state_sit, state_code))`)
        .eq('org_id', orgId!)
        .neq('status', 'terminated');
      if (error) throw error;
      return data ?? [];
    },
  });

  type StateAgg = {
    state: string; employees: number; wages: number; suta: number; sit: number;
  };
  const rows: StateAgg[] = useMemo(() => {
    const map = new Map<string, StateAgg>();
    for (const d of agg as any[]) {
      const state = (d.tax_state || '').toUpperCase();
      if (!state) continue;
      const rec = map.get(state) ?? { state, employees: 0, wages: 0, suta: 0, sit: 0 };
      rec.employees += 1;
      for (const l of d.internal_payroll_ledger ?? []) {
        if (l.status !== 'finalized') continue;
        if (new Date(l.period_end).getFullYear() !== year) continue;
        rec.wages += (Number(l.gross_taxable_pay) || 0)
          + (Number(l.one_time_bonus) || 0) - (Number(l.one_time_deduction) || 0);
        for (const w of l.tax_withholding_ledger ?? []) {
          rec.suta += Number(w.state_suta) || 0;
          rec.sit += Number(w.state_sit) || 0;
        }
      }
      map.set(state, rec);
    }
    // De-dupe employees (query returned rows per ledger)
    const uniqDrivers = new Map<string, string>();
    for (const d of agg as any[]) {
      const s = (d.tax_state || '').toUpperCase();
      if (s) uniqDrivers.set(d.id, s);
    }
    for (const rec of map.values()) rec.employees = 0;
    for (const s of uniqDrivers.values()) {
      const rec = map.get(s);
      if (rec) rec.employees += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.state.localeCompare(b.state));
  }, [agg, year]);

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Multi-State Overview — {year}</CardTitle>
        <CardDescription>
          Every state where you employ W-2 workers, with YTD wages, employer-side SUTA accrued, and employee-side SIT withheld.
          Click any state to update its rate, wage base, or agency account number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No W-2 employees with a tax state assigned yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">YTD Wages</TableHead>
                  <TableHead className="text-right">YTD SUTA</TableHead>
                  <TableHead className="text-right">YTD SIT</TableHead>
                  <TableHead>SUTA Rate</TableHead>
                  <TableHead>SIT</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const cfg = config?.statesByCode.get(r.state);
                  const missingReg = !((cfg as any)?.suta_account_number);
                  return (
                    <TableRow key={r.state}>
                      <TableCell className="font-medium">{r.state}</TableCell>
                      <TableCell className="text-right">{r.employees}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.wages)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.suta)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.sit)}</TableCell>
                      <TableCell>{cfg ? `${(cfg.suta_rate * 100).toFixed(3)}%` : '—'}</TableCell>
                      <TableCell>
                        {cfg?.has_state_income_tax
                          ? <Badge variant="outline">{(cfg.sit_rate * 100).toFixed(2)}%</Badge>
                          : <Badge variant="secondary">None</Badge>}
                      </TableCell>
                      <TableCell>
                        {missingReg
                          ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Missing</Badge>
                          : <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> On file</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetailState(r.state)}>Configure</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <StateDetailSheet
        open={!!detailState}
        onOpenChange={(v) => !v && setDetailState(null)}
        stateCode={detailState}
        onSaved={() => qc.invalidateQueries({ queryKey: ['payroll_config'] })}
      />
    </Card>
    <StateFilingRegistry />
    </div>
  );
}

// -----------------------------------------------------------
// Federal overview
// -----------------------------------------------------------
function FederalTab({ year }: { year: number }) {
  const { data: w2s = [] } = useW2Totals(year);
  const totals = useMemo(() => {
    const t = { wages: 0, fit: 0, ss_ee: 0, ss_er: 0, med_ee: 0, med_er: 0, addl_med: 0, futa: 0 };
    for (const r of w2s) {
      t.wages += Number(r.wages_box1) || 0;
      t.fit += Number(r.fit_box2) || 0;
      t.ss_ee += Number(r.ss_tax_box4) || 0;
      t.med_ee += Number(r.medicare_tax_box6) || 0;
      // ER FICA mirrors EE minus addl medicare (approximate for display)
      t.ss_er += Number(r.ss_tax_box4) || 0;
      t.med_er += Number(r.medicare_tax_box6) || 0;
      // FUTA: 0.6% × min(wages, 7000) per employee
      t.futa += 0.006 * Math.min(7000, Number(r.wages_box1) || 0);
    }
    return t;
  }, [w2s]);

  const Card1 = ({ label, value, icon: Icon }: any) => (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-semibold mt-1">{formatCurrency(value)}</p>
          </div>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card1 label="Total wages" value={totals.wages} icon={Users} />
        <Card1 label="Federal income tax withheld" value={totals.fit} icon={Landmark} />
        <Card1 label="Social Security (EE + ER)" value={totals.ss_ee + totals.ss_er} icon={Calculator} />
        <Card1 label="Medicare (EE + ER)" value={totals.med_ee + totals.med_er} icon={Calculator} />
        <Card1 label="FUTA accrued (0.6%)" value={totals.futa} icon={Building2} />
        <Card1 label="941 total liability" value={totals.fit + totals.ss_ee + totals.ss_er + totals.med_ee + totals.med_er} icon={FileText} />
      </div>
      <FederalFilingRegistry />
    </div>
  );
}

// -----------------------------------------------------------
// W-2 tab
// -----------------------------------------------------------
function W2Tab({ year }: { year: number }) {
  const { orgId } = useAuth();
  const { data: employer } = useEmployerInfo();
  const { data: rows = [], isLoading, refetch } = useW2Totals(year);

  const generate = useMutation({
    mutationFn: async (row: W2Row) => {
      if (!employer) throw new Error('Employer info missing');
      let ssnFull: string | null = null;
      try {
        const { data: ssn } = await supabase.rpc('get_driver_ssn' as never, {
          _driver_id: row.driver_id,
        } as never);
        ssnFull = (ssn as string | null) ?? null;
      } catch {
        ssnFull = null;
      }
      const blob = generateW2Pdf({
        year,
        employer,
        driver: {
          firstName: row.first_name,
          lastName: row.last_name,
          tax_state: row.tax_state,
          ssnFull,
          address: row.i9_address ?? null,
        },
        totals: row,
      });


      const path = `${orgId}/${year}/w2/${row.driver_id}.pdf`;
      const { error: upErr } = await supabase.storage.from('tax-documents')
        .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      await supabase.from('tax_documents' as never).upsert({
        org_id: orgId,
        driver_id: row.driver_id,
        tax_year: year,
        file_path: path,
        document_type: 'w2',
        status: 'issued',
      } as never, { onConflict: 'driver_id,tax_year,file_path' } as never);
      // Also trigger local download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `W2_${row.last_name}_${row.first_name}_${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast.success('W-2 generated and saved');
      refetch();
    },
    onError: (e: any) => toast.error(e.message ?? 'Generation failed'),
  });

  const generateAll = useMutation({
    mutationFn: async () => {
      for (const r of rows) {
        await generate.mutateAsync(r);
      }
    },
  });

  const missingEmployer = !employer?.ein || !employer?.address_line1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> W-2 Preparation — {year}</CardTitle>
          <CardDescription>Year-to-date box totals per W-2 employee, computed from finalized payroll only.</CardDescription>
        </div>
        <Button onClick={() => generateAll.mutate()} disabled={rows.length === 0 || missingEmployer}>
          <Download className="h-4 w-4 mr-2" />
          Generate All W-2s
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingEmployer && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Employer identity incomplete</AlertTitle>
            <AlertDescription>
              Enter your legal business name, EIN, and address in the "Employer" section at the top of this page before generating tax forms.
            </AlertDescription>
          </Alert>
        )}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No W-2 wages for {year} yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Box 1 Wages</TableHead>
                  <TableHead className="text-right">Box 2 FIT</TableHead>
                  <TableHead className="text-right">Box 3 SS Wages</TableHead>
                  <TableHead className="text-right">Box 4 SS Tax</TableHead>
                  <TableHead className="text-right">Box 5 Med. Wages</TableHead>
                  <TableHead className="text-right">Box 6 Med. Tax</TableHead>
                  <TableHead className="text-right">Box 16 State Wages</TableHead>
                  <TableHead className="text-right">Box 17 State Tax</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.driver_id}>
                    <TableCell className="font-medium">{r.first_name} {r.last_name}</TableCell>
                    <TableCell>{r.tax_state || '—'}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.wages_box1)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.fit_box2)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.ss_wages_box3)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.ss_tax_box4)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.medicare_wages_box5)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.medicare_tax_box6)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.state_wages_box16)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.state_tax_box17)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline"
                        disabled={missingEmployer || generate.isPending}
                        onClick={() => generate.mutate(r)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> W-2
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------
// 1099 tab
// -----------------------------------------------------------
function Form1099Tab({ year }: { year: number }) {
  const { orgId } = useAuth();
  const { data: employer } = useEmployerInfo();
  const { data: rows = [], isLoading, refetch } = use1099Totals(year);
  const [showBelow, setShowBelow] = useState(false);

  const filtered = useMemo(
    () => rows.filter((r) => showBelow || Number(r.nonemployee_comp_box1) >= 600),
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
      const path = `${orgId}/${year}/1099/${row.driver_id}.pdf`;
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
          <CardDescription>Contractors with $600+ in nonemployee compensation for the year, from approved/paid settlements.</CardDescription>
        </div>
        <div className="flex items-center gap-4">
          <Label className="flex items-center gap-2 text-sm">
            <Switch checked={showBelow} onCheckedChange={setShowBelow} />
            Show below $600
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

// -----------------------------------------------------------
// Employer identity card
// -----------------------------------------------------------
function EmployerCard() {
  const { orgId } = useAuth();
  const { data: employer, refetch } = useEmployerInfo();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setForm({
      name: employer?.name ?? '',
      ein: employer?.ein ?? '',
      business_address_line1: employer?.address_line1 ?? '',
      business_address_line2: employer?.address_line2 ?? '',
      business_city: employer?.city ?? '',
      business_state: employer?.state ?? '',
      business_zip: employer?.zip ?? '',
    });
    setEditing(true);
  };

  const save = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('organizations')
        .update({
          name: form.name,
          ein: form.ein,
          business_address_line1: form.business_address_line1,
          business_address_line2: form.business_address_line2,
          business_city: form.business_city,
          business_state: form.business_state,
          business_zip: form.business_zip,
        } as never)
        .eq('id', orgId);
      if (error) throw error;
      toast.success('Employer details saved');
      setEditing(false);
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const incomplete = !employer?.ein || !employer?.address_line1;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Employer Identity</CardTitle>
          <CardDescription>Prints on every W-2 and 1099 you generate. Must exactly match your IRS records.</CardDescription>
        </div>
        {!editing && <Button variant="outline" onClick={startEdit}>Edit</Button>}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label>Legal business name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>EIN (XX-XXXXXXX)</Label>
                <Input value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={form.business_state} onChange={(e) => setForm({ ...form, business_state: e.target.value.toUpperCase() })} maxLength={2} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Address line 1</Label>
                <Input value={form.business_address_line1} onChange={(e) => setForm({ ...form, business_address_line1: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Address line 2</Label>
                <Input value={form.business_address_line2} onChange={(e) => setForm({ ...form, business_address_line2: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.business_city} onChange={(e) => setForm({ ...form, business_city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input value={form.business_zip} onChange={(e) => setForm({ ...form, business_zip: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Legal name</p><p className="font-medium">{employer?.name || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">EIN</p><p className="font-medium">{employer?.ein || <span className="text-destructive">Missing</span>}</p></div>
            <div className="col-span-2"><p className="text-xs text-muted-foreground">Address</p>
              <p className="font-medium">
                {employer?.address_line1 || <span className="text-destructive">Missing</span>}
                {employer?.city && `, ${employer.city}`}
                {employer?.state && `, ${employer.state}`}
                {employer?.zip && ` ${employer.zip}`}
              </p>
            </div>
          </div>
        )}
        {incomplete && !editing && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Required for tax forms</AlertTitle>
            <AlertDescription>Complete the employer block before generating W-2 or 1099 PDFs.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------
// Page
// -----------------------------------------------------------
export default function TaxHub() {
  const now = new Date();
  const defaultYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(defaultYear);
  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, [now]);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Tax Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-state employer tax tracking and IRS-accurate W-2 / 1099-NEC generation for every driver and contractor.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm">Tax year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <EmployerCard />

      <Tabs defaultValue="states">
        <TabsList className="grid grid-cols-4 gap-2 p-1 bg-muted rounded-lg h-auto w-full max-w-3xl">
          <TabsTrigger value="states" className="h-10 data-[state=active]:bg-background">Multi-State</TabsTrigger>
          <TabsTrigger value="federal" className="h-10 data-[state=active]:bg-background">Federal</TabsTrigger>
          <TabsTrigger value="w2" className="h-10 data-[state=active]:bg-background">W-2 Forms</TabsTrigger>
          <TabsTrigger value="1099" className="h-10 data-[state=active]:bg-background">1099 Forms</TabsTrigger>
        </TabsList>
        <TabsContent value="states" className="mt-4"><MultiStateTab year={year} /></TabsContent>
        <TabsContent value="federal" className="mt-4"><FederalTab year={year} /></TabsContent>
        <TabsContent value="w2" className="mt-4"><W2Tab year={year} /></TabsContent>
        <TabsContent value="1099" className="mt-4"><Form1099Tab year={year} /></TabsContent>
      </Tabs>
    </div>
  );
}

function FullTinBadge({ driverId, last4 }: { driverId: string; last4: string }) {
  const { data, isLoading } = useDriverTin(driverId);
  if (isLoading) return <Badge variant="outline">•••• {last4}</Badge>;
  const full = data?.tin ? formatTin(data.tin, data.tin_type) : null;
  return <Badge variant="outline" className="font-mono">{full || `•••• ${last4}`}</Badge>;
}
