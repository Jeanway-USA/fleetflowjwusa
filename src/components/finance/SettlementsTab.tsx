import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, FileText, Pencil, Trash2, Loader2, Eye, Upload } from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

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
  lcn_satellite_fees: number;
  prepass_scale_fees: number;
  insurance_liability: number;
  trailer_rental: number;
  plates_permits: number;
  cpp_benefits: number;
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

const DEDUCTION_FIELDS = [
  'fuel_advances', 'cash_advances', 'escrow_deduction',
  'lcn_satellite_fees', 'prepass_scale_fees', 'insurance_liability',
  'trailer_rental', 'plates_permits', 'cpp_benefits', 'other_deductions',
] as const;

const emptyFormData: Partial<Settlement> = {
  status: 'draft',
  gross_revenue: 0,
  driver_pay: 0,
  fuel_advances: 0,
  cash_advances: 0,
  escrow_deduction: 0,
  other_deductions: 0,
  lcn_satellite_fees: 0,
  prepass_scale_fees: 0,
  insurance_liability: 0,
  trailer_rental: 0,
  plates_permits: 0,
  cpp_benefits: 0,
  net_pay: 0,
};

function calcTotalDeductions(data: Partial<Settlement>): number {
  return DEDUCTION_FIELDS.reduce((sum, f) => sum + ((data[f] as number) || 0), 0);
}

function calcNetPay(data: Partial<Settlement>): number {
  return (data.driver_pay || 0) - calcTotalDeductions(data);
}

export function SettlementsTab() {
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [viewingSettlement, setViewingSettlement] = useState<Settlement | null>(null);
  const [formData, setFormData] = useState<Partial<Settlement>>({ ...emptyFormData });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

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
      const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
      const lastWeekEnd = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
      setFormData({
        ...emptyFormData,
        period_start: format(lastWeekStart, 'yyyy-MM-dd'),
        period_end: format(lastWeekEnd, 'yyyy-MM-dd'),
      });
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSettlement(null);
    setFormData({});
    setIsGenerating(false);
    setIsImporting(false);
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

      const driverLoads = loads.filter(load => {
        if (load.driver_id !== formData.driver_id) return false;
        if (!load.delivery_date) return false;
        const deliveryDate = parseISO(load.delivery_date);
        return deliveryDate >= periodStart && deliveryDate <= periodEnd;
      });

      const grossRevenue = driverLoads.reduce((sum, load) => sum + (load.net_revenue || 0), 0);

      let driverPay = 0;
      if (driver) {
        if (driver.pay_type === 'percentage') {
          driverPay = grossRevenue * ((driver.pay_rate || 0) / 100);
        } else if (driver.pay_type === 'per_mile') {
          driverPay = grossRevenue * 0.25;
        } else {
          driverPay = driver.pay_rate || 0;
        }
      }

      const loadIds = driverLoads.map(l => l.id);
      let cashAdvancesTotal = 0;
      let fuelAdvancesFromLoads = 0;
      if (loadIds.length > 0) {
        const { data: loadAdvances } = await supabase
          .from('fleet_loads')
          .select('advance_taken, fuel_advance')
          .in('id', loadIds);
        
        if (loadAdvances) {
          cashAdvancesTotal = loadAdvances.reduce((sum, l) => sum + (l.advance_taken || 0), 0);
          fuelAdvancesFromLoads = loadAdvances.reduce((sum, l) => sum + (l.fuel_advance || 0), 0);
        }
      }

      setFormData(prev => ({
        ...prev,
        gross_revenue: grossRevenue,
        driver_pay: driverPay,
        cash_advances: cashAdvancesTotal,
        fuel_advances: fuelAdvancesFromLoads || prev.fuel_advances || 0,
      }));

      toast.success(`Found ${driverLoads.length} loads totaling ${formatCurrency(grossRevenue)}${cashAdvancesTotal > 0 ? ` with ${formatCurrency(cashAdvancesTotal)} in advances` : ''}`);
    } catch (error) {
      console.error('Error generating settlement:', error);
      toast.error('Failed to generate settlement');
    } finally {
      setIsGenerating(false);
    }
  };

  // Import Landstar PDF
  const handleImportPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    setIsImporting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('parse-landstar-statement', {
        body: { pdfBase64: base64 },
      });

      if (error) throw error;

      // Map parsed expenses to settlement deduction fields
      const expenses = data.expenses || [];
      const mapped: Partial<Settlement> = {
        fuel_advances: 0,
        cash_advances: 0,
        escrow_deduction: 0,
        lcn_satellite_fees: 0,
        prepass_scale_fees: 0,
        insurance_liability: 0,
        trailer_rental: 0,
        plates_permits: 0,
        cpp_benefits: 0,
        other_deductions: 0,
      };

      for (const exp of expenses) {
        if (exp.is_discount || exp.is_reimbursement) continue;
        const amt = Math.abs(exp.amount || 0);
        const type = (exp.expense_type || '').toLowerCase();

        if (type === 'fuel' || type === 'def') {
          mapped.fuel_advances = (mapped.fuel_advances || 0) + amt;
        } else if (type === 'cash advance') {
          mapped.cash_advances = (mapped.cash_advances || 0) + amt;
        } else if (type === 'escrow payment') {
          mapped.escrow_deduction = (mapped.escrow_deduction || 0) + amt;
        } else if (type === 'lcn/satellite') {
          mapped.lcn_satellite_fees = (mapped.lcn_satellite_fees || 0) + amt;
        } else if (type === 'prepass/scale') {
          mapped.prepass_scale_fees = (mapped.prepass_scale_fees || 0) + amt;
        } else if (type === 'insurance') {
          mapped.insurance_liability = (mapped.insurance_liability || 0) + amt;
        } else if (type === 'trailer payment') {
          mapped.trailer_rental = (mapped.trailer_rental || 0) + amt;
        } else if (type === 'licensing/permits' || type === 'registration/plates') {
          mapped.plates_permits = (mapped.plates_permits || 0) + amt;
        } else if (type === 'cpp/benefits') {
          mapped.cpp_benefits = (mapped.cpp_benefits || 0) + amt;
        } else {
          mapped.other_deductions = (mapped.other_deductions || 0) + amt;
        }
      }

      setFormData(prev => ({
        ...prev,
        ...mapped,
        ...(data.period_start ? { period_start: data.period_start } : {}),
        ...(data.period_end ? { period_end: data.period_end } : {}),
      }));

      toast.success(`Imported ${expenses.length} items from Landstar statement`);
    } catch (error: any) {
      console.error('PDF import error:', error);
      toast.error(error.message || 'Failed to parse Landstar PDF');
    } finally {
      setIsImporting(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.driver_id || !formData.period_start || !formData.period_end) {
      toast.error('Please fill in required fields');
      return;
    }

    const netPay = calcNetPay(formData);

    const settlementData = {
      ...formData,
      net_pay: netPay,
    };

    if (editingSettlement) {
      updateMutation.mutate({ id: editingSettlement.id, ...settlementData });
    } else {
      const result = await createMutation.mutateAsync({
        ...settlementData,
        driver_id: formData.driver_id,
        period_start: formData.period_start,
        period_end: formData.period_end,
        org_id: orgId,
      });
      
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
            org_id: orgId,
          }));
          await createLineItemsMutation.mutateAsync(items);
        }
      }
    }
  };

  const revenueItems = lineItems.filter(item => item.category === 'revenue');

  // Helper for deduction input
  const DeductionInput = ({ field, label }: { field: keyof Settlement; label: string }) => (
    <div className="space-y-1">
      <Label htmlFor={field} className="text-xs">{label}</Label>
      <Input
        id={field}
        type="number"
        step="0.01"
        value={(formData[field] as number) || ''}
        onChange={(e) => setFormData({ ...formData, [field]: parseFloat(e.target.value) || 0 })}
        className="h-8 text-sm"
      />
    </div>
  );

  // Ledger deduction row (only renders if non-zero)
  const LedgerDeductionRow = ({ label, value, even }: { label: string; value: number; even?: boolean }) => {
    if (!value || value === 0) return null;
    return (
      <div className={`flex justify-between items-center py-1.5 px-2 ${even ? 'bg-muted/40' : ''}`}>
        <span className="text-sm">{label}</span>
        <span className="text-sm font-mono text-destructive">-{formatCurrency(value)}</span>
      </div>
    );
  };

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
                const totalDeductions = calcTotalDeductions(settlement);
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateSettlement}
                  disabled={isGenerating}
                  className="flex-1"
                >
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</>
                  ) : (
                    'Auto-Generate from Loads'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isImporting}
                  className="flex-1"
                >
                  {isImporting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importing...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Import Landstar PDF</>
                  )}
                </Button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleImportPDF}
                />
              </div>
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
              <h4 className="font-medium mb-1">Standard Deductions</h4>
              <div className="grid grid-cols-3 gap-3">
                <DeductionInput field="fuel_advances" label="Fuel Advances" />
                <DeductionInput field="cash_advances" label="Cash Advances" />
                <DeductionInput field="escrow_deduction" label="Escrow" />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-1">Landstar BCO Deductions</h4>
              <div className="grid grid-cols-3 gap-3">
                <DeductionInput field="lcn_satellite_fees" label="LCN/Satellite" />
                <DeductionInput field="prepass_scale_fees" label="PrePass/Scale" />
                <DeductionInput field="insurance_liability" label="Insurance/Liability" />
                <DeductionInput field="trailer_rental" label="Trailer Rental" />
                <DeductionInput field="plates_permits" label="Plates/Permits" />
                <DeductionInput field="cpp_benefits" label="CPP/Benefits" />
                <DeductionInput field="other_deductions" label="Other Deductions" />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                <span className="font-medium">Net Pay</span>
                <span className="text-xl font-bold text-primary font-mono">
                  {formatCurrency(calcNetPay(formData))}
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

      {/* View Settlement — Professional Ledger Sheet */}
      <Sheet open={!!viewingSettlement} onOpenChange={(open) => !open && setViewingSettlement(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto p-0">
          <div className="p-6">
            <SheetHeader>
              <SheetTitle className="text-base">Settlement Statement</SheetTitle>
            </SheetHeader>
          </div>
          {viewingSettlement && (
            <div className="px-6 pb-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold">{getDriverName(viewingSettlement.driver_id)}</h3>
                <StatusBadge status={viewingSettlement.status} />
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {format(parseISO(viewingSettlement.period_start), 'MMMM d')} – {format(parseISO(viewingSettlement.period_end), 'MMMM d, yyyy')}
              </p>

              <Separator />

              {/* Gross Revenue Section */}
              <div className="mt-4 mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Gross Revenue</h4>
                {revenueItems.length > 0 ? (
                  <div className="space-y-0">
                    {revenueItems.map((item, i) => (
                      <div key={item.id} className={`flex justify-between items-center py-1.5 px-2 ${i % 2 === 0 ? 'bg-muted/40' : ''}`}>
                        <span className="text-sm truncate mr-4">{item.description}</span>
                        <span className="text-sm font-mono text-primary whitespace-nowrap">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-between items-center py-1.5 px-2 bg-muted/40">
                    <span className="text-sm">Total Revenue</span>
                    <span className="text-sm font-mono text-primary">{formatCurrency(viewingSettlement.gross_revenue)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 px-2 border-t mt-1">
                  <span className="text-sm font-semibold">Subtotal — Revenue</span>
                  <span className="text-sm font-bold font-mono text-primary">{formatCurrency(viewingSettlement.gross_revenue)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-2">
                  <span className="text-sm">Driver Pay</span>
                  <span className="text-sm font-mono font-medium">{formatCurrency(viewingSettlement.driver_pay)}</span>
                </div>
              </div>

              <Separator />

              {/* Itemized Deductions Section */}
              <div className="mt-4 mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Deductions</h4>
                {(() => {
                  const advances = [
                    { label: 'Fuel Advances', value: viewingSettlement.fuel_advances },
                    { label: 'Cash Advances', value: viewingSettlement.cash_advances },
                    { label: 'Escrow', value: viewingSettlement.escrow_deduction },
                  ].filter(d => d.value && d.value !== 0);

                  const recurring = [
                    { label: 'LCN/Satellite Fees', value: viewingSettlement.lcn_satellite_fees },
                    { label: 'PrePass/Scale Fees', value: viewingSettlement.prepass_scale_fees },
                    { label: 'Insurance/Liability', value: viewingSettlement.insurance_liability },
                    { label: 'Trailer Rental', value: viewingSettlement.trailer_rental },
                    { label: 'Plates/Permits', value: viewingSettlement.plates_permits },
                    { label: 'CPP/Benefits', value: viewingSettlement.cpp_benefits },
                  ].filter(d => d.value && d.value !== 0);

                  const other = [
                    { label: 'Other Deductions', value: viewingSettlement.other_deductions },
                  ].filter(d => d.value && d.value !== 0);

                  let idx = 0;
                  const allDeductions = [...advances, ...recurring, ...other];

                  if (allDeductions.length === 0) {
                    return <p className="text-sm text-muted-foreground px-2 py-1">No deductions</p>;
                  }

                  return (
                    <div className="space-y-0">
                      {advances.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground px-2 pt-1 pb-0.5">Advances</p>
                          {advances.map(d => <LedgerDeductionRow key={d.label} label={d.label} value={d.value} even={(idx++) % 2 === 0} />)}
                        </>
                      )}
                      {recurring.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground px-2 pt-2 pb-0.5">Recurring Deductions</p>
                          {recurring.map(d => <LedgerDeductionRow key={d.label} label={d.label} value={d.value} even={(idx++) % 2 === 0} />)}
                        </>
                      )}
                      {other.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground px-2 pt-2 pb-0.5">Other</p>
                          {other.map(d => <LedgerDeductionRow key={d.label} label={d.label} value={d.value} even={(idx++) % 2 === 0} />)}
                        </>
                      )}
                    </div>
                  );
                })()}
                <div className="flex justify-between items-center py-2 px-2 border-t mt-1">
                  <span className="text-sm font-semibold">Subtotal — Deductions</span>
                  <span className="text-sm font-bold font-mono text-destructive">-{formatCurrency(calcTotalDeductions(viewingSettlement))}</span>
                </div>
              </div>

              <Separator />

              {/* Net Pay */}
              <div className="mt-4 border-t-2 border-b-2 border-foreground/20 py-3 px-2 flex justify-between items-center">
                <span className="text-base font-bold">NET PAY</span>
                <span className="text-xl font-bold font-mono text-primary">{formatCurrency(viewingSettlement.net_pay)}</span>
              </div>

              {viewingSettlement.notes && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
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
