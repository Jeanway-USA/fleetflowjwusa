import { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { FileSpreadsheet, Upload, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  downloadTaxDocument,
  useDeleteTaxDocument,
  useTaxDocuments,
  useUploadTaxDocument,
} from '@/hooks/useDriverTaxDocuments';

interface Props {
  driver: { id: string; user_id: string | null; first_name?: string | null; last_name?: string | null };
}

export function DriverTaxDocuments({ driver }: Props) {
  const driverId = driver.id;
  const hasUserAccount = !!driver.user_id;
  const { data: docs = [], isLoading } = useTaxDocuments(driverId);
  const upload = useUploadTaxDocument();
  const remove = useDeleteTaxDocument(driverId);
  const fileRef = useRef<HTMLInputElement>(null);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, i) => current - i);
  }, []);
  const [year, setYear] = useState<string>(String(new Date().getFullYear() - 1));
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async () => {
    if (!hasUserAccount) return;
    if (!file) return;
    await upload.mutateAsync({
      driverId,
      taxYear: Number(year),
      file,
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Tax Documents (1099-NEC)</h4>
          <p className="text-[11px] text-muted-foreground">
            Upload signed 1099 PDFs. Only this driver and admins can access them.
          </p>
        </div>
      </div>

      {!driverUserId ? (
        <p className="text-xs text-muted-foreground italic">
          This driver has no linked user account. They must accept their invite before tax
          documents can be uploaded.
        </p>
      ) : (
        <>
          {/* Upload form */}
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto] gap-2 items-end">
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Tax Year
              </label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                PDF File
              </label>
              <Input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!file || upload.isPending}
              className="gap-2"
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload
            </Button>
          </div>

          {/* List */}
          <div className="border-t border-border pt-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Uploaded Documents
            </p>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : docs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No 1099 documents uploaded yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/30 border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        1099-NEC · {doc.tax_year}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Uploaded {format(parseISO(doc.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          downloadTaxDocument(
                            doc.file_path,
                            `1099-NEC-${doc.tax_year}.pdf`,
                          ).catch(() => {})
                        }
                        title="Download"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete 1099 document?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently removes the {doc.tax_year} 1099-NEC for this
                              driver. They will no longer be able to download it.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => remove.mutate(doc)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
