import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, FileSpreadsheet, FileScan, Trash2, CalendarRange, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { parseLandstarXlsx } from '@/lib/parse-landstar-xlsx';
import { detectFileType, reconcileDocuments, getFileTypeLabel, mergeStagedFiles, typeFromParsedPdf } from '@/lib/settlement-reconciliation';
import type { StagedFile, ReconciliationResult } from '@/lib/settlement-reconciliation';
import { ReconciliationPreview } from './ReconciliationPreview';
import { useAuth } from '@/contexts/AuthContext';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import { useQueryClient } from '@tanstack/react-query';
import { usePaySettings } from '@/hooks/usePaySettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { readSettlementLines } from '@/lib/read-settlement-lines';
import { proveTrips } from '@/lib/weekly-proof';
import { fetchProofInputs } from '@/lib/proof-inputs';
import { weekdayName } from '@/lib/settlement-week';
import { WEEK_DOCUMENTS, documentStates, missingDocuments, periodMatchNote, summarizeWeek, weekChoices, weekFrame } from '@/lib/week-import';
import type { ImportOutcome, WeekSummary } from '@/lib/week-import';
import { WeekStatementSummary } from './WeekStatementSummary';
import { provedWeekKey, recordFromSummary, serializeRecord } from '@/lib/prove-week-actions';

interface FleetLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  rate?: number | null;
  net_revenue?: number | null;
  delivery_date?: string | null;
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
  description?: string | null;
}

interface StatementUploadProps {
  existingLoads: FleetLoad[];
  trucks: Truck[];
  existingExpenses: ExistingExpense[];
  onExpensesImported: () => void;
  orgId: string | null;
  /** Closes the window that holds this (the summary's Done button). */
  onClose?: () => void;
  /** Open on the settlement week ending this day (YYYY-MM-DD), e.g. when coming from a load's detail. */
  initialWeekEnd?: string;
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

import { useSettlementWeekSetting } from '@/hooks/useSettlementWeekSetting';

export function StatementUpload({ existingLoads, trucks, existingExpenses, onExpensesImported, orgId, onClose, initialWeekEnd }: StatementUploadProps) {
  const { endDay: weekEndDay, startsOn, startName, endName } = useSettlementWeekSetting();
  // The settlement week being worked. Statements arrive after a week ends, so it opens on the last finished week.
  const [weekOffset, setWeekOffset] = useState(-1);
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [isProving, setIsProving] = useState(false);
  const frame = useMemo(() => weekFrame(new Date(), weekOffset, startsOn), [weekOffset, startsOn]);
  const choices = useMemo(() => weekChoices(new Date(), startsOn, Math.max(8, 1 - weekOffset)), [startsOn, weekOffset]);
  useEffect(() => {
    if (!initialWeekEnd) return;
    const thisWeekEnd = weekFrame(new Date(), 0, startsOn).endIso;
    const diffDays = Math.round((new Date(`${initialWeekEnd}T00:00:00`).getTime() - new Date(`${thisWeekEnd}T00:00:00`).getTime()) / 86_400_000);
    const offset = Math.round(diffDays / 7);
    if (offset <= 0 && offset >= -52) setWeekOffset(offset);
  }, [initialWeekEnd, startsOn]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { landstarSplit } = usePaySettings();
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
    return ext.endsWith('.xlsx') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
      return name.endsWith('.pdf') || name.endsWith('.xlsx');
    });

    if (validFiles.length === 0) {
      toast.error('Please upload PDF or XLSX files only');
      return;
    }

    const newStaged: StagedFile[] = validFiles.map(file => ({
      file,
      type: detectFileType(file),
      status: 'pending',
    }));

    setStagedFiles(prev => mergeStagedFiles(prev, newStaged));

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

  // A PDF is read by an AI service and can take a minute. Every file is read at the same time, each with its own
  // status and time limit, so one slow or stuck file can no longer freeze the whole import.
  const PDF_TIMEOUT_MS = 150_000;

  const withTimeout = <T,>(work: Promise<T>, ms: number, message: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      work.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });

  const parseOne = async (sf: StagedFile): Promise<StagedFile> => {
    try {
      const isExcel = isExcelFile(sf.file);
      let data: any;

      if (isExcel) {
        const buffer = await sf.file.arrayBuffer();
        data = await parseLandstarXlsx(buffer);
      } else {
        const pdfBase64 = await convertFileToBase64(sf.file);
        if (!pdfBase64 || pdfBase64.length < 100) throw new Error('Could not read PDF file.');
        const { data: fnData, error: fnError } = await withTimeout(
          supabase.functions.invoke('parse-landstar-statement', { body: { pdfBase64 } }),
          PDF_TIMEOUT_MS,
          'Reading this PDF took too long. Press Try again.',
        );
        if (fnError) throw new Error(fnError.message || 'Failed to parse statement');
        if (fnData.error) throw new Error(fnData.error);
        data = fnData;
      }

      // A PDF's real type is what the parser found, not what its filename suggested.
      const type = isExcel ? sf.type : typeFromParsedPdf(data?.statement_type, sf.type);
      return { ...sf, type, status: 'parsed', data, error: undefined };
    } catch (err) {
      return { ...sf, status: 'error', error: err instanceof Error ? err.message : 'Parse failed' };
    }
  };

  const processDocuments = async () => {
    if (stagedFiles.length === 0) return;
    setIsProcessing(true);
    setError(null);

    // Mark what is about to be read, then read everything at once, updating each row the moment it finishes.
    setStagedFiles((prev) => prev.map((f) => (f.status === 'parsed' ? f : { ...f, status: 'parsing', error: undefined })));
    const updatedFiles = await Promise.all(
      stagedFiles.map(async (sf) => {
        if (sf.status === 'parsed') return sf;
        const done = await parseOne(sf);
        setStagedFiles((prev) => prev.map((p) => (p.file === done.file ? done : p)));
        return done;
      }),
    );

    setStagedFiles(updatedFiles);

    const parsedCount = updatedFiles.filter(f => f.status === 'parsed').length;
    const errorCount = updatedFiles.filter(f => f.status === 'error').length;

    if (parsedCount === 0) {
      setError('All files failed to parse');
      setIsProcessing(false);
      return;
    }

    // Reconcile (includes per-trip + period revenue cross-check against fleet_loads)
    const result = reconcileDocuments(updatedFiles, existingLoads, landstarSplit, new Date(), weekEndDay);
    setReconciliationResult(result);

    // Save files to documents
    for (const sf of updatedFiles) {
      if (sf.status === 'parsed') {
        saveToDocuments(sf.file);
      }
    }

    const totalItems = result.expenses.length + result.advances.length + result.credits.length;
    const msg = `Processed ${parsedCount} file(s): ${totalItems} items (${result.expenses.length} expenses, ${result.advances.length} advances, ${result.credits.length} credits)`;
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
    setSummary(null);
    setError(null);
  };

  /** After the import: prove the week against Landstar's Freight Bill Details (if it was read) and show the result. */
  const handleImported = async (outcome?: ImportOutcome) => {
    onExpensesImported();
    setIsProving(true);
    try {
      const freight = stagedFiles.find((f) => f.type === 'freight_bill_xlsx' && f.status === 'parsed');
      let proof = null;
      if (freight) {
        const lines = await readSettlementLines(await freight.file.arrayBuffer());
        const { loads, expenses } = await fetchProofInputs();
        proof = proveTrips(lines, loads, expenses);
      }
      const week = summarizeWeek(frame, proof, outcome ?? null);
      setSummary(week);
      void rememberProvedWeek(week);
    } catch (err) {
      // Never leave the office with a silent import: say the proof could not be run.
      toast.error(err instanceof Error ? `The week was imported but could not be proven: ${err.message}` : 'The week was imported but could not be proven');
      const week = summarizeWeek(frame, null, outcome ?? null);
      setSummary(week);
      void rememberProvedWeek(week);
    } finally {
      setIsProving(false);
    }
  };

  /** Remember how this week ended, so Today can ask for it again if it is not proved or trips are still open. */
  const rememberProvedWeek = async (week: WeekSummary) => {
    if (!orgId) return;
    try {
      const record = recordFromSummary(week, missingDocuments(stagedFiles).map((m) => m.label));
      const { error: saveError } = await supabase
        .from('company_settings')
        .upsert({ org_id: orgId, setting_key: provedWeekKey(week.frame.endIso), setting_value: serializeRecord(record) }, { onConflict: 'org_id,setting_key' });
      if (saveError) throw saveError;
      queryClient.invalidateQueries({ queryKey: ['executive-pending-actions'] });
    } catch (err) {
      // Not worth interrupting the office: the import itself worked, Today just will not remember it.
      console.warn('[Statement] Could not save the proved-week note', err);
    }
  };

  const handleDone = () => {
    handleCancel();
    onClose?.();
  };

  const docStates = documentStates(stagedFiles);
  const missing = missingDocuments(stagedFiles);
  const periodNote = reconciliationResult ? periodMatchNote(frame, reconciliationResult.periodStart, reconciliationResult.periodEnd) : null;

  // Which types are staged?
  const stagedTypes = new Set(stagedFiles.map(f => f.type));

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5" />
          Prove a Landstar settlement week
        </CardTitle>
        <CardDescription>
          Add the week's Landstar documents, then prove the week. Nothing is imported twice, and anything left out is listed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The settlement week being worked */}
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-condensed text-xl font-bold leading-tight">{frame.label}</p>
              <p className="text-[13px] text-muted-foreground">
                Landstar settlement week, {startName} to {endName} ({frame.range}), not a calendar Monday to Sunday week.
              </p>
            </div>
          </div>
          <Select value={String(weekOffset)} onValueChange={(v) => setWeekOffset(Number(v))} disabled={isProcessing || isProving || !!reconciliationResult}>
            <SelectTrigger className="h-11 sm:h-10 sm:w-56" aria-label="Settlement week">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.offset} value={String(c.offset)}>
                  {c.offset === 0 ? 'This week' : c.offset === -1 ? 'Last week' : `${-c.offset} weeks ago`}: ends {c.endIso.slice(5).replace('-', '/')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Show dropzone + checklist when no reconciliation result */}
        {!reconciliationResult && !summary && (
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
              <p className="text-sm font-medium">Drop statement files here (PDF & XLSX)</p>
              <p className="text-xs text-muted-foreground">
                Supports Card Activity PDF, Contractor PDF, Settlement XLSX, Freight Bill XLSX
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Document checklist: all four, from the start, so what is missing is plain */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Documents for this week</p>
              <div className="grid gap-2">
                {WEEK_DOCUMENTS.map((doc) => {
                  const st = docStates.find((d) => d.type === doc.type)!;
                  const staged = st.file;
                  const has = st.status !== 'missing';
                  return (
                    <div
                      key={doc.type}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
                        st.status === 'parsed' && 'border-success/40 bg-success/5',
                        st.status === 'error' && 'border-destructive/40 bg-destructive/5',
                        (st.status === 'missing') && 'border-border bg-muted/30',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {st.status === 'parsed' ? (
                          <CheckCircle className="h-4 w-4 text-success" />
                        ) : st.status === 'error' ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : has ? (
                          <div className="h-4 w-4 rounded-full border-2 border-primary" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        <span className="flex items-center gap-1.5">
                          {TYPE_ICONS[doc.type]}
                          {doc.label} <span className="text-muted-foreground">({doc.short})</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {staged && (
                          <span className="max-w-[160px] truncate text-xs text-muted-foreground">{staged.file.name}</span>
                        )}
                        {st.status === 'missing' && <Badge variant="outline" className="text-xs">Missing</Badge>}
                        {st.status === 'staged' && <Badge variant="outline" className="text-xs">Added</Badge>}
                        {st.status === 'parsing' && (
                          <Badge variant="outline" className="text-xs"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Reading…</Badge>
                        )}
                        {st.status === 'error' && (
                          <>
                            <Badge variant="destructive" className="text-xs" title={staged?.error}>Failed</Badge>
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={isProcessing} onClick={(e) => { e.stopPropagation(); void processDocuments(); }}>
                              Try again
                            </Button>
                          </>
                        )}
                        {st.status === 'parsed' && (
                          <Badge className="text-xs bg-success/20 text-success border-success/30">Read OK</Badge>
                        )}
                        {staged && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Remove ${staged.file.name}`}
                            disabled={isProcessing}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(stagedFiles.indexOf(staged));
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {stagedFiles.some((f) => f.type === 'unknown') && (
                <p className="flex items-start gap-2 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {stagedFiles.filter((f) => f.type === 'unknown').map((f) => f.file.name).join(', ')}: could not tell which Landstar document this is yet. PDFs are identified once read.
                </p>
              )}

              {stagedFiles.length > 0 && missing.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 text-warning" /> You can still prove the week, with these gaps
                  </p>
                  <ul className="space-y-1 text-[13px] text-muted-foreground">
                    {missing.map((m) => (
                      <li key={m.label}><span className="font-medium text-foreground">{m.label}:</span> {m.meaning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {isProcessing && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Reading your files. The PDFs can take a minute or two. You can leave this window open.
                </p>
              )}
              {stagedFiles.some((f) => f.status === 'error') && !isProcessing && (
                <ul className="space-y-1 text-sm text-destructive">
                  {stagedFiles.filter((f) => f.status === 'error').map((f) => (
                    <li key={f.file.name}>{f.file.name}: {f.error}</li>
                  ))}
                </ul>
              )}

              {/* Prove button */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" className="h-12 sm:h-10" onClick={handleCancel} disabled={isProcessing || stagedFiles.length === 0}>
                  Clear all
                </Button>
                <Button
                  onClick={processDocuments}
                  disabled={isProcessing || stagedFiles.length === 0}
                  className="h-12 sm:h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isProcessing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Prove this week
                  {stagedFiles.length > 0 && ` (${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''})`}
                </Button>
              </div>
            </div>
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

        {/* Proving after the import */}
        {isProving && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <Loader2 className="h-4 w-4 animate-spin" /> Proving {frame.label.toLowerCase()} against Landstar…
          </p>
        )}

        {/* What matched, what was imported, what is still open */}
        {summary && <WeekStatementSummary summary={summary} onDone={handleDone} />}

        {/* Reconciliation Preview */}
        {reconciliationResult && !summary && !isProving && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-medium">
                  Read {stagedFiles.filter(f => f.status === 'parsed').length} documents for the {frame.label.toLowerCase()}. Review below, then import.
                </p>
                {reconciliationResult.periodStart && (
                  <p className="text-xs text-muted-foreground">
                    Statements cover: {reconciliationResult.periodStart} to {reconciliationResult.periodEnd}
                    {reconciliationResult.unitNumber && ` • Unit ${reconciliationResult.unitNumber}`}
                  </p>
                )}
              </div>
            </div>
            {periodNote && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                {periodNote}
              </p>
            )}
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
