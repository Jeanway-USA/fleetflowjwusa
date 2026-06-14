import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, CheckCircle, Upload, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import { compressImage } from '@/lib/compress-image';
import { useOfflineDocumentQueue } from '@/hooks/useOfflineDocumentQueue';
import { PhotoQualityGate } from './PhotoQualityGate';

interface DocumentScanButtonProps {
  driverId: string;
}

const DOC_TYPES = [
  { value: 'bol', label: 'Bill of Lading (BOL)' },
  { value: 'fuel_receipt', label: 'Fuel Receipt' },
  { value: 'lumper_receipt', label: 'Lumper Receipt' },
  { value: 'scale_ticket', label: 'Scale Ticket' },
  { value: 'delivery_receipt', label: 'Delivery Receipt' },
  { value: 'other', label: 'Other Document' },
];

export function DocumentScanButton({ driverId }: DocumentScanButtonProps) {
  const { user } = useAuth();
  const { upload } = useStorageProvider();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [docType, setDocType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [qualityGateOpen, setQualityGateOpen] = useState(false);
  const [showJustSynced, setShowJustSynced] = useState(false);

  const {
    isOnline,
    queuedCount,
    isSyncing,
    lastSyncedAt,
    enqueue: enqueueOfflineDoc,
  } = useOfflineDocumentQueue();

  // Flash a green "All documents uploaded" confirmation after a drain completes.
  useEffect(() => {
    if (lastSyncedAt && queuedCount === 0 && !isSyncing) {
      setShowJustSynced(true);
      const t = setTimeout(() => setShowJustSynced(false), 4000);
      return () => clearTimeout(t);
    }
  }, [lastSyncedAt, queuedCount, isSyncing]);

  const queueCurrentForOffline = async (
    fileToUpload: File | Blob,
    fileName: string,
    mimeType: string,
    fileSize: number
  ) => {
    if (!user?.id) throw new Error('Not signed in');
    await enqueueOfflineDoc({
      blob: fileToUpload,
      fileName,
      mimeType,
      fileSize,
      documentType: docType,
      driverId,
      uploadedBy: user.id,
      relatedType: 'driver',
      relatedId: driverId,
    });
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !docType) throw new Error('Missing file or document type');

      // Quality-gate already passed. Compress images now (PDFs untouched).
      const fileToUpload = selectedFile.type.startsWith('image/')
        ? await compressImage(selectedFile)
        : selectedFile;

      const fileExt = (fileToUpload.name.split('.').pop() || 'bin').toLowerCase();

      // OFFLINE PATH — persist to IndexedDB; sync hook drains on reconnect.
      if (!navigator.onLine) {
        await queueCurrentForOffline(
          fileToUpload,
          fileToUpload.name,
          fileToUpload.type,
          fileToUpload.size
        );
        return { queued: true as const };
      }

      // ONLINE PATH — direct upload; fall back to the queue on transient failure.
      const filePath = `${driverId}/${Date.now()}.${fileExt}`;
      try {
        const { path, error: uploadError } = await upload('documents', filePath, fileToUpload);
        if (uploadError || !path) throw uploadError || new Error('Upload failed');

        const { error: dbError } = await supabase.from('documents').insert({
          file_name: fileToUpload.name,
          file_path: path,
          file_size: fileToUpload.size,
          document_type: docType,
          uploaded_by: user?.id,
          related_type: 'driver',
          related_id: driverId,
        });
        if (dbError) throw dbError;
        return { queued: false as const };
      } catch (err: any) {
        const looksTransient =
          !navigator.onLine ||
          err?.name === 'TypeError' ||
          /network|failed to fetch|load failed/i.test(err?.message ?? '');
        if (looksTransient) {
          await queueCurrentForOffline(
            fileToUpload,
            fileToUpload.name,
            fileToUpload.type,
            fileToUpload.size
          );
          return { queued: true as const };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      if (!result?.queued) {
        toast.success('Document uploaded successfully');
      }
      handleReset();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error('Failed to upload: ' + error.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      // Force the quality gate. Don't mark the file as ready to upload yet.
      setPendingFile(file);
      setQualityGateOpen(true);
    } else {
      // PDFs (and similar) skip the visual gate — quality isn't verifiable as an image.
      setSelectedFile(file);
      setPreview(null);
    }

    // Allow re-selecting the same file later.
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRetake = () => {
    setQualityGateOpen(false);
    setPendingFile(null);
    // Reopen the camera/file picker so the driver can immediately retake.
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const handleConfirmQuality = () => {
    if (!pendingFile) {
      setQualityGateOpen(false);
      return;
    }
    setSelectedFile(pendingFile);
    // Build an inline thumbnail for the upload dialog.
    const reader = new FileReader();
    reader.onload = (event) => setPreview(event.target?.result as string);
    reader.readAsDataURL(pendingFile);
    setPendingFile(null);
    setQualityGateOpen(false);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setPendingFile(null);
    setQualityGateOpen(false);
    setDocType('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }
    if (!docType) {
      toast.error('Please select a document type');
      return;
    }
    uploadMutation.mutate();
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-16 flex-col gap-1 w-full">
          <Camera className="h-5 w-5" />
          <span className="text-xs">Scan Doc</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
        </DialogHeader>

        {/* Offline queue status — yellow while pending/syncing, green when freshly drained */}
        {(queuedCount > 0 || isSyncing || showJustSynced) && (
          <div
            className={
              isSyncing || queuedCount > 0
                ? 'flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/15 border border-amber-500/30'
                : 'flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-500/15 border border-emerald-500/30'
            }
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-spin" />
            ) : queuedCount > 0 ? (
              <CloudOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            )}
            <span
              className={
                isSyncing || queuedCount > 0
                  ? 'text-xs font-semibold text-amber-700 dark:text-amber-300'
                  : 'text-xs font-semibold text-emerald-700 dark:text-emerald-300'
              }
            >
              {isSyncing
                ? 'Uploading queued documents…'
                : queuedCount > 0
                  ? `${queuedCount} queued for upload${isOnline ? '' : ' — offline'}`
                  : 'All documents uploaded'}
            </span>
          </div>
        )}

        <div className="space-y-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label>Take Photo or Select File</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full h-32 border-dashed flex-col gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <img 
                  src={preview} 
                  alt="Preview" 
                  className="max-h-24 max-w-full object-contain rounded"
                />
              ) : selectedFile ? (
                <>
                  <CheckCircle className="h-8 w-8 text-success" />
                  <span className="text-sm text-muted-foreground truncate max-w-full px-2">
                    {selectedFile.name}
                  </span>
                </>
              ) : (
                <>
                  <Camera className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Tap to take photo or select file
                  </span>
                </>
              )}
            </Button>
          </div>

          {/* Document Type */}
          <div className="space-y-2">
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={!selectedFile || !docType || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      <PhotoQualityGate
        open={qualityGateOpen}
        file={pendingFile}
        onRetake={handleRetake}
        onConfirm={handleConfirmQuality}
      />
    </Dialog>
  );
}
