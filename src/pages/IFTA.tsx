import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Download, Fuel, Route, DollarSign, Calculator, Pencil, Trash2, MapPin, Link2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { US_STATES } from '@/lib/us-states';
import { Badge } from '@/components/ui/badge';

interface IFTARecord {
  id: string;
  quarter: string;
  jurisdiction: string;
  total_miles: number;
  taxable_miles: number;
  fuel_gallons: number;
  fuel_cost: number;
  tax_rate: number;
  tax_owed: number;
  truck_id: string | null;
  created_at: string;
}

interface FuelPurchase {
  id: string;
  purchase_date: string;
  truck_id: string | null;
  driver_id: string | null;
  jurisdiction: string;
  gallons: number;
  price_per_gallon: number;
  total_cost: number;
  vendor: string | null;
  receipt_url: string | null;
  source_expense_id: string | null;
  created_at: string;
}

// US_STATES is now imported from @/lib/us-states

const QUARTERS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4', '2025-Q4', '2025-Q3'];

export default function IFTA() {
  const queryClient = useQueryClient();
  const [selectedQuarter, setSelectedQuarter] = useState('2026-Q1');
  const [selectedTruck, setSelectedTruck] = useState<string>('all');
  const [fuelDialogOpen, setFuelDialogOpen] = useState(false);
  const [editingFuel, setEditingFuel] = useState<FuelPurchase | null>(null);
  const [fuelFormData, setFuelFormData] = useState<Partial<FuelPurchase>>({});

  const { data: trucks = [] } = useQuery({
    queryKey: ['trucks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('trucks').select('id, unit_number');
      if (error) throw error;
      return data;
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('id, first_name, last_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: fuelPurchases = [], isLoading: fuelLoading } = useQuery({
    queryKey: ['fuel_purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fuel_purchases')
        .select('*')
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return data as FuelPurchase[];
    },
  });

  const { data: iftaRecords = [] } = useQuery({
    queryKey: ['ifta_records', selectedQuarter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ifta_records')
        .select('*')
        .eq('quarter', selectedQuarter)
        .order('jurisdiction');
      if (error) throw error;
      return data as IFTARecord[];
    },
  });

  const { data: loads = [] } = useQuery({
    queryKey: ['fleet_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fleet_loads').select('*');
      if (error) throw error;
      return data;
    },
  });

  const createFuelMutation = useMutation({
    mutationFn: async (purchase: Partial<FuelPurchase>) => {
      const { error } = await supabase.from('fuel_purchases').insert(purchase as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      toast.success('Fuel purchase added');
      closeFuelDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateFuelMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FuelPurchase> & { id: string }) => {
      const { error } = await supabase.from('fuel_purchases').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      toast.success('Fuel purchase updated');
      closeFuelDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteFuelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fuel_purchases').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fuel_purchases'] });
      toast.success('Fuel purchase deleted');
    },
    onError: (error) => toast.error(error.message),
  });

  const openFuelDialog = (purchase?: FuelPurchase) => {
    setEditingFuel(purchase || null);
    setFuelFormData(purchase || { 
      purchase_date: format(new Date(), 'yyyy-MM-dd'),
      gallons: 0,
      price_per_gallon: 0,
      total_cost: 0,
    });
    setFuelDialogOpen(true);
  };

  const closeFuelDialog = () => {
    setFuelDialogOpen(false);
    setEditingFuel(null);
    setFuelFormData({});
  };

  const handleFuelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fuelFormData.jurisdiction || !fuelFormData.gallons) {
      toast.error('State and gallons are required');
      return;
    }
    if (editingFuel) {
      updateFuelMutation.mutate({ id: editingFuel.id, ...fuelFormData });
    } else {
      createFuelMutation.mutate(fuelFormData);
    }
  };

  const getTruckName = (truckId: string | null) => {
    if (!truckId) return '-';
    const truck = trucks.find(t => t.id === truckId);
    return truck ? `#${truck.unit_number}` : '-';
  };

  const getDriverName = (driverId: string | null) => {
    if (!driverId) return '-';
    const driver = drivers.find(d => d.id === driverId);
    return driver ? `${driver.first_name} ${driver.last_name}` : '-';
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  // Filter fuel purchases by quarter
  const filteredFuelPurchases = fuelPurchases.filter(fp => {
    if (selectedTruck !== 'all' && fp.truck_id !== selectedTruck) return false;
    // Simple quarter filtering based on purchase_date
    const date = parseISO(fp.purchase_date);
    const [year, q] = selectedQuarter.split('-');
    const quarter = parseInt(q.replace('Q', ''));
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 3;
    return date.getFullYear() === parseInt(year) && 
           date.getMonth() >= startMonth && 
           date.getMonth() < endMonth;
  });

  // Calculate summary stats
  const summary = {
    totalMiles: iftaRecords.reduce((s, r) => s + r.total_miles, 0),
    totalGallons: filteredFuelPurchases.reduce((s, p) => s + p.gallons, 0),
    totalFuelCost: filteredFuelPurchases.reduce((s, p) => s + p.total_cost, 0),
    taxOwed: iftaRecords.reduce((s, r) => s + r.tax_owed, 0),
  };

  const avgMpg = summary.totalGallons > 0 ? summary.totalMiles / summary.totalGallons : 0;

  // Aggregate fuel by state for summary
  const fuelByState = filteredFuelPurchases.reduce((acc, fp) => {
    if (!acc[fp.jurisdiction]) {
      acc[fp.jurisdiction] = { gallons: 0, cost: 0 };
    }
    acc[fp.jurisdiction].gallons += fp.gallons;
    acc[fp.jurisdiction].cost += fp.total_cost;
    return acc;
  }, {} as Record<string, { gallons: number; cost: number }>);

  const exportToCSV = () => {
    const headers = ['State', 'Total Miles', 'Taxable Miles', 'Fuel Gallons', 'Fuel Cost', 'Tax Rate', 'Tax Owed'];
    const rows = iftaRecords.map(r => [
      r.jurisdiction,
      r.total_miles,
      r.taxable_miles,
      r.fuel_gallons.toFixed(2),
      r.fuel_cost.toFixed(2),
      r.tax_rate.toFixed(4),
      r.tax_owed.toFixed(2)
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IFTA_${selectedQuarter}.csv`;
    a.click();
    toast.success('IFTA report exported');
  };

  return (
    <DashboardLayout>
      <PageHeader 
        title="IFTA Reporting" 
        description="Track fuel purchases and mileage by jurisdiction for quarterly IFTA tax filing"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select quarter" />
          </SelectTrigger>
          <SelectContent>
            {QUARTERS.map(q => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTruck} onValueChange={setSelectedTruck}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select truck" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trucks</SelectItem>
            {trucks.map(t => (
              <SelectItem key={t.id} value={t.id}>#{t.unit_number}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Miles</CardTitle>
            <Route className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalMiles.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">All jurisdictions</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Gallons</CardTitle>
            <Fuel className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalGallons.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Fuel purchased</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Average MPG</CardTitle>
            <Calculator className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMpg.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Fleet efficiency</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tax Liability</CardTitle>
            <DollarSign className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.taxOwed >= 0 ? 'text-destructive' : 'text-success'}`}>
              {formatCurrency(Math.abs(summary.taxOwed))}
            </div>
            <p className="text-xs text-muted-foreground">{summary.taxOwed >= 0 ? 'Owed' : 'Credit'}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="fuel" className="w-full">
        <TabsList>
          <TabsTrigger value="fuel">Fuel Purchases</TabsTrigger>
          <TabsTrigger value="summary">Jurisdiction Summary</TabsTrigger>
          <TabsTrigger value="report">IFTA Report</TabsTrigger>
        </TabsList>

        <TabsContent value="fuel" className="mt-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Fuel Purchases</CardTitle>
                <CardDescription>Track all fuel purchases with jurisdiction</CardDescription>
              </div>
              <Button onClick={() => openFuelDialog()} className="gradient-gold text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" />
                Add Fuel Purchase
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Gallons</TableHead>
                    <TableHead className="text-right">$/Gallon</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fuelLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : filteredFuelPurchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No fuel purchases for this quarter
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredFuelPurchases.map(fp => (
                      <TableRow key={fp.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {format(parseISO(fp.purchase_date), 'MM/dd/yyyy')}
                            {fp.source_expense_id && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-primary/30 text-primary">
                                <Link2 className="h-2.5 w-2.5 mr-0.5" />
                                synced
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {fp.jurisdiction}
                          </div>
                        </TableCell>
                        <TableCell>{getTruckName(fp.truck_id)}</TableCell>
                        <TableCell>{getDriverName(fp.driver_id)}</TableCell>
                        <TableCell>{fp.vendor || '-'}</TableCell>
                        <TableCell className="text-right">{fp.gallons.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${fp.price_per_gallon.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(fp.total_cost)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openFuelDialog(fp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteFuelMutation.mutate(fp.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Fuel by Jurisdiction</CardTitle>
              <CardDescription>Summary of fuel purchases by state for {selectedQuarter}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Gallons</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Avg $/Gallon</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(fuelByState).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No fuel data for this quarter
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.entries(fuelByState)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([state, data]) => (
                        <TableRow key={state}>
                          <TableCell className="font-medium">{state}</TableCell>
                          <TableCell className="text-right">{data.gallons.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(data.cost)}</TableCell>
                          <TableCell className="text-right">${(data.cost / data.gallons).toFixed(3)}</TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-6">
          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>IFTA Report - {selectedQuarter}</CardTitle>
                <CardDescription>Jurisdiction mileage and tax summary for filing</CardDescription>
              </div>
              <Button onClick={exportToCSV} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              {iftaRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No IFTA records for {selectedQuarter}</p>
                  <p className="text-sm mt-2">Records are generated from fleet load data</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jurisdiction</TableHead>
                      <TableHead className="text-right">Total Miles</TableHead>
                      <TableHead className="text-right">Taxable Miles</TableHead>
                      <TableHead className="text-right">Fuel Gallons</TableHead>
                      <TableHead className="text-right">Fuel Cost</TableHead>
                      <TableHead className="text-right">Tax Rate</TableHead>
                      <TableHead className="text-right">Tax Owed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {iftaRecords.map(record => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.jurisdiction}</TableCell>
                        <TableCell className="text-right">{record.total_miles.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{record.taxable_miles.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{record.fuel_gallons.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(record.fuel_cost)}</TableCell>
                        <TableCell className="text-right">${record.tax_rate.toFixed(4)}</TableCell>
                        <TableCell className={`text-right font-medium ${record.tax_owed >= 0 ? 'text-destructive' : 'text-success'}`}>
                          {formatCurrency(record.tax_owed)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>TOTAL</TableCell>
                      <TableCell className="text-right">{summary.totalMiles.toLocaleString()}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">{iftaRecords.reduce((s, r) => s + r.fuel_gallons, 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(iftaRecords.reduce((s, r) => s + r.fuel_cost, 0))}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className={`text-right ${summary.taxOwed >= 0 ? 'text-destructive' : 'text-success'}`}>
                        {formatCurrency(summary.taxOwed)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Fuel Dialog */}
      <Dialog open={fuelDialogOpen} onOpenChange={setFuelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFuel ? 'Edit Fuel Purchase' : 'Add Fuel Purchase'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFuelSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Purchase Date</Label>
                <Input
                  type="date"
                  value={fuelFormData.purchase_date || ''}
                  onChange={(e) => setFuelFormData({ ...fuelFormData, purchase_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>State/Jurisdiction *</Label>
                <Select 
                  value={fuelFormData.jurisdiction || ''} 
                  onValueChange={(v) => setFuelFormData({ ...fuelFormData, jurisdiction: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Truck</Label>
                <Select 
                  value={fuelFormData.truck_id || 'none'} 
                  onValueChange={(v) => setFuelFormData({ ...fuelFormData, truck_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {trucks.map(t => (
                      <SelectItem key={t.id} value={t.id}>#{t.unit_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select 
                  value={fuelFormData.driver_id || 'none'} 
                  onValueChange={(v) => setFuelFormData({ ...fuelFormData, driver_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vendor/Station</Label>
              <Input
                value={fuelFormData.vendor || ''}
                onChange={(e) => setFuelFormData({ ...fuelFormData, vendor: e.target.value })}
                placeholder="e.g., Pilot, Love's, TA"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Gallons *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fuelFormData.gallons || ''}
                  onChange={(e) => {
                    const gallons = parseFloat(e.target.value) || 0;
                    const ppg = fuelFormData.price_per_gallon || 0;
                    setFuelFormData({ 
                      ...fuelFormData, 
                      gallons, 
                      total_cost: gallons * ppg 
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Price/Gallon</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={fuelFormData.price_per_gallon || ''}
                  onChange={(e) => {
                    const ppg = parseFloat(e.target.value) || 0;
                    const gallons = fuelFormData.gallons || 0;
                    setFuelFormData({ 
                      ...fuelFormData, 
                      price_per_gallon: ppg, 
                      total_cost: gallons * ppg 
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={fuelFormData.total_cost || ''}
                  onChange={(e) => setFuelFormData({ ...fuelFormData, total_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeFuelDialog}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">
                {editingFuel ? 'Update' : 'Add'} Purchase
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
