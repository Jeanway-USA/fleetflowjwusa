import { useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, AlertTriangle, X, RefreshCw, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  classifyParseFailure,
  findTripMatch,
  flagText,
  looksLikeRateCon,
  previewMoney,
  revenueSettingsFrom,
  reviewFlags,
  type ParseFailure,
} from '@/lib/rate-con-review';

interface IntermediateStop {
  stop_number: number;
  stop_type: string;
  address: string;
  date: string | null;
  facility_name: string | null;
}

interface ExtractedLoadData {
  landstar_load_id: string | null;
  agency_code: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  /** The number the driver gives at the pickup gate. */
  pickup_number?: string | null;
  /** The Customer Reference Numbers under References on the load detail. */
  customer_references?: string[] | null;
  /** The Notes text of the first (pickup) stop. */
  pickup_stop_notes?: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  booked_miles: number | null;
  rate: number | null;
  fuel_surcharge: number | null;
  driver_name: string | null;
  truck_unit: string | null;
  trailer_number: string | null;
  accessorials: Array<{
    type: string;
    amount: number;
    notes?: string;
  }>;
  intermediate_stops?: IntermediateStop[];
  notes: string | null;
  confidence: Record<string, number>;
}

interface ExistingLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  rate: number | null;
  pickup_date: string | null;
  delivery_date?: string | null;
  status?: string | null;
}

export interface RateConUseOptions {
  /** The office chose "Create anyway" on a trip number that already exists. */
  allowDuplicateTrip?: boolean;
}

interface RateConfirmationUploadProps {
  onDataExtracted: (data: ExtractedLoadData, existingLoadId?: string, options?: RateConUseOptions) => void;
  existingLoads: ExistingLoad[];
  drivers: Array<{ id: string; first_name: string; last_name: string }>;
  trucks: Array<{ id: string; unit_number: string }>;
}

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);

export function RateConfirmationUpload({ onDataExtracted, existingLoads, drivers, trucks }: RateConfirmationUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedLoadData | null>(null);
  const [matchingLoad, setMatchingLoad] = useState<ExistingLoad | null>(null);
  const [failure, setFailure] = useState<ParseFailure | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const { orgId, user } = useAuth();
  const { upload: storageUpload } = useStorageProvider();
  const queryClient = useQueryClient();

  // The same pay settings the load form uses (same query key, so one fetch serves both).
  const { data: settingRows = [] } = useQuery({
    queryKey: ['company_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('company_settings').select('*');
      if (error) throw error;
      return data;
    },
  });
  const paySettings = useMemo(() => revenueSettingsFrom(settingRows as any[]), [settingRows]);

  const saveToDocuments = async (file: File, loadId?: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `rate-confirmations/${Date.now()}.${fileExt}`;
      const { path, error: uploadError } = await storageUpload('documents', filePath, file);
      if (uploadError || !path) {
        console.error('[RC] Failed to save to documents:', uploadError);
        return;
      }
      await supabase.from('documents').insert({
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        document_type: 'Rate Confirmation',
        related_type: loadId ? 'load' : 'general',
        related_id: loadId || null,
        uploaded_by: user?.id || null,
        org_id: orgId,
      });
      queryClient.invalidateQueries({ queryKey: ['all-documents'] });
    } catch (err) {
      console.error('[RC] Error saving PDF to documents:', err);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const PARSE_TIMEOUT_MS = 120_000;

  const fail = (raw: unknown) => {
    const f = classifyParseFailure(raw);
    setFailure(f);
    toast.error(f.title);
  };

  const processFile = async (file: File) => {
    setFailure(null);
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      fail('Please upload a PDF file');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      fail(`PDF file must be under 5MB. This file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setExtractedData(null);
    setMatchingLoad(null);
    pendingFileRef.current = file;

    try {
      // Step 1: Upload PDF to storage (bypasses functions relay)
      const tempPath = `${orgId}/temp-rc/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(tempPath, file, { contentType: 'application/pdf' });

      if (uploadError) {
        console.error('[RC Upload] Storage upload failed:', uploadError);
        throw new Error('Failed to upload file for processing');
      }

      // Step 2: Call edge function with just the storage path (tiny JSON body), with a time limit so a stuck read ends
      const invoke = supabase.functions.invoke('parse-rate-confirmation', { body: { filePath: tempPath } });
      const { data, error: fnError } = await new Promise<Awaited<typeof invoke>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Reading this PDF took too long.')), PARSE_TIMEOUT_MS);
        invoke.then(
          (v) => { clearTimeout(timer); resolve(v); },
          (e) => { clearTimeout(timer); reject(e); },
        );
      });

      if (fnError) {
        // The function's own message (in the response body) is more specific than the generic invoke error.
        let detail = fnError.message || 'Failed to process rate confirmation';
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) detail = body.error;
        } catch { /* keep the generic message */ }
        throw new Error(detail);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!looksLikeRateCon(data)) {
        setFailure({
          kind: 'not_rate_con',
          title: 'This does not look like a rate confirmation',
          detail: 'No Landstar load details were found in it. Use the Landstar rate confirmation or load detail PDF.',
          retryable: false,
        });
        return;
      }

      setExtractedData(data);

      // Is this trip already in the system? Ask the database (not just the loaded page of loads), ignoring cancelled and deleted loads.
      if (data.landstar_load_id) {
        const { data: existingRows } = await supabase
          .from('fleet_loads')
          .select('id, landstar_load_id, origin, destination, rate, pickup_date, delivery_date, status, deleted_at')
          .eq('landstar_load_id', data.landstar_load_id)
          .is('deleted_at', null)
          .limit(5);

        const existingLoad = findTripMatch((existingRows ?? []) as any[], data.landstar_load_id) ?? findTripMatch(existingLoads, data.landstar_load_id);
        setMatchingLoad(existingLoad);
        if (existingLoad) toast.info(`Trip ${data.landstar_load_id} is already in your loads`);
      }
    } catch (err) {
      fail(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const matchDriversAndTrucks = (data: ExtractedLoadData): ExtractedLoadData & { driver_id?: string; truck_id?: string } => {
    let driver_id: string | undefined;
    let truck_id: string | undefined;

    // Try to match driver by name
    if (data.driver_name) {
      const driverNameLower = data.driver_name.toLowerCase();
      const matchedDriver = drivers.find(d => {
        const fullName = `${d.first_name} ${d.last_name}`.toLowerCase();
        return fullName.includes(driverNameLower) || driverNameLower.includes(fullName);
      });
      if (matchedDriver) {
        driver_id = matchedDriver.id;
      }
    }

    // Try to match truck by unit number
    if (data.truck_unit) {
      const unitNumber = data.truck_unit.replace(/\D/g, ''); // Extract just numbers
      const matchedTruck = trucks.find(t =>
        t.unit_number.includes(unitNumber) || unitNumber.includes(t.unit_number)
      );
      if (matchedTruck) {
        truck_id = matchedTruck.id;
      }
    }

    return { ...data, driver_id, truck_id };
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));

    if (pdfFile) {
      processFile(pdfFile);
    } else {
      fail('Please upload a PDF file');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handleUseData = async (mode: 'new' | 'update' | 'anyway') => {
    if (!extractedData) return;
    const matchedData = matchDriversAndTrucks(extractedData);
    if (mode === 'update' && matchingLoad) {
      onDataExtracted(matchedData as any, matchingLoad.id);
      // Save PDF to documents linked to the existing load
      if (pendingFileRef.current) saveToDocuments(pendingFileRef.current, matchingLoad.id);
    } else {
      onDataExtracted(matchedData as any, undefined, { allowDuplicateTrip: mode === 'anyway' });
      // Save PDF to documents (no load ID yet for new loads)
      if (pendingFileRef.current) saveToDocuments(pendingFileRef.current);
    }
    setExtractedData(null);
    setFileName(null);
    setMatchingLoad(null);
    pendingFileRef.current = null;
  };

  const handleCancel = () => {
    setExtractedData(null);
    setFileName(null);
    setMatchingLoad(null);
    setFailure(null);
  };

  const retry = () => {
    const file = pendingFileRef.current;
    if (file) void processFile(file);
  };

  const flags = extractedData ? reviewFlags(extractedData) : [];
  const preview = extractedData ? previewMoney(extractedData, paySettings) : null;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-all cursor-pointer",
          isDragging && "border-primary bg-primary/5",
          isProcessing && "opacity-50 pointer-events-none",
          !isDragging && !isProcessing && "hover:border-primary/50 hover:bg-muted/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-6 px-4">
          {isProcessing ? (
            <>
              <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
              <p className="text-sm font-medium">Reading {fileName}...</p>
              <p className="text-xs text-muted-foreground">This can take up to a minute</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drop the Landstar rate confirmation PDF here</p>
              <p className="text-xs text-muted-foreground">or tap to choose the file</p>
            </>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Why it failed, and what to do */}
      {failure && (
        <Card className="border-destructive bg-destructive/5" role="alert">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-destructive">{failure.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{failure.detail}</p>
                {failure.retryable && pendingFileRef.current && (
                  <Button variant="outline" size="sm" className="mt-3 h-11 sm:h-9" onClick={retry} disabled={isProcessing}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Try again
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCancel} aria-label="Dismiss">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review: what was read, what to check, what it is worth */}
      {extractedData && preview && (
        <Card className={cn("border-2", matchingLoad ? "border-warning bg-warning/5" : "border-success bg-success/5")}>
          <CardContent className="py-4 space-y-4">
            {/* This trip is already a load */}
            {matchingLoad && (
              <Alert className="border-warning bg-warning/10">
                <RefreshCw className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <span className="font-semibold">Trip {matchingLoad.landstar_load_id} is already in your loads.</span>{' '}
                  Update that load with this rate confirmation, or create a second load only if you are sure.
                  <span className="mt-2 block rounded-md border bg-card p-2 text-xs">
                    <span className="font-medium">{matchingLoad.origin}</span> to <span className="font-medium">{matchingLoad.destination}</span>
                    {' · '}pickup {matchingLoad.pickup_date || '-'}
                    {matchingLoad.delivery_date ? `, delivery ${matchingLoad.delivery_date}` : ''}
                    {' · '}linehaul {money(matchingLoad.rate)}
                    {matchingLoad.status ? ` · ${matchingLoad.status.replace(/_/g, ' ')}` : ''}
                  </span>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-3">
              <CheckCircle className={cn("h-5 w-5 shrink-0 mt-0.5", matchingLoad ? "text-warning" : "text-success")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm font-medium", matchingLoad ? "text-warning" : "text-success")}>
                    Read from {fileName}
                  </p>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCancel} aria-label="Discard">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Check the details below. You can change anything on the next screen before it is saved.</p>
              </div>
            </div>

            {/* Fields to check */}
            {flags.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/10 p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-warning" /> Check these before saving
                </p>
                <ul className="space-y-0.5 text-sm">
                  {flags.map((f) => <li key={f.key}>{flagText(f)}</li>)}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="Landstar load ID" flag={flags.find((f) => f.key === 'landstar_load_id')} mono>{extractedData.landstar_load_id}</Field>
              <Field label="Agent code" flag={flags.find((f) => f.key === 'agency_code')} mono>{extractedData.agency_code}</Field>
              <Field label="Pickup" flag={flags.find((f) => f.key === 'origin')}>{extractedData.origin}</Field>
              <Field label="Delivery" flag={flags.find((f) => f.key === 'destination')}>{extractedData.destination}</Field>
              <Field label="Pickup date" flag={flags.find((f) => f.key === 'pickup_date')} sub={extractedData.pickup_time}>{extractedData.pickup_date}</Field>
              <Field label="Delivery date" flag={flags.find((f) => f.key === 'delivery_date')} sub={extractedData.delivery_time}>{extractedData.delivery_date}</Field>
              <Field label="Pickup number" flag={flags.find((f) => f.key === 'pickup_number')} mono>{extractedData.pickup_number}</Field>
              <Field label="Miles" flag={flags.find((f) => f.key === 'booked_miles')}>{extractedData.booked_miles?.toLocaleString()}</Field>
              {extractedData.driver_name && <Field label="Driver on the PDF">{extractedData.driver_name}</Field>}
              {extractedData.truck_unit && <Field label="Truck on the PDF" mono>{extractedData.truck_unit}</Field>}
              {extractedData.trailer_number && <Field label="Trailer on the PDF" mono>{extractedData.trailer_number}</Field>}
              {extractedData.accessorials && extractedData.accessorials.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Accessorials</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {extractedData.accessorials.map((acc, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{acc.type}: {money(acc.amount)}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {extractedData.intermediate_stops && extractedData.intermediate_stops.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Stops between ({extractedData.intermediate_stops.length})</p>
                  <div className="flex flex-col gap-1 mt-1 text-xs">
                    {extractedData.intermediate_stops.map((stop, i) => (
                      <span key={i} className="text-muted-foreground">
                        Stop {stop.stop_number} ({stop.stop_type}): {stop.facility_name ? `${stop.facility_name}, ` : ''}{stop.address}{stop.date ? ` - ${stop.date}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* What the load is worth to the truck */}
            <section aria-label="Settlement preview" className={cn("rounded-md border bg-card p-3", flags.some((f) => f.key === 'rate') && "border-warning")}>
              <p className="text-sm font-medium">What this load pays the truck</p>
              <dl className="mt-2 space-y-1 text-sm tabular-nums">
                <Row label="Linehaul" value={money(preview.linehaul)} />
                <Row label={`Your share of linehaul (${preview.truckPctDisplay}%)`} value={money(preview.linehaulShare)} />
                <Row label="Fuel surcharge (100% to you)" value={money(preview.fuelSurcharge)} />
                {preview.accessorials > 0 && <Row label="Accessorials" value={money(preview.accessorials)} />}
                {preview.trailerShare > 0 && <Row label="Trailer share" value={money(preview.trailerShare)} />}
              </dl>
              <div className="mt-2 flex items-baseline justify-between border-t pt-2">
                <span className="text-sm font-medium">Estimated net to the truck</span>
                <span className="figure text-3xl font-bold tabular-nums">{money(preview.net)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Billed in all {money(preview.gross)}; Landstar keeps {money(preview.landstarCut)} of linehaul. Advances and deductions come off at settlement.
              </p>
            </section>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end pt-3 border-t">
              <Button variant="outline" className="h-12 sm:h-10" onClick={handleCancel}>Cancel</Button>
              {matchingLoad ? (
                <>
                  <Button variant="outline" className="h-12 sm:h-10" onClick={() => handleUseData('anyway')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create anyway
                  </Button>
                  <Button onClick={() => handleUseData('update')} className="h-12 sm:h-10 bg-primary text-primary-foreground hover:bg-primary/90">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Update existing load
                  </Button>
                </>
              ) : (
                <Button onClick={() => handleUseData('new')} className="h-12 sm:h-10 bg-primary text-primary-foreground hover:bg-primary/90">
                  <FileText className="h-4 w-4 mr-2" />
                  Review and save
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Field({ label, flag, mono, sub, children }: { label: string; flag?: { level: 'ok' | 'low' | 'missing' }; mono?: boolean; sub?: string | null; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={cn('min-w-0', flag && 'rounded-md border border-warning/60 bg-warning/10 px-2 py-1')}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {flag && <Badge variant="outline" className="border-warning px-1.5 py-0 text-[11px] text-warning">{flag.level === 'missing' ? 'Not found' : 'Check'}</Badge>}
      </p>
      <p className={cn('font-medium break-words', mono && 'font-mono', empty && 'text-muted-foreground')}>{empty ? 'Not found' : children}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
