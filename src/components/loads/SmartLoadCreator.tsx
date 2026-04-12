import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, AlertCircle, X, ScanLine, MapPin, DollarSign, Building2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import { useQueryClient } from '@tanstack/react-query';

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
  accessorials: Array<{ type: string; amount: number; notes?: string }>;
  intermediate_stops?: Array<{
    stop_number: number;
    stop_type: string;
    address: string;
    date: string | null;
    facility_name: string | null;
  }>;
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

interface SmartLoadCreatorProps {
  onDataExtracted: (data: ExtractedLoadData, existingLoadId?: string) => void;
  existingLoads: ExistingLoad[];
  drivers: Array<{ id: string; first_name: string; last_name: string }>;
  trucks: Array<{ id: string; unit_number: string }>;
}

export function SmartLoadCreator({ onDataExtracted, existingLoads, drivers, trucks }: SmartLoadCreatorProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedLoadData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileRef = useRef<File | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { orgId, user } = useAuth();
  const { upload: storageUpload } = useStorageProvider();
  const queryClient = useQueryClient();

  // Animate progress bar during processing
  useEffect(() => {
    if (isProcessing) {
      setProgress(0);
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 8 + 2;
        });
      }, 300);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (extractedData) setProgress(100);
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isProcessing, extractedData]);

  const saveToDocuments = async (file: File, loadId?: string) => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `rate-confirmations/${Date.now()}.${fileExt}`;
      const { path, error: uploadError } = await storageUpload('documents', filePath, file);
      if (uploadError || !path) return;
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
      console.error('[SmartLoadCreator] Error saving PDF:', err);
    }
  };

  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const processFile = async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast.error('Please upload a PDF file');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`PDF must be under 5MB. This file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setError(null);
    setExtractedData(null);
    pendingFileRef.current = file;

    try {
      const tempPath = `${orgId}/temp-rc/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(tempPath, file, { contentType: 'application/pdf' });
      if (uploadError) throw new Error('Failed to upload file for processing');

      const { data, error: fnError } = await supabase.functions.invoke('parse-rate-confirmation', {
        body: { filePath: tempPath },
      });
      if (fnError) throw new Error(fnError.message || 'Failed to process rate confirmation');
      if (data?.error) throw new Error(data.error);

      setExtractedData(data);
      toast.success('Rate confirmation parsed successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      setError(message);
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const matchDriversAndTrucks = (data: ExtractedLoadData) => {
    let driver_id: string | undefined;
    let truck_id: string | undefined;
    if (data.driver_name) {
      const driverNameLower = data.driver_name.toLowerCase();
      const matched = drivers.find(d => {
        const fullName = `${d.first_name} ${d.last_name}`.toLowerCase();
        return fullName.includes(driverNameLower) || driverNameLower.includes(fullName);
      });
      if (matched) driver_id = matched.id;
    }
    if (data.truck_unit) {
      const unitNumber = data.truck_unit.replace(/\D/g, '');
      const matched = trucks.find(t => t.unit_number.includes(unitNumber) || unitNumber.includes(t.unit_number));
      if (matched) truck_id = matched.id;
    }
    return { ...data, driver_id, truck_id };
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const pdfFile = Array.from(e.dataTransfer.files).find(f => f.type === 'application/pdf');
    if (pdfFile) processFile(pdfFile);
    else toast.error('Please drop a PDF file');
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleReviewAndCreate = () => {
    if (!extractedData) return;
    const matchedData = matchDriversAndTrucks(extractedData);
    if (pendingFileRef.current) saveToDocuments(pendingFileRef.current);
    onDataExtracted(matchedData as any);
    resetState();
  };

  const resetState = () => {
    setExtractedData(null);
    setFileName(null);
    setError(null);
    setProgress(0);
    pendingFileRef.current = null;
  };

  const formatCurrency = (v: number | null) => {
    if (v === null || v === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
  };

  const extractCityState = (address: string | null) => {
    if (!address) return '-';
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const stateZip = parts[parts.length - 1];
      const city = parts[parts.length - 2] || parts[0];
      const stateMatch = stateZip.match(/([A-Z]{2})/);
      return stateMatch ? `${city}, ${stateMatch[1]}` : city;
    }
    return parts[0];
  };

  const grossRate = (extractedData?.rate || 0) + (extractedData?.fuel_surcharge || 0);
  const ratePerMile = extractedData?.booked_miles && extractedData.booked_miles > 0
    ? grossRate / extractedData.booked_miles : 0;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <Card
        className={cn(
          "border-2 border-dashed transition-all cursor-pointer",
          isDragging && "border-primary bg-primary/5 scale-[1.01]",
          isProcessing && "pointer-events-none",
          !isDragging && !isProcessing && "hover:border-primary/50 hover:bg-muted/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && !extractedData && fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-8 px-4">
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center w-full max-w-md"
              >
                <motion.div
                  animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <ScanLine className="h-10 w-10 text-primary mb-3" />
                </motion.div>
                <p className="text-sm font-medium mb-1">Extracting Load Details via AI...</p>
                <p className="text-xs text-muted-foreground mb-3">{fileName}</p>
                <Progress value={progress} className="w-full h-2" />
                <p className="text-xs text-muted-foreground mt-2">{Math.round(progress)}% complete</p>
              </motion.div>
            ) : extractedData ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center"
              >
                <CheckCircle className="h-10 w-10 text-success mb-2" />
                <p className="text-sm font-medium text-success">Load Details Extracted</p>
                <p className="text-xs text-muted-foreground">{fileName}</p>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center"
              >
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Drag & Drop Broker Rate Confirmation PDF here</p>
                <p className="text-xs text-muted-foreground">or click to browse</p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Card className="border-destructive bg-destructive/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Failed to parse document</p>
                    <p className="text-xs text-muted-foreground mt-1">{error}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="ml-auto shrink-0" onClick={resetState}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parsed Results */}
      <AnimatePresence>
        {extractedData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Column 1 — Broker Info */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Broker Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Broker / Source</p>
                      <p className="text-sm font-medium">{extractedData.agency_code || extractedData.notes?.split('\n')[0] || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Load / Reference ID</p>
                      <p className="text-sm font-mono font-medium">{extractedData.landstar_load_id || '-'}</p>
                    </div>
                    {extractedData.driver_name && (
                      <div>
                        <p className="text-xs text-muted-foreground">Driver</p>
                        <p className="text-sm font-medium">{extractedData.driver_name}</p>
                      </div>
                    )}
                    {extractedData.truck_unit && (
                      <div>
                        <p className="text-xs text-muted-foreground">Truck Unit</p>
                        <p className="text-sm font-mono font-medium">{extractedData.truck_unit}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>

              {/* Column 2 — Logistics */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Logistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Origin</p>
                      <p className="text-sm font-medium">{extractCityState(extractedData.origin)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Destination</p>
                      <p className="text-sm font-medium">{extractCityState(extractedData.destination)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Miles</p>
                      <p className="text-sm font-medium">{extractedData.booked_miles?.toLocaleString() || '-'}</p>
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Pick-up</p>
                        <p className="text-sm font-medium">{extractedData.pickup_date || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Delivery</p>
                        <p className="text-sm font-medium">{extractedData.delivery_date || '-'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Column 3 — Financials */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary" />
                      Financials
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Gross Rate (Rate + FSC)</p>
                      <p className="text-lg font-bold text-success">{formatCurrency(grossRate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rate Per Mile</p>
                      <p className="text-sm font-medium">
                        {ratePerMile > 0 ? `$${ratePerMile.toFixed(2)}/mi` : '-'}
                      </p>
                    </div>
                    {extractedData.fuel_surcharge && extractedData.fuel_surcharge > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Fuel Surcharge</p>
                        <p className="text-sm font-medium">{formatCurrency(extractedData.fuel_surcharge)}</p>
                      </div>
                    )}
                    {extractedData.accessorials?.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">Accessorials</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {extractedData.accessorials.map((acc, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {acc.type}: {formatCurrency(acc.amount)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {extractedData.trailer_number && (
                      <div>
                        <p className="text-xs text-muted-foreground">Equipment</p>
                        <p className="text-sm font-medium flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          Trailer #{extractedData.trailer_number}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex items-center justify-between"
            >
              <Button variant="ghost" onClick={resetState}>
                <X className="h-4 w-4 mr-2" />
                Discard
              </Button>
              <Button size="lg" onClick={handleReviewAndCreate} className="px-8">
                <FileText className="h-4 w-4 mr-2" />
                Review & Create Load
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
