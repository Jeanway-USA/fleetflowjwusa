import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ExtractedLoadData {
  landstar_load_id: string | null;
  agency_code: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
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
  notes: string | null;
  confidence: Record<string, number>;
}

interface RateConfirmationUploadProps {
  onDataExtracted: (data: ExtractedLoadData) => void;
  drivers: Array<{ id: string; first_name: string; last_name: string }>;
  trucks: Array<{ id: string; unit_number: string }>;
}

export function RateConfirmationUpload({ onDataExtracted, drivers, trucks }: RateConfirmationUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedLoadData | null>(null);
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

  const extractTextFromPDF = async (file: File): Promise<string> => {
    // Read the file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    // For PDF parsing, we'll send the raw text content
    // The AI will extract from the structured content
    // For now, we'll use a simpler approach - extract what we can from the PDF
    
    // Simple text extraction from PDF (works for text-based PDFs)
    const text = await extractTextFromPDFSimple(arrayBuffer);
    return text;
  };

  const extractTextFromPDFSimple = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    // Simple PDF text extraction
    // This works for text-based PDFs by finding text streams
    const bytes = new Uint8Array(arrayBuffer);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    
    // Extract readable text portions
    const textParts: string[] = [];
    
    // Look for text between BT and ET markers (PDF text objects)
    const btPattern = /BT[\s\S]*?ET/g;
    const matches = text.match(btPattern);
    
    if (matches) {
      for (const match of matches) {
        // Extract text from Tj and TJ operators
        const tjPattern = /\(([^)]*)\)\s*Tj|\[([^\]]*)\]\s*TJ/g;
        let tjMatch;
        while ((tjMatch = tjPattern.exec(match)) !== null) {
          const extractedText = tjMatch[1] || tjMatch[2] || '';
          if (extractedText) {
            textParts.push(extractedText.replace(/\\/g, ''));
          }
        }
      }
    }

    // If we couldn't extract structured text, try to find readable strings
    if (textParts.length === 0) {
      // Find sequences of printable ASCII characters
      const printablePattern = /[\x20-\x7E]{4,}/g;
      const printableMatches = text.match(printablePattern);
      if (printableMatches) {
        textParts.push(...printableMatches.filter(s => 
          !s.includes('obj') && 
          !s.includes('endobj') && 
          !s.includes('stream') &&
          !s.includes('/Type') &&
          !s.includes('/Font')
        ));
      }
    }

    return textParts.join('\n');
  };

  const processFile = async (file: File) => {
    if (!file.type.includes('pdf')) {
      toast.error('Please upload a PDF file');
      return;
    }

    setIsProcessing(true);
    setFileName(file.name);
    setError(null);
    setExtractedData(null);

    try {
      // Extract text from PDF
      const pdfText = await extractTextFromPDF(file);
      
      if (!pdfText || pdfText.length < 100) {
        throw new Error('Could not extract text from PDF. Please ensure the PDF contains text, not just images.');
      }

      console.log('Extracted PDF text length:', pdfText.length);

      // Send to edge function for AI parsing
      const { data, error: fnError } = await supabase.functions.invoke('parse-rate-confirmation', {
        body: { pdfText },
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to parse rate confirmation');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      console.log('Extracted load data:', data);
      setExtractedData(data);
      
      // Try to match driver and truck
      const matchedData = matchDriversAndTrucks(data);
      
      toast.success('Rate confirmation parsed successfully!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      setError(message);
      toast.error(message);
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

  const handleUseData = () => {
    if (extractedData) {
      const matchedData = matchDriversAndTrucks(extractedData);
      onDataExtracted(matchedData as any);
      setExtractedData(null);
      setFileName(null);
    }
  };

  const handleCancel = () => {
    setExtractedData(null);
    setFileName(null);
    setError(null);
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
        <Card className="border-success bg-success/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-success">Data extracted from {fileName}</p>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCancel}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Review the extracted data below</p>
              </div>
            </div>

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
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Delivery Date</p>
                <p className="font-medium">{extractedData.delivery_date || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Miles</p>
                <p className="font-medium">{extractedData.booked_miles?.toLocaleString() || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rate + FSC</p>
                <p className="font-medium text-success">
                  {formatCurrency((extractedData.rate || 0) + (extractedData.fuel_surcharge || 0))}
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
                        {acc.type}: {formatCurrency(acc.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleUseData} className="gradient-gold text-primary-foreground">
                <FileText className="h-4 w-4 mr-2" />
                Use This Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
