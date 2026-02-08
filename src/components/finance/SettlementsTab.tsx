import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, FileText, Pencil, Trash2, Download, Loader2, Eye } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface Settlement {
  id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  gross_revenue: number;
  driver_pay: number;
  fuel_advances: number;
  cash_advances: number;
  escrow_deduction: number;
  other_deductions: number;
  net_pay: number;
  status: string;
  pdf_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SettlementLineItem {
  id: string;
  settlement_id: string;
  load_id: string | null;
  description: string;
  amount: number;
  category: string;
  created_at: string;
}

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  pay_type: string | null;
  pay_rate: number | null;
}

interface FleetLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  net_revenue: number | null;
  pickup_date: string | null;
  delivery_date: string | null;
  driver_id: string | null;
  status: string;
}

export function SettlementsTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [viewingSettlement, setViewingSettlement] = useState<Settlement | null>(null);
  const [formData, setFormData] = useState<Partial<Settlement>>({
    status: 'draft',
    gross_revenue: 0,
    driver_pay: 0,
    fuel_advances: 0,
    cash_advances: 0,
    escrow_deduction: 0,
    other_deductions: 0,
    net_pay: 0,
  });
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ['settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*')
        .order('period_end', { ascending: false });
      if (error) throw error;
      return data as Settlement[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-for-settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, pay_type, pay_rate')
        .order('first_name');
      if (error) throw error;
      return data as Driver[];
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['fleet-loads-for-settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, landstar_load_id, origin, destination, net_revenue, pickup_date, delivery_date, driver_id, status')
        .in('status', ['delivered', 'completed', 'invoiced'])
        .order('delivery_date', { ascending: false });
      if (error) throw error;
      return data as FleetLoad[];
    },
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ['settlement-line-items', viewingSettlement?.id],
    enabled: !!viewingSettlement,
    queryFn: async () => {
      if (!viewingSettlement) return [];
      const { data, error } = await supabase
        .from('settlement_line_items')
        .select('*')
        .eq('settlement_id', viewingSettlement.id)
        .order('created_at');
      if (error) throw error;
      return data as SettlementLineItem[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (settlement: { driver_id: string; period_start: string; period_end: string; [key: string]: any }) => {
      const { data, error } = await supabase.from('settlements').insert([settlement]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Settlement created');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Settlement> & { id: string }) => {
      const { error } = await supabase.from('settlements').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Settlement updated');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('settlements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements'] });
      toast.success('Settlement deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const createLineItemsMutation = useMutation({
    mutationFn: async (items: { settlement_id: string; description: string; amount: number; category: string; load_id?: string | null }[]) => {
      const { error } = await supabase.from('settlement_line_items').insert(items);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement-line-items'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : 'Unknown';
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const openDialog = (settlement?: Settlement) => {
    if (settlement) {
      setEditingSettlement(settlement);
      setFormData(settlement);
    } else {
      setEditingSettlement(null);
      // Default to last week's period
      const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
      setFormData({
        status: 'draft',
        period_start: format(lastWeekStart, 'yyyy-MM-dd'),
        period_end: format(lastWeekEnd, 'yyyy-MM-dd'),
        gross_revenue: 0,
        driver_pay: 0,
        fuel_advances: 0,
        cash_advances: 0,
        escrow_deduction: 0,
        other_deductions: 0,
        net_pay: 0,
      });
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSettlement(null);
    setFormData({});
    setIsGenerating(false);
  };

  // Auto-generate settlement from loads
  const generateSettlement = async () => {
    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error('Please select driver and date range first');
      return;
    }

    setIsGenerating(true);

    try {
      const driver = drivers.find(d => d.id === formData.driver_id);
      const periodStart = parseISO(formData.period_start);
      const periodEnd = parseISO(formData.period_end);

      // Find loads for this driver in the date range
      const driverLoads = loads.filter(load => {
        if (load.driver_id !== formData.driver_id) return false;
        if (!load.delivery_date) return false;
        const deliveryDate = parseISO(load.delivery_date);
        return deliveryDate >= periodStart && deliveryDate <= periodEnd;
      });

      // Calculate gross revenue
      const grossRevenue = driverLoads.reduce((sum, load) => sum + (load.net_revenue || 0), 0);

      // Calculate driver pay based on pay type
      let driverPay = 0;
      if (driver) {
        if (driver.pay_type === 'percentage') {
          driverPay = grossRevenue * ((driver.pay_rate || 0) / 100);
        } else if (driver.pay_type === 'per_mile') {
          driverPay = grossRevenue * 0.25; // Default 25% if per_mile
        } else {
          driverPay = driver.pay_rate || 0;
        }
      }

      // Auto-pull fuel advances from expenses
      const { data: fuelExpenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('expense_type', 'fuel')
        .gte('expense_date', formData.period_start)
        .lte('expense_date', formData.period_end);

      // Auto-pull cash advances (advance_taken from fleet_loads)
      const loadIds = driverLoads.map(l => l.id);
      let cashAdvancesTotal = 0;
      if (loadIds.length > 0) {
        const { data: loadAdvances } = await supabase
          .from('fleet_loads')
          .select('advance_taken, fuel_advance')
          .in('id', loadIds);
        
        if (loadAdvances) {
          cashAdvancesTotal = loadAdvances.reduce((sum, l) => sum + (l.advance_taken || 0), 0);
          const fuelAdvancesFromLoads = loadAdvances.reduce((sum, l) => sum + (l.fuel_advance || 0), 0);
          // Use fuel advances from loads if available
          if (fuelAdvancesFromLoads > 0) {
            setFormData(prev => ({ ...prev, fuel_advances: fuelAdvancesFromLoads }));
          }
        }
      }

      // Calculate net pay
      const fuelAdv = formData.fuel_advances || 0;
      const totalDeductions = fuelAdv + cashAdvancesTotal + 
                              (formData.escrow_deduction || 0) + 
                              (formData.other_deductions || 0);
      const netPay = driverPay - totalDeductions;

      setFormData(prev => ({
        ...prev,
        gross_revenue: grossRevenue,
        driver_pay: driverPay,
        cash_advances: cashAdvancesTotal,
        net_pay: netPay,
      }));

      toast.success(`Found ${driverLoads.length} loads totaling ${formatCurrency(grossRevenue)}${cashAdvancesTotal > 0 ? ` with ${formatCurrency(cashAdvancesTotal)} in advances` : ''}`);
    } catch (error) {
      console.error('Error generating settlement:', error);
      toast.error('Failed to generate settlement');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error('Please fill in required fields');
      return;
    }

    // Calculate net pay
    const totalDeductions = (formData.fuel_advances || 0) + 
                            (formData.cash_advances || 0) + 
                            (formData.escrow_deduction || 0) + 
                            (formData.other_deductions || 0);
    const netPay = (formData.driver_pay || 0) - totalDeductions;

    const settlementData = {
      ...formData,
      net_pay: netPay,
    };

    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error('Please select a driver and date range');
      return;
    }

    if (editingSettlement) {
      updateMutation.mutate({ id: editingSettlement.id, ...settlementData });
    } else {
      const result = await createMutation.mutateAsync({
        ...settlementData,
        driver_id: formData.driver_id,
        period_start: formData.period_start,
        period_end: formData.period_end,
      });
      
      // Create line items for each load
      if (result && formData.driver_id && formData.period_start && formData.period_end) {
        const periodStart = parseISO(formData.period_start);
        const periodEnd = parseISO(formData.period_end);
        
        const driverLoads = loads.filter(load => {
          if (load.driver_id !== formData.driver_id) return false;
          if (!load.delivery_date) return false;
          const deliveryDate = parseISO(load.delivery_date);
          return deliveryDate >= periodStart && deliveryDate <= periodEnd;
        });

        if (driverLoads.length > 0) {
          const items = driverLoads.map(load => ({
            settlement_id: result.id,
            load_id: load.id,
            description: `Load ${load.landstar_load_id || 'N/A'}: ${load.origin.split(',')[0]} → ${load.destination.split(',')[0]}`,
            amount: load.net_revenue || 0,
            category: 'revenue',
          }));
          await createLineItemsMutation.mutateAsync(items);
        }
      }
    }
  };

  const revenueItems = lineItems.filter(item => item.category === 'revenue');
  const deductionItems = lineItems.filter(item => item.category === 'deduction');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Driver Settlements</h3>
          <p className="text-sm text-muted-foreground">Generate and manage driver settlement statements</p>
        </div>
        <Button onClick={() => openDialog()} className="gap-2">
          <Plus className="h-4 w-4" /> New Settlement
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : settlements.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No settlements yet</p>
            <Button onClick={() => openDialog()} variant="outline" className="mt-4">
              Create First Settlement
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-elevated">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Gross Revenue</TableHead>
                <TableHead>Driver Pay</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Net Pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((settlement) => {
                const totalDeductions = (settlement.fuel_advances || 0) + 
                                       (settlement.cash_advances || 0) + 
                                       (settlement.escrow_deduction || 0) + 
                                       (settlement.other_deductions || 0);
                return (
                  <TableRow key={settlement.id}>
                    <TableCell className="font-medium">{getDriverName(settlement.driver_id)}</TableCell>
                    <TableCell>
                      {format(parseISO(settlement.period_start), 'MMM d')} - {format(parseISO(settlement.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{formatCurrency(settlement.gross_revenue)}</TableCell>
                    <TableCell>{formatCurrency(settlement.driver_pay)}</TableCell>
                    <TableCell className="text-destructive">-{formatCurrency(totalDeductions)}</TableCell>
                    <TableCell className="font-bold text-primary">{formatCurrency(settlement.net_pay)}</TableCell>
                    <TableCell><StatusBadge status={settlement.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setViewingSettlement(settlement)} title="View Details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openDialog(settlement)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(settlement.id)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSettlement ? 'Edit Settlement' : 'Generate Settlement'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="driver_id">Driver *</Label>
              <Select 
                value={formData.driver_id || ''} 
                onValueChange={(v) => setFormData({ ...formData, driver_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.first_name} {driver.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period_start">Period Start *</Label>
                <Input 
                  id="period_start" 
                  type="date" 
                  value={formData.period_start || ''} 
                  onChange={(e) => setFormData({ ...formData, period_start: e.target.value })} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_end">Period End *</Label>
                <Input 
                  id="period_end" 
                  type="date" 
                  value={formData.period_end || ''} 
                  onChange={(e) => setFormData({ ...formData, period_end: e.target.value })} 
                  required 
                />
              </div>
            </div>

            {!editingSettlement && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={generateSettlement} 
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Auto-Generate from Loads'
                )}
              </Button>
            )}

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Revenue</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gross_revenue">Gross Revenue</Label>
                  <Input 
                    id="gross_revenue" 
                    type="number" 
                    step="0.01"
                    value={formData.gross_revenue || ''} 
                    onChange={(e) => setFormData({ ...formData, gross_revenue: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driver_pay">Driver Pay</Label>
                  <Input 
                    id="driver_pay" 
                    type="number" 
                    step="0.01"
                    value={formData.driver_pay || ''} 
                    onChange={(e) => setFormData({ ...formData, driver_pay: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Deductions</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fuel_advances">Fuel Advances</Label>
                  <Input 
                    id="fuel_advances" 
                    type="number" 
                    step="0.01"
                    value={formData.fuel_advances || ''} 
                    onChange={(e) => setFormData({ ...formData, fuel_advances: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cash_advances">Cash Advances</Label>
                  <Input 
                    id="cash_advances" 
                    type="number" 
                    step="0.01"
                    value={formData.cash_advances || ''} 
                    onChange={(e) => setFormData({ ...formData, cash_advances: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="escrow_deduction">Escrow</Label>
                  <Input 
                    id="escrow_deduction" 
                    type="number" 
                    step="0.01"
                    value={formData.escrow_deduction || ''} 
                    onChange={(e) => setFormData({ ...formData, escrow_deduction: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="other_deductions">Other Deductions</Label>
                  <Input 
                    id="other_deductions" 
                    type="number" 
                    step="0.01"
                    value={formData.other_deductions || ''} 
                    onChange={(e) => setFormData({ ...formData, other_deductions: parseFloat(e.target.value) || 0 })} 
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="font-medium">Net Pay</span>
                <span className="text-xl font-bold text-primary">
                  {formatCurrency(
                    (formData.driver_pay || 0) - 
                    (formData.fuel_advances || 0) - 
                    (formData.cash_advances || 0) - 
                    (formData.escrow_deduction || 0) - 
                    (formData.other_deductions || 0)
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status || 'draft'} 
                onValueChange={(v) => setFormData({ ...formData, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                value={formData.notes || ''} 
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })} 
                placeholder="Additional notes..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingSettlement ? 'Save Changes' : 'Create Settlement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Settlement Sheet */}
      <Sheet open={!!viewingSettlement} onOpenChange={(open) => !open && setViewingSettlement(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Settlement Details</SheetTitle>
          </SheetHeader>
          {viewingSettlement && (
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Driver</p>
                <p className="font-medium">{getDriverName(viewingSettlement.driver_id)}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Period</p>
                <p className="font-medium">
                  {format(parseISO(viewingSettlement.period_start), 'MMMM d')} - {format(parseISO(viewingSettlement.period_end), 'MMMM d, yyyy')}
                </p>
              </div>

              {revenueItems.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Revenue Items ({revenueItems.length})</h4>
                  <div className="space-y-2">
                    {revenueItems.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm p-2 bg-muted rounded">
                        <span>{item.description}</span>
                        <span className="font-medium text-primary">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between">
                  <span>Gross Revenue</span>
                  <span className="font-medium">{formatCurrency(viewingSettlement.gross_revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Driver Pay</span>
                  <span className="font-medium">{formatCurrency(viewingSettlement.driver_pay)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Fuel Advances</span>
                  <span>-{formatCurrency(viewingSettlement.fuel_advances)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Cash Advances</span>
                  <span>-{formatCurrency(viewingSettlement.cash_advances)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Escrow</span>
                  <span>-{formatCurrency(viewingSettlement.escrow_deduction)}</span>
                </div>
                <div className="flex justify-between text-destructive">
                  <span>Other Deductions</span>
                  <span>-{formatCurrency(viewingSettlement.other_deductions)}</span>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <span className="font-bold">Net Pay</span>
                  <span className="font-bold text-xl text-primary">{formatCurrency(viewingSettlement.net_pay)}</span>
                </div>
              </div>

              {viewingSettlement.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{viewingSettlement.notes}</p>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button onClick={() => openDialog(viewingSettlement)} variant="outline" className="flex-1">
                  <Pencil className="h-4 w-4 mr-2" /> Edit
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
