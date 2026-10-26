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
// Employer identity card
// -----------------------------------------------------------
export function EmployerCard() {
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

