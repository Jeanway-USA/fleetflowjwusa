import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, ArrowRight, Check, AlertTriangle } from 'lucide-react';

export interface CSVField {
  key: string;
  label: string;
  required?: boolean;
}

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  fields: CSVField[];
  queryKey: string[];
  title?: string;
}

type Step = 'upload' | 'map' | 'preview';

export function CSVImportDialog({ open, onOpenChange, tableName, fields, queryKey, title }: CSVImportDialogProps) {
  const queryClient = useQueryClient();
  const { orgId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setImporting(false);
    setDragOver(false);
  }, []);

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  // Fuzzy match CSV header to a field key
  const autoMatch = useCallback((header: string): string => {
    const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const f of fields) {
      const k = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
      const l = f.label.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h === k || h === l || h.includes(k) || k.includes(h)) return f.key;
    }
    return '__skip__';
  }, [fields]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length || !results.meta.fields?.length) {
          toast.error('CSV file is empty or has no headers');
          return;
        }
        const headers = results.meta.fields;
        setCsvHeaders(headers);
        setCsvRows(results.data);
        // Auto-map
        const autoMap: Record<string, string> = {};
        headers.forEach(h => { autoMap[h] = autoMatch(h); });
        setMapping(autoMap);
        setStep('map');
      },
      error: () => toast.error('Failed to parse CSV'),
    });
  }, [autoMatch]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const mappedRows = csvRows.map(row => {
    const mapped: Record<string, unknown> = {};
    Object.entries(mapping).forEach(([csvCol, fieldKey]) => {
      if (fieldKey !== '__skip__' && row[csvCol] !== undefined && row[csvCol] !== '') {
        mapped[fieldKey] = row[csvCol];
      }
    });
    return mapped;
  });

  const requiredKeys = fields.filter(f => f.required).map(f => f.key);
  const mappedFieldKeys = new Set(Object.values(mapping).filter(v => v !== '__skip__'));
  const missingRequired = requiredKeys.filter(k => !mappedFieldKeys.has(k));

  const isRowValid = (row: Record<string, unknown>) =>
    requiredKeys.every(k => row[k] !== undefined && row[k] !== '');

  const validCount = mappedRows.filter(isRowValid).length;

  const handleImport = async () => {
    if (!orgId) {
      toast.error('Organization not found');
      return;
    }
    const validRows = mappedRows.filter(isRowValid).map(row => ({
      ...row,
      org_id: orgId,
    }));
    if (!validRows.length) {
      toast.error('No valid rows to import');
      return;
    }
    setImporting(true);
    try {
      const { error } = await supabase.from(tableName as any).insert(validRows as any);
      if (error) throw error;
      toast.success(`Successfully imported ${validRows.length} records`);
      queryClient.invalidateQueries({ queryKey });
      handleClose(false);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {title || 'Import CSV'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Badge variant={step === 'upload' ? 'default' : 'secondary'} className="text-xs">1. Upload</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 'map' ? 'default' : 'secondary'} className="text-xs">2. Map Columns</Badge>
          <ArrowRight className="h-3 w-3" />
          <Badge variant={step === 'preview' ? 'default' : 'secondary'} className="text-xs">3. Preview & Import</Badge>
        </div>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">Drop your CSV file here</p>
            <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {/* STEP 2: Map Columns */}
        {step === 'map' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found <strong>{csvRows.length}</strong> rows and <strong>{csvHeaders.length}</strong> columns. Map your CSV columns to database fields:
            </p>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {csvHeaders.map(header => (
                <div key={header} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-40 truncate shrink-0" title={header}>{header}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select
                    value={mapping[header] || '__skip__'}
                    onValueChange={v => setMapping(prev => ({ ...prev, [header]: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">— Skip —</SelectItem>
                      {fields.map(f => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}{f.required ? ' *' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Required fields not mapped: {missingRequired.map(k => fields.find(f => f.key === k)?.label).join(', ')}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={() => setStep('preview')} disabled={missingRequired.length > 0}>
                Preview <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 3: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Previewing first 3 rows. <strong>{validCount}</strong> of {csvRows.length} rows are valid for import.
            </p>
            <div className="rounded-lg border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-8">#</TableHead>
                    {fields.filter(f => mappedFieldKeys.has(f.key)).map(f => (
                      <TableHead key={f.key} className="text-xs">
                        {f.label}{f.required ? ' *' : ''}
                      </TableHead>
                    ))}
                    <TableHead className="w-16 text-xs">Valid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mappedRows.slice(0, 3).map((row, i) => {
                    const valid = isRowValid(row);
                    return (
                      <TableRow key={i} className={valid ? '' : 'bg-destructive/5'}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        {fields.filter(f => mappedFieldKeys.has(f.key)).map(f => (
                          <TableCell key={f.key} className="text-xs max-w-[150px] truncate">
                            {(row[f.key] as string) || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        ))}
                        <TableCell>
                          {valid
                            ? <Check className="h-4 w-4 text-green-600" />
                            : <AlertTriangle className="h-4 w-4 text-destructive" />}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
              <LoadingButton
                onClick={handleImport}
                loading={importing}
                loadingText="Importing..."
                className="gradient-gold text-primary-foreground"
                disabled={validCount === 0}
              >
                Confirm Import ({validCount} rows)
              </LoadingButton>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
