import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Eye, Pencil, Loader2, Receipt, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { InvoicePreviewDialog } from './InvoicePreviewDialog';

export function InvoicingTab() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewLoad, setPreviewLoad] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'edit'>('preview');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: loads = [] } = useQuery({
    queryKey: ['invoiceable-loads', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*')
        .in('status', ['delivered'])
        .order('delivery_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const uninvoicedLoads = loads.filter(l => !l.invoice_status);
  const invoicedLoads = loads.filter(l => l.invoice_status === 'invoiced');

  const generateInvoice = useMutation({
    mutationFn: async (loadId: string) => {
      setGeneratingId(loadId);
      const load = loads.find(l => l.id === loadId);
      if (!load) throw new Error('Load not found');
      const invoiceNumber = `INV-${format(new Date(), 'yyyyMMdd')}-${loadId.slice(0, 6).toUpperCase()}`;
      const { error } = await supabase
        .from('fleet_loads')
        .update({
          invoice_status: 'invoiced',
          invoice_number: invoiceNumber,
          invoiced_at: new Date().toISOString(),
        } as any)
        .eq('id', loadId);
      if (error) throw error;
      return invoiceNumber;
    },
    onSuccess: async (invoiceNumber, loadId) => {
      queryClient.invalidateQueries({ queryKey: ['invoiceable-loads'] });
      toast.success(`Invoice ${invoiceNumber} generated`);
      // Send invoice email
      try {
        const { data } = await supabase.functions.invoke('send-invoice-email', {
          body: { load_id: loadId, override_email: overrideEmail || undefined },
        });
        if (data?.success) {
          toast.success(`Invoice emailed to ${data.recipientEmail}`);
        } else if (data?.error) {
          toast.warning(data.error);
        }
      } catch {
        toast.warning('Invoice generated but email could not be sent');
      }
      setGeneratingId(null);
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast.error(e.message || 'Failed to generate invoice');
      setGeneratingId(null);
    },
  });

  const updateInvoice = useMutation({
    mutationFn: async ({ loadId, amounts }: { loadId: string; amounts: Record<string, number> }) => {
      setGeneratingId(loadId);
      const { error } = await supabase
        .from('fleet_loads')
        .update({
          rate: amounts.rate,
          fuel_surcharge: amounts.fuel_surcharge,
          accessorials: amounts.accessorials,
          detention_pay: amounts.detention_pay,
          lumper: amounts.lumper,
          invoiced_at: new Date().toISOString(),
        })
        .eq('id', loadId);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoiceable-loads'] });
      toast.success('Invoice updated');
      // Resend invoice email
      try {
        const { data } = await supabase.functions.invoke('send-invoice-email', {
          body: { load_id: variables.loadId, override_email: overrideEmail || undefined },
        });
        if (data?.success) {
          toast.success(`Invoice resent to ${data.recipientEmail}`);
        } else if (data?.error) {
          toast.warning(data.error);
        }
      } catch {
        toast.warning('Invoice updated but email could not be sent');
      }
      setGeneratingId(null);
      setDialogOpen(false);
    },
    onError: (e: any) => {
      toast.error(e.message || 'Failed to update invoice');
      setGeneratingId(null);
    },
  });

  const openPreview = (load: any) => {
    setPreviewLoad(load);
    setPreviewMode('preview');
    setDialogOpen(true);
  };

  const openEdit = (load: any) => {
    setPreviewLoad(load);
    setPreviewMode('edit');
    setDialogOpen(true);
  };

  const handleDialogConfirm = (updatedAmounts?: Record<string, number>) => {
    if (!previewLoad) return;
    if (previewMode === 'edit' && updatedAmounts) {
      updateInvoice.mutate({ loadId: previewLoad.id, amounts: updatedAmounts });
    } else {
      generateInvoice.mutate(previewLoad.id);
    }
  };

  const getTotal = (load: any) =>
    (load.rate || 0) + (load.fuel_surcharge || 0) + (load.accessorials || 0) + (load.detention_pay || 0) + (load.lumper || 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Ready to Invoice</p>
                <p className="text-2xl font-bold">{uninvoicedLoads.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-emerald-600" />
              <div>
                <p className="text-sm text-muted-foreground">Invoiced</p>
                <p className="text-2xl font-bold">{invoicedLoads.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-8 w-8 text-amber-600" />
              <div>
                <p className="text-sm text-muted-foreground">Uninvoiced Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(uninvoicedLoads.reduce((sum, l) => sum + getTotal(l), 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Ready to Invoice ({uninvoicedLoads.length})</TabsTrigger>
          <TabsTrigger value="sent">Invoiced ({invoicedLoads.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Delivered Loads — Awaiting Invoice</CardTitle>
            </CardHeader>
            <CardContent>
              {uninvoicedLoads.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">All delivered loads have been invoiced.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Load</TableHead>
                      <TableHead className="hidden md:table-cell">Route</TableHead>
                      <TableHead className="hidden md:table-cell">Delivered</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uninvoicedLoads.map((load) => (
                      <TableRow key={load.id}>
                        <TableCell className="font-medium">{load.landstar_load_id || load.id.slice(0, 8)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{load.origin} → {load.destination}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {load.delivery_date ? format(parseISO(load.delivery_date), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell className="font-semibold">{formatCurrency(getTotal(load))}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => openPreview(load)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Preview Invoice
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sent" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sent Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {invoicedLoads.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No invoices generated yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Load</TableHead>
                      <TableHead className="hidden md:table-cell">Route</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="hidden md:table-cell">Invoiced On</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicedLoads.map((load: any) => (
                      <TableRow key={load.id}>
                        <TableCell className="font-mono text-sm">{load.invoice_number || '—'}</TableCell>
                        <TableCell>{load.landstar_load_id || load.id.slice(0, 8)}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">{load.origin} → {load.destination}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(getTotal(load))}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {load.invoiced_at ? format(parseISO(load.invoiced_at), 'MMM d, yyyy') : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Invoiced</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(load)}>
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <InvoicePreviewDialog
        load={previewLoad}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        mode={previewMode}
        onConfirm={handleDialogConfirm}
        confirming={!!generatingId}
      />
    </div>
  );
}
