import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SAFETY_KEY } from '@/hooks/useSafetyData';
import { todayLocal } from '@/lib/datetime';
import { latestFile } from '@/lib/safety/compliance';
import { KIND_LABEL, openSafetyFile, uploadSafetyFile, type FileKind, type SafetyFile, type SubjectType } from '@/lib/safety/files';

/** The file of one kind for one driver or truck: the newest copy, how to open it, and how to replace it. Older copies stay on record. */
export function SafetyFileSlot({ subjectType, subjectId, kind, files, ready, canEdit, orgId, userId, dateLabel }: {
  subjectType: SubjectType; subjectId: string; kind: FileKind; files: SafetyFile[]; ready: boolean; canEdit: boolean; orgId: string | null; userId: string | null;
  /** What the date means for this kind of file, for example "Date the MVR was pulled". */
  dateLabel: string;
}) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(todayLocal());
  const current = latestFile(files, subjectId, kind) as SafetyFile | null;
  const older = files.filter((f) => f.subject_id === subjectId && f.kind === kind).length - (current ? 1 : 0);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!orgId) throw new Error('Not signed in to an organization.');
      await uploadSafetyFile({ orgId, userId, subjectType, subjectId, kind, file, docDate: date });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: SAFETY_KEY }); setAdding(false); toast.success(`${KIND_LABEL[kind]} saved.`); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!ready) return <p className="text-xs text-muted-foreground">Uploads are not switched on yet. The database update for the Safety page has not been applied.</p>;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium">{KIND_LABEL[kind]}</p>
        {current && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => openSafetyFile(current.file_path).catch((e: Error) => toast.error(e.message))}>
            <ExternalLink className="mr-1.5 h-4 w-4" />Open
          </Button>
        )}
        {canEdit && !adding && <Button variant="outline" size="sm" className="h-9" onClick={() => setAdding(true)}><Upload className="mr-1.5 h-4 w-4" />{current ? 'Replace' : 'Upload'}</Button>}
      </div>
      <p className="text-sm text-muted-foreground">
        {current ? `${current.file_name}${current.doc_date ? `, dated ${format(parseISO(current.doc_date), 'MMM d, yyyy')}` : ''}${older > 0 ? `. ${older} older ${older === 1 ? 'copy' : 'copies'} kept.` : ''}` : 'Nothing uploaded yet.'}
      </p>
      {adding && (
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">{dateLabel}</Label><Input type="date" className="h-10" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></div>
          <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f); }} />
          <Button className="h-10" disabled={upload.isPending || !date} onClick={() => input.current?.click()}>{upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Choose file</Button>
          <Button variant="ghost" className="h-10" disabled={upload.isPending} onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
