import { useState, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { CurrencyInput, IntegerInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { Building2, DollarSign, MapPin, Truck, Plus, X, Upload, Package, Clock } from 'lucide-react';
import { TimezoneSelect } from '@/components/shared/TimezoneSelect';
import { combineToUtc, guessTimezoneFromLocation } from '@/lib/datetime';
import { useTimeDisplay } from '@/contexts/TimeDisplayContext';

const BROKER_SUGGESTIONS = [
  'CH Robinson',
  'TQL - Total Quality Logistics',
  'Coyote Logistics',
  'Echo Global Logistics',
  'XPO Logistics',
  'Schneider',
  'JB Hunt',
  'Landstar',
  'DAT Load Board',
  'Convoy',
];

const EQUIPMENT_TYPES = [
  { value: 'dry_van', label: "53' Dry Van" },
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'reefer', label: 'Reefer' },
  { value: 'step_deck', label: 'Step Deck' },
  { value: 'power_only', label: 'Power Only' },
];

interface Stop {
  id: string;
  facility_name: string;
  address: string;
  date: string;
  time: string;
}

interface IndependentLoadBuilderProps {
  onSave: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
}

export function IndependentLoadBuilder({ onSave, onCancel, initialData }: IndependentLoadBuilderProps) {
  // Tab 1 state
  const [brokerName, setBrokerName] = useState(initialData?.broker_name || '');
  const [brokerOpen, setBrokerOpen] = useState(false);
  const [brokerPO, setBrokerPO] = useState(initialData?.landstar_load_id || '');
  const [linehaul, setLinehaul] = useState(initialData?.rate?.toString() || '');
  const [accessorialPay, setAccessorialPay] = useState(initialData?.accessorial_pay?.toString() || '');
  const [factoringApproved, setFactoringApproved] = useState(initialData?.factoring_approved || false);

  // Tab 2 state
  const [shipperFacility, setShipperFacility] = useState(initialData?.shipper_facility || '');
  const [shipperAddress, setShipperAddress] = useState(initialData?.origin || '');
  const [shipperDate, setShipperDate] = useState(initialData?.pickup_date || '');
  const [shipperTime, setShipperTime] = useState(initialData?.pickup_time || '');
  const [shipperTz, setShipperTz] = useState<string>(initialData?.pickup_tz || '');
  const [consigneeFacility, setConsigneeFacility] = useState(initialData?.consignee_facility || '');
  const [consigneeAddress, setConsigneeAddress] = useState(initialData?.destination || '');
  const [consigneeDate, setConsigneeDate] = useState(initialData?.delivery_date || '');
  const [consigneeTime, setConsigneeTime] = useState(initialData?.delivery_time || '');
  const [consigneeTz, setConsigneeTz] = useState<string>(initialData?.delivery_tz || '');
  const [intermediateStops, setIntermediateStops] = useState<Stop[]>([]);

  // Auto-guess timezone from typed origin/destination state until the user
  // overrides it. Once they pick a TZ explicitly, we stop touching it.
  const { companyTz } = useTimeDisplay();
  const [shipperTzTouched, setShipperTzTouched] = useState<boolean>(!!initialData?.pickup_tz);
  const [consigneeTzTouched, setConsigneeTzTouched] = useState<boolean>(!!initialData?.delivery_tz);
  useEffect(() => {
    if (shipperTzTouched) return;
    const guess = guessTimezoneFromLocation(shipperAddress) || companyTz;
    if (guess && guess !== shipperTz) setShipperTz(guess);
  }, [shipperAddress, shipperTzTouched, companyTz, shipperTz]);
  useEffect(() => {
    if (consigneeTzTouched) return;
    const guess = guessTimezoneFromLocation(consigneeAddress) || companyTz;
    if (guess && guess !== consigneeTz) setConsigneeTz(guess);
  }, [consigneeAddress, consigneeTzTouched, companyTz, consigneeTz]);

  // Tab 3 state
  const [weight, setWeight] = useState(initialData?.weight?.toString() || '');
  const [commodity, setCommodity] = useState(initialData?.commodity || '');
  const [equipment, setEquipment] = useState(initialData?.equipment || 'dry_van');
  const [rateConFile, setRateConFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalGross = useMemo(() => {
    return (parseFloat(linehaul) || 0) + (parseFloat(accessorialPay) || 0);
  }, [linehaul, accessorialPay]);

  const filteredBrokers = useMemo(() => {
    if (!brokerName) return BROKER_SUGGESTIONS;
    return BROKER_SUGGESTIONS.filter(b => b.toLowerCase().includes(brokerName.toLowerCase()));
  }, [brokerName]);

  const addIntermediateStop = () => {
    setIntermediateStops(prev => [...prev, {
      id: crypto.randomUUID(),
      facility_name: '',
      address: '',
      date: '',
      time: '',
    }]);
  };

  const removeStop = (id: string) => {
    setIntermediateStops(prev => prev.filter(s => s.id !== id));
  };

  const updateStop = (id: string, field: keyof Stop, value: string) => {
    setIntermediateStops(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const handleSave = () => {
    const effShipperTz = shipperTz || companyTz;
    const effConsigneeTz = consigneeTz || companyTz;
    onSave({
      broker_name: brokerName,
      landstar_load_id: brokerPO,
      rate: parseFloat(linehaul) || 0,
      fuel_surcharge: 0,
      accessorial_pay: parseFloat(accessorialPay) || 0,
      factoring_approved: factoringApproved,
      origin: shipperAddress,
      destination: consigneeAddress,
      // Legacy (kept for one release; existing readers still work)
      pickup_date: shipperDate,
      pickup_time: shipperTime,
      delivery_date: consigneeDate,
      delivery_time: consigneeTime,
      // New UTC + IANA tz columns
      pickup_at: combineToUtc(shipperDate, shipperTime, effShipperTz),
      pickup_tz: effShipperTz,
      delivery_at: combineToUtc(consigneeDate, consigneeTime, effConsigneeTz),
      delivery_tz: effConsigneeTz,
      intermediate_stops: intermediateStops,
      shipper_facility: shipperFacility,
      consignee_facility: consigneeFacility,
      weight: parseFloat(weight) || 0,
      commodity,
      equipment,
      rate_con_file: rateConFile,
      status: 'pending',
    });
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <Tabs defaultValue="broker" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="broker" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">1. Broker & Rate</span>
              <span className="sm:hidden">1. Broker</span>
            </TabsTrigger>
            <TabsTrigger value="route" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">2. Route & Stops</span>
              <span className="sm:hidden">2. Route</span>
            </TabsTrigger>
            <TabsTrigger value="equipment" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              <span className="hidden sm:inline">3. Equipment & Docs</span>
              <span className="sm:hidden">3. Equip</span>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Broker & Rate */}
          <TabsContent value="broker" className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="broker_name" className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                Brokerage Name
              </Label>
              <Popover open={brokerOpen} onOpenChange={setBrokerOpen}>
                <PopoverTrigger asChild>
                  <Input
                    id="broker_name"
                    value={brokerName}
                    onChange={(e) => {
                      setBrokerName(e.target.value);
                      setBrokerOpen(true);
                    }}
                    onFocus={() => setBrokerOpen(true)}
                    placeholder="e.g. CH Robinson, TQL..."
                    autoComplete="off"
                  />
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandList>
                      <CommandEmpty>No matches found</CommandEmpty>
                      <CommandGroup>
                        {filteredBrokers.map(broker => (
                          <CommandItem
                            key={broker}
                            value={broker}
                            onSelect={() => {
                              setBrokerName(broker);
                              setBrokerOpen(false);
                            }}
                          >
                            {broker}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="broker_po">Broker Load / PO Number</Label>
              <Input
                id="broker_po"
                value={brokerPO}
                onChange={(e) => setBrokerPO(e.target.value)}
                placeholder="e.g. CHR-2026-48291"
                className="font-mono"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linehaul" className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Linehaul Rate ($)
                </Label>
                <CurrencyInput
                  id="linehaul"
                  value={linehaul}
                  onChange={setLinehaul}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessorial_pay" className="flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Accessorial Pay ($)
                </Label>
                <CurrencyInput
                  id="accessorial_pay"
                  value={accessorialPay}
                  onChange={setAccessorialPay}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Gross Rate</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(totalGross)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Linehaul + Accessorial Pay</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
              <div>
                <p className="text-sm font-medium">Factoring Approved?</p>
                <p className="text-xs text-muted-foreground">This load has been approved by the factoring company</p>
              </div>
              <Switch checked={factoringApproved} onCheckedChange={setFactoringApproved} />
            </div>
          </TabsContent>

          {/* Tab 2: Route & Stops */}
          <TabsContent value="route" className="space-y-6">
            {/* Shipper */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                <MapPin className="h-4 w-4" /> Shipper (Pick-up)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipper_facility">Facility Name</Label>
                  <Input id="shipper_facility" value={shipperFacility} onChange={(e) => setShipperFacility(e.target.value)} placeholder="ABC Distribution Center" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipper_address">Address</Label>
                  <Input id="shipper_address" value={shipperAddress} onChange={(e) => setShipperAddress(e.target.value)} placeholder="1234 Industrial Blvd, Dallas, TX 75201" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shipper_date">Date</Label>
                  <Input id="shipper_date" type="date" value={shipperDate} onChange={(e) => setShipperDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipper_time" className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Time
                  </Label>
                  <Input id="shipper_time" value={shipperTime} onChange={(e) => setShipperTime(e.target.value)} placeholder="8:00 AM" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Pickup Timezone</Label>
                <TimezoneSelect value={shipperTz} onChange={(v) => { setShipperTz(v); setShipperTzTouched(true); }} />
              </div>
            </div>

            <Separator />

            {/* Intermediate Stops */}
            {intermediateStops.map((stop, idx) => (
              <div key={stop.id} className="space-y-4 rounded-lg border border-border p-4 bg-muted/20 relative">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground">Stop {idx + 1}</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStop(stop.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Facility Name</Label>
                    <Input value={stop.facility_name} onChange={(e) => updateStop(stop.id, 'facility_name', e.target.value)} placeholder="Facility name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input value={stop.address} onChange={(e) => updateStop(stop.id, 'address', e.target.value)} placeholder="Address" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={stop.date} onChange={(e) => updateStop(stop.id, 'date', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input value={stop.time} onChange={(e) => updateStop(stop.id, 'time', e.target.value)} placeholder="10:00 AM" />
                  </div>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" className="w-full" onClick={addIntermediateStop}>
              <Plus className="h-4 w-4 mr-2" /> Add Intermediate Stop
            </Button>

            <Separator />

            {/* Consignee */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                <MapPin className="h-4 w-4" /> Consignee (Delivery)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="consignee_facility">Facility Name</Label>
                  <Input id="consignee_facility" value={consigneeFacility} onChange={(e) => setConsigneeFacility(e.target.value)} placeholder="XYZ Warehouse" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consignee_address">Address</Label>
                  <Input id="consignee_address" value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} placeholder="5678 Commerce Dr, Denver, CO 80220" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="consignee_date">Date</Label>
                  <Input id="consignee_date" type="date" value={consigneeDate} onChange={(e) => setConsigneeDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="consignee_time" className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Time
                  </Label>
                  <Input id="consignee_time" value={consigneeTime} onChange={(e) => setConsigneeTime(e.target.value)} placeholder="2:00 PM" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Delivery Timezone</Label>
                <TimezoneSelect value={consigneeTz} onChange={(v) => { setConsigneeTz(v); setConsigneeTzTouched(true); }} />
              </div>
            </div>
          </TabsContent>

          {/* Tab 3: Equipment & Docs */}
          <TabsContent value="equipment" className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight" className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                  Total Weight (lbs)
                </Label>
                <Input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="42,000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commodity">Commodity Description</Label>
                <Input id="commodity" value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="e.g. Consumer electronics, palletized" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="equipment_type" className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                Equipment Type
              </Label>
              <Select value={equipment} onValueChange={setEquipment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_TYPES.map(eq => (
                    <SelectItem key={eq.value} value={eq.value}>{eq.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                Signed Rate Confirmation
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => setRateConFile(e.target.files?.[0] || null)}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors p-6 text-center bg-muted/20"
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                {rateConFile ? (
                  <p className="text-sm font-medium text-foreground">{rateConFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">Click to attach signed rate confirmation</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF, PNG, or JPG</p>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Persistent Footer */}
        <Separator className="my-6" />
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={handleSave} className="gradient-gold text-primary-foreground">
            Save Active Load
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
