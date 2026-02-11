import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, RefreshCw, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
}

interface RateConfirmationUploadProps {
  onDataExtracted: (data: ExtractedLoadData, existingLoadId?: string) => void;
  existingLoads: ExistingLoad[];
  drivers: Array<{ id: string; first_name: string; last_name: string }>;
  trucks: Array<{ id: string; unit_number: string }>;
}

export function RateConfirmationUpload({ onDataExtracted, existingLoads, drivers, trucks }: RateConfirmationUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedLoadData | null>(null);
  const [matchingLoad, setMatchingLoad] = useState<ExistingLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setError(null);
    setExtractedData(null);

    // Upload PDF to temporary storage, then pass path to edge function
    const tempPath = `temp-rc/${Date.now()}-${file.name}`;
    let uploadedPath: string | null = null;

    try {
      // 1. Upload PDF to storage bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(tempPath, file, { contentType: 'application/pdf' });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      uploadedPath = uploadData.path;
      console.log('PDF uploaded to storage:', uploadedPath);

      // 2. Call edge function with file path instead of base64
      const { data, error: fnError } = await supabase.functions.invoke('parse-rate-confirmation', {
        body: { filePath: uploadedPath },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to parse rate confirmation');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      console.log('Extracted load data:', data);
      setExtractedData(data);
      
      // Check if this load already exists by Freight Bill #
      if (data.landstar_load_id) {
        const existingLoad = existingLoads.find(
          load => load.landstar_load_id === data.landstar_load_id
        );
        if (existingLoad) {
          setMatchingLoad(existingLoad);
          toast.info(`Found existing load with Freight Bill #${data.landstar_load_id}`);
        } else {
          setMatchingLoad(null);
          toast.success('Rate confirmation parsed successfully!');
        }
      } else {
        setMatchingLoad(null);
        toast.success('Rate confirmation parsed successfully!');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      setError(message);
      toast.error(message);
    } finally {
      // 3. Clean up temp file from storage
      if (uploadedPath) {
        supabase.storage.from('documents').remove([uploadedPath]).catch(() => {});
      }
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
    const pdfFile = files.find(f => f.type === 'application/pdf');
    
    if (pdfFile) {
      processFile(pdfFile);
    } else {
      toast.error('Please drop a PDF file');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleUseData = (updateExisting: boolean = false) => {
    if (extractedData) {
      const matchedData = matchDriversAndTrucks(extractedData);
      if (updateExisting && matchingLoad) {
        onDataExtracted(matchedData as any, matchingLoad.id);
      } else {
        onDataExtracted(matchedData as any);
      }
      setExtractedData(null);
      setFileName(null);
      setMatchingLoad(null);
    }
  };

  const handleCancel = () => {
    setExtractedData(null);
    setFileName(null);
    setMatchingLoad(null);
    setError(null);
  };

  const formatCurrencyValue = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success';
    if (confidence >= 50) return 'text-warning';
    return 'text-destructive';
  };

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
              <p className="text-sm font-medium">Processing {fileName}...</p>
              <p className="text-xs text-muted-foreground">Extracting load details with AI</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drop Rate Confirmation PDF here</p>
              <p className="text-xs text-muted-foreground">or click to browse</p>
            </>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Error Display */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Failed to parse document</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extracted Data Preview */}
      {extractedData && (
        <Card className={cn(
          "border-2",
          matchingLoad ? "border-warning bg-warning/5" : "border-success bg-success/5"
        )}>
          <CardContent className="py-4">
            {/* Matching Load Alert */}
            {matchingLoad && (
              <Alert className="mb-4 border-warning bg-warning/10">
                <RefreshCw className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <span className="font-semibold">Existing load found!</span> Freight Bill #{matchingLoad.landstar_load_id} already exists.
                  You can update it with this data or create a new load.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className={cn("h-5 w-5 shrink-0 mt-0.5", matchingLoad ? "text-warning" : "text-success")} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className={cn("text-sm font-medium", matchingLoad ? "text-warning" : "text-success")}>
                    Data extracted from {fileName}
                  </p>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCancel}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Review the extracted data below</p>
              </div>
            </div>

            {/* Show comparison if matching load found */}
            {matchingLoad && (
              <div className="mb-4 p-3 rounded-md bg-muted/50 border">
                <p className="text-xs font-medium text-muted-foreground mb-2">Current Load Data:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Origin:</span>
                    <p className="font-medium truncate">{matchingLoad.origin}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Destination:</span>
                    <p className="font-medium truncate">{matchingLoad.destination}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Rate:</span>
                    <p className="font-medium">{formatCurrencyValue(matchingLoad.rate)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pickup:</span>
                    <p className="font-medium">{matchingLoad.pickup_date || '-'}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Load ID</p>
                <p className="font-mono font-medium">{extractedData.landstar_load_id || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Agency Code</p>
                <p className="font-mono font-medium">{extractedData.agency_code || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Origin</p>
                <p className="font-medium">{extractedData.origin || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Destination</p>
                <p className="font-medium">{extractedData.destination || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pickup Date</p>
                <p className="font-medium">{extractedData.pickup_date || '-'}</p>
                {extractedData.pickup_time && (
                  <p className="text-xs text-muted-foreground">{extractedData.pickup_time}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delivery Date</p>
                <p className="font-medium">{extractedData.delivery_date || '-'}</p>
                {extractedData.delivery_time && (
                  <p className="text-xs text-muted-foreground">{extractedData.delivery_time}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Miles</p>
                <p className="font-medium">{extractedData.booked_miles?.toLocaleString() || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rate + FSC</p>
                <p className="font-medium text-success">
                  {formatCurrencyValue((extractedData.rate || 0) + (extractedData.fuel_surcharge || 0))}
                </p>
              </div>
              {extractedData.driver_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Driver</p>
                  <p className="font-medium">{extractedData.driver_name}</p>
                </div>
              )}
              {extractedData.truck_unit && (
                <div>
                  <p className="text-xs text-muted-foreground">Truck</p>
                  <p className="font-mono font-medium">{extractedData.truck_unit}</p>
                </div>
              )}
              {extractedData.accessorials && extractedData.accessorials.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Accessorials</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {extractedData.accessorials.map((acc, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary">
                        {acc.type}: {formatCurrencyValue(acc.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {extractedData.intermediate_stops && extractedData.intermediate_stops.length > 0 && (
                <div className="col-span-full">
                  <p className="text-xs text-muted-foreground">Intermediate Stops ({extractedData.intermediate_stops.length})</p>
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

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              {matchingLoad ? (
                <>
                  <Button variant="outline" onClick={() => handleUseData(false)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Load
                  </Button>
                  <Button onClick={() => handleUseData(true)} className="gradient-gold text-primary-foreground">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Update Existing Load
                  </Button>
                </>
              ) : (
                <Button onClick={() => handleUseData(false)} className="gradient-gold text-primary-foreground">
                  <FileText className="h-4 w-4 mr-2" />
                  Use This Data
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
