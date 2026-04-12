import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { Package, CheckCircle, DollarSign, Clock, Send, Banknote, FileCheck2, Camera, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export function FactoringTab() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedLoadIds, setSelectedLoadIds] = useState<Set<string>>(new Set());

  // Fetch org factoring settings
  const { data: orgSettings } = useQuery({
    queryKey: ['org-factoring-settings', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('factoring_enabled, factoring_fee_percentage, factoring_provider_name, factoring_remit_address')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch all invoiced/factoring loads
  const { data: loads = [] } = useQuery({
    queryKey: ['factoring-loads', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*')
        .eq('invoice_status', 'invoiced')
        .order('invoiced_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch document presence for all loads (rate_confirmation + pod)
  const loadIds = loads.map((l: any) => l.id);
  const { data: loadDocs = [] } = useQuery({
    queryKey: ['factoring-load-docs', loadIds],
    queryFn: async () => {
      if (loadIds.length === 0) return [];
      const { data, error } = await supabase
        .from('documents')
        .select('related_id, document_type')
        .in('related_id', loadIds)
        .in('document_type', ['rate_confirmation', 'pod']);
      if (error) throw error;
      return data || [];
    },
    enabled: loadIds.length > 0,
  });

  // Build a map: loadId -> { hasRateCon, hasPOD }
  const docMap = new Map<string, { hasRateCon: boolean; hasPOD: boolean }>();
  for (const doc of loadDocs) {
    const entry = docMap.get(doc.related_id!) || { hasRateCon: false, hasPOD: false };
    if (doc.document_type === 'rate_confirmation') entry.hasRateCon = true;
    if (doc.document_type === 'pod') entry.hasPOD = true;
    docMap.set(doc.related_id!, entry);
  }

  const readyLoads = loads.filter((l: any) => !l.factoring_status);
  const submittedLoads = loads.filter((l: any) => l.factoring_status === 'submitted');
  const fundedLoads = loads.filter((l: any) => l.factoring_status === 'funded');

  const feePercent = orgSettings?.factoring_fee_percentage || 0;

  // Summary stats
  const submittedTotal = submittedLoads.reduce((sum: number, l: any) => sum + (l.gross_revenue || l.rate || 0), 0);
  const fundedTotal = fundedLoads.reduce((sum: number, l: any) => sum + (l.gross_revenue || l.rate || 0), 0);
  const fundedNet = fundedLoads.reduce((sum: number, l: any) => {
    const gross = l.gross_revenue || l.rate || 0;
    return sum + gross * (1 - feePercent / 100);
  }, 0);

  // Selected batch summary
  const selectedLoads = readyLoads.filter((l: any) => selectedLoadIds.has(l.id));
  const selectedGross = selectedLoads.reduce((sum: number, l: any) => sum + (l.gross_revenue || l.rate || 0), 0);
  const selectedFee = selectedGross * (feePercent / 100);
  const selectedNet = selectedGross - selectedFee;

  // Bulk submit mutation
  const bulkSubmitMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const batchId = `FACT-${format(new Date(), 'yyyyMMdd')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { error } = await supabase
        .from('fleet_loads')
        .update({ factoring_status: 'submitted', factoring_submission_id: batchId } as any)
        .in('id', ids);
      if (error) throw error;
      return batchId;
    },
    onSuccess: (batchId) => {
      queryClient.invalidateQueries({ queryKey: ['factoring-loads'] });
      setSelectedLoadIds(new Set());
      toast.success(`Submitted ${selectedLoadIds.size} loads to factoring`, { description: `Batch: ${batchId}` });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Mark funded mutation
  const markFundedMutation = useMutation({
    mutationFn: async (loadId: string) => {
      const { error } = await supabase
        .from('fleet_loads')
        .update({ factoring_status: 'funded' } as any)
        .eq('id', loadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factoring-loads'] });
      toast.success('Load marked as funded');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleLoad = (id: string) => {
    setSelectedLoadIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    // Only toggle loads that have POD
    const eligibleLoads = readyLoads.filter((l: any) => {
      const docs = docMap.get(l.id);
      return docs?.hasPOD !== false; // allow if no doc record or has POD
    });
    if (selectedLoadIds.size === eligibleLoads.length && eligibleLoads.length > 0) {
      setSelectedLoadIds(new Set());
    } else {
      setSelectedLoadIds(new Set(eligibleLoads.map((l: any) => l.id)));
    }
  };

  if (!orgSettings?.factoring_enabled) {
    return (
      <Card className="card-elevated">
        <CardContent className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Factoring Not Enabled</h3>
          <p className="text-muted-foreground">
            Enable factoring in Settings → Company to start submitting invoices to your factoring company.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getLoadTotal = (load: any) => load.gross_revenue || load.rate || 0;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Ready to Submit</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{readyLoads.length}</div>
              <p className="text-xs text-muted-foreground">invoiced loads</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Submitted</CardTitle>
              <Send className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{submittedLoads.length}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(submittedTotal)} pending</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Funded Total</CardTitle>
              <Banknote className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{formatCurrency(fundedNet)}</div>
              <p className="text-xs text-muted-foreground">after {feePercent}% fee</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Factoring Fee</CardTitle>
              <DollarSign className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{formatCurrency(fundedTotal - fundedNet)}</div>
              <p className="text-xs text-muted-foreground">{feePercent}% of {formatCurrency(fundedTotal)}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="ready">
          <TabsList>
            <TabsTrigger value="ready">Ready ({readyLoads.length})</TabsTrigger>
            <TabsTrigger value="submitted">Submitted ({submittedLoads.length})</TabsTrigger>
            <TabsTrigger value="funded">Funded ({fundedLoads.length})</TabsTrigger>
          </TabsList>

          {/* Ready to Submit */}
          <TabsContent value="ready" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Load Table */}
              <Card className="card-elevated lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Ready to Submit</CardTitle>
                    <CardDescription>Select invoiced loads to submit to {orgSettings.factoring_provider_name || 'factoring'}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {readyLoads.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No invoiced loads ready for factoring</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedLoadIds.size > 0 && selectedLoadIds.size === readyLoads.filter((l: any) => docMap.get(l.id)?.hasPOD !== false).length}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead>Load ID</TableHead>
                          <TableHead>Route</TableHead>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Docs</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {readyLoads.map((load: any) => {
                          const docs = docMap.get(load.id) || { hasRateCon: false, hasPOD: false };
                          const missingPOD = !docs.hasPOD;

                          const checkbox = (
                            <Checkbox
                              checked={selectedLoadIds.has(load.id)}
                              onCheckedChange={() => toggleLoad(load.id)}
                              disabled={missingPOD}
                            />
                          );

                          return (
                            <TableRow key={load.id} className={missingPOD ? 'opacity-60' : ''}>
                              <TableCell>
                                {missingPOD ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>{checkbox}</TooltipTrigger>
                                    <TooltipContent side="right" className="flex items-center gap-1.5">
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                      POD required before factoring
                                    </TooltipContent>
                                  </Tooltip>
                                ) : checkbox}
                              </TableCell>
                              <TableCell className="font-mono text-sm">{load.landstar_load_id || load.id.slice(0, 8)}</TableCell>
                              <TableCell className="text-sm">{load.origin} → {load.destination}</TableCell>
                              <TableCell className="text-sm">{load.invoice_number || '—'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="flex items-center gap-1 text-xs">
                                    <FileCheck2 className={`h-3.5 w-3.5 ${docs.hasRateCon ? 'text-green-600' : 'text-muted-foreground'}`} />
                                  </span>
                                  <span className="flex items-center gap-1 text-xs">
                                    <Camera className={`h-3.5 w-3.5 ${docs.hasPOD ? 'text-green-600' : 'text-destructive'}`} />
                                    {missingPOD && (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Missing</Badge>
                                    )}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(getLoadTotal(load))}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Batch Summary Sidebar */}
              <Card className="card-elevated flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Batch Summary</CardTitle>
                  {orgSettings.factoring_provider_name && (
                    <CardDescription>{orgSettings.factoring_provider_name}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Loads Selected</span>
                      <span className="font-semibold">{selectedLoads.length}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Total Gross</span>
                      <span className="font-semibold">{formatCurrency(selectedGross)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b">
                      <span className="text-sm text-muted-foreground">Factoring Fee ({feePercent}%)</span>
                      <span className="font-semibold text-destructive">-{formatCurrency(selectedFee)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium">Estimated Net Payout</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(selectedNet)}</span>
                    </div>

                    {selectedLoads.length > 0 && (
                      <div className="rounded-lg border p-3 space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Included Loads</p>
                        {selectedLoads.map((l: any) => (
                          <div key={l.id} className="flex items-center justify-between text-sm">
                            <span>{l.landstar_load_id || l.id.slice(0, 8)}</span>
                            <span className="text-muted-foreground">{formatCurrency(getLoadTotal(l))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => bulkSubmitMutation.mutate(Array.from(selectedLoadIds))}
                    disabled={selectedLoads.length === 0 || bulkSubmitMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Submit to Factoring
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Submitted */}
          <TabsContent value="submitted" className="mt-4">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Submitted to Factoring</CardTitle>
                <CardDescription>Awaiting funding from {orgSettings.factoring_provider_name || 'factoring company'}</CardDescription>
              </CardHeader>
              <CardContent>
                {submittedLoads.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No submitted loads</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load ID</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Net (after fee)</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submittedLoads.map((load: any) => {
                        const gross = getLoadTotal(load);
                        const net = gross * (1 - feePercent / 100);
                        return (
                          <TableRow key={load.id}>
                            <TableCell className="font-mono text-sm">{load.landstar_load_id || load.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-sm">{load.origin} → {load.destination}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">{load.factoring_submission_id || '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(gross)}</TableCell>
                            <TableCell className="text-right text-success font-medium">{formatCurrency(net)}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markFundedMutation.mutate(load.id)}
                                disabled={markFundedMutation.isPending}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Mark Funded
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Funded */}
          <TabsContent value="funded" className="mt-4">
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Funded Loads</CardTitle>
                <CardDescription>Completed factoring transactions</CardDescription>
              </CardHeader>
              <CardContent>
                {fundedLoads.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No funded loads yet</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load ID</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Fee ({feePercent}%)</TableHead>
                        <TableHead className="text-right">Net Funded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fundedLoads.map((load: any) => {
                        const gross = getLoadTotal(load);
                        const fee = gross * (feePercent / 100);
                        const net = gross - fee;
                        return (
                          <TableRow key={load.id}>
                            <TableCell className="font-mono text-sm">{load.landstar_load_id || load.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-sm">{load.origin} → {load.destination}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-xs">{load.factoring_submission_id || '—'}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(gross)}</TableCell>
                            <TableCell className="text-right text-destructive">{formatCurrency(fee)}</TableCell>
                            <TableCell className="text-right text-success font-medium">{formatCurrency(net)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
