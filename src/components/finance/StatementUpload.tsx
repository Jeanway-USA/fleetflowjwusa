import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, FileSpreadsheet, FileScan, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { parseLandstarXlsx } from '@/lib/parse-landstar-xlsx';
import { detectFileType, reconcileDocuments, getFileTypeLabel } from '@/lib/settlement-reconciliation';
import type { StagedFile, ReconciliationResult } from '@/lib/settlement-reconciliation';
import { ReconciliationPreview } from './ReconciliationPreview';
import { useAuth } from '@/contexts/AuthContext';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import { useQueryClient } from '@tanstack/react-query';

interface FleetLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
}

interface Truck {
  id: string;
  unit_number: string;
}

interface ExistingExpense {
  id: string;
  expense_date: string;
  expense_type: string;
  amount: number;
  load_id: string | null;
}

interface StatementUploadProps {
  existingLoads: FleetLoad[];
  trucks: Truck[];
  existingExpenses: ExistingExpense[];
  onExpensesImported: () => void;
  orgId: string | null;
}

const DOCUMENT_TYPES: StagedFile['type'][] = [
  'settlement_xlsx',
  'freight_bill_xlsx',
  'card_activity_pdf',
  'contractor_pdf',
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  settlement_xlsx: <FileSpreadsheet className="h-4 w-4" />,
  freight_bill_xlsx: <FileSpreadsheet className="h-4 w-4" />,
  card_activity_pdf: <FileScan className="h-4 w-4" />,
  contractor_pdf: <FileText className="h-4 w-4" />,
};

export function StatementUpload({ existingLoads, trucks, existingExpenses, onExpensesImported, orgId }: StatementUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { upload: storageUpload } = useStorageProvider();
  const queryClient = useQueryClient();

  const saveToDocuments = async (file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `statements/${Date.now()}.${fileExt}`;
      const { path, error: uploadError } = await storageUpload('documents', filePath, file);
      if (uploadError || !path) return;
      await supabase.from('documents').insert({
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        document_type: 'Statement',
        related_type: 'general',
        uploaded_by: user?.id || null,
        org_id: orgId,
      });
      queryClient.invalidateQueries({ queryKey: ['all-documents'] });
    } catch (err) {
      console.error('[Statement] Error saving to documents:', err);
    }
  };

  const isExcelFile = (file: File) => {
    const ext = file.name.toLowerCase();
    return ext.endsWith('.xlsx') || ext.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const addFiles = (files: File[]) => {
    const validFiles = files.filter(f => {
      const name = f.name.toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.xlsx') || name.endsWith('.xls');
    });

    if (validFiles.length === 0) {
      toast.error('Please upload PDF or Excel (.xlsx/.xls) files');
      return;
    }

    const newStaged: StagedFile[] = validFiles.map(file => ({
      file,
      type: detectFileType(file),
      status: 'pending',
    }));

    setStagedFiles(prev => {
      // Replace files of same detected type, keep others
      const updated = [...prev];
      for (const ns of newStaged) {
        const existingIdx = updated.findIndex(s => s.type === ns.type);
        if (existingIdx >= 0) {
          updated[existingIdx] = ns;
        } else {
          updated.push(ns);
        }
      }
      return updated;
    });

    setReconciliationResult(null);
    setError(null);
    toast.success(`${validFiles.length} file(s) staged`);
  };

  const removeFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const processDocuments = async () => {
    if (stagedFiles.length === 0) return;
    setIsProcessing(true);
    setError(null);

    const updatedFiles = [...stagedFiles];

    for (let i = 0; i < updatedFiles.length; i++) {
      const sf = updatedFiles[i];
      if (sf.status === 'parsed') continue;

      try {
        const isExcel = isExcelFile(sf.file);
        let data: any;

        if (isExcel) {
          const buffer = await sf.file.arrayBuffer();
          data = parseLandstarXlsx(buffer);
        } else {
          const pdfBase64 = await convertFileToBase64(sf.file);
          if (!pdfBase64 || pdfBase64.length < 100) throw new Error('Could not read PDF file.');
          const { data: fnData, error: fnError } = await supabase.functions.invoke('parse-landstar-statement', {
            body: { pdfBase64 },
          });
          if (fnError) throw new Error(fnError.message || 'Failed to parse statement');
          if (fnData.error) throw new Error(fnData.error);
          data = fnData;
        }

        updatedFiles[i] = { ...sf, status: 'parsed', data };
      } catch (err) {
        updatedFiles[i] = { ...sf, status: 'error', error: err instanceof Error ? err.message : 'Parse failed' };
      }
    }

    setStagedFiles(updatedFiles);

    const parsedCount = updatedFiles.filter(f => f.status === 'parsed').length;
    const errorCount = updatedFiles.filter(f => f.status === 'error').length;

    if (parsedCount === 0) {
      setError('All files failed to parse');
      setIsProcessing(false);
      return;
    }

    // Reconcile
    const result = reconcileDocuments(updatedFiles);
    setReconciliationResult(result);

    // Save files to documents
    for (const sf of updatedFiles) {
      if (sf.status === 'parsed') {
        saveToDocuments(sf.file);
      }
    }

    const msg = `Processed ${parsedCount} file(s): ${result.expenses.length} expenses, ${result.earnings.length} earnings`;
    if (errorCount > 0) {
      toast.warning(`${msg} (${errorCount} file(s) failed)`);
    } else {
      toast.success(msg);
    }
    setIsProcessing(false);
  };

  const handleCancel = () => {
    setStagedFiles([]);
    setReconciliationResult(null);
    setError(null);
  };

  const handleImported = () => {
    handleCancel();
    onExpensesImported();
  };

  // Which types are staged?
  const stagedTypes = new Set(stagedFiles.map(f => f.type));

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5" />
          Import from Landstar Statements
        </CardTitle>
        <CardDescription>
          Upload multiple documents at once — we'll cross-reference and deduplicate before importing
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Show dropzone + checklist when no reconciliation result */}
        {!reconciliationResult && (
          <>
            {/* Multi-File Drop Zone */}
            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer text-center',
                isDragging && 'border-primary bg-primary/5',
                isProcessing && 'opacity-50 pointer-events-none',
                !isDragging && !isProcessing && 'hover:border-primary/50 hover:bg-muted/50'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Drop statement files here (PDF & Excel)</p>
              <p className="text-xs text-muted-foreground">
                Supports Card Activity PDF, Contractor PDF, Settlement XLSX, Freight Bill XLSX
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Document Checklist */}
            {stagedFiles.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Document Checklist</p>
                <div className="grid gap-2">
                  {DOCUMENT_TYPES.map(type => {
                    const staged = stagedFiles.find(f => f.type === type);
                    const hasIt = !!staged;
                    return (
                      <div
                        key={type}
                        className={cn(
                          'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                          hasIt ? 'border-success/40 bg-success/5' : 'border-border bg-muted/30'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {hasIt ? (
                            <CheckCircle className="h-4 w-4 text-success" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                          )}
                          <span className="flex items-center gap-1.5">
                            {TYPE_ICONS[type]}
                            {getFileTypeLabel(type)}
                          </span>
                        </div>
                        {staged && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                              {staged.file.name}
                            </span>
                            {staged.status === 'error' && (
                              <Badge variant="destructive" className="text-xs">Error</Badge>
                            )}
                            {staged.status === 'parsed' && (
                              <Badge className="text-xs bg-success/20 text-success border-success/30">Parsed</Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(stagedFiles.indexOf(staged));
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Process Button */}
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleCancel} disabled={isProcessing}>
                    Clear All
                  </Button>
                  <Button
                    onClick={processDocuments}
                    disabled={isProcessing || stagedFiles.length === 0}
                    className="gradient-gold text-primary-foreground"
                  >
                    {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Process {stagedFiles.length} Document{stagedFiles.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Error Display */}
        {error && (
          <div className="border border-destructive bg-destructive/5 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Failed to process documents</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Reconciliation Preview */}
        {reconciliationResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-medium">
                  Reconciled {stagedFiles.filter(f => f.status === 'parsed').length} documents
                </p>
                {reconciliationResult.periodStart && (
                  <p className="text-xs text-muted-foreground">
                    Period: {reconciliationResult.periodStart} to {reconciliationResult.periodEnd}
                    {reconciliationResult.unitNumber && ` • Unit ${reconciliationResult.unitNumber}`}
                  </p>
                )}
              </div>
            </div>
            <ReconciliationPreview
              result={reconciliationResult}
              existingLoads={existingLoads}
              trucks={trucks}
              existingExpenses={existingExpenses}
              orgId={orgId}
              onImported={handleImported}
              onCancel={handleCancel}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
