import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, CheckCircle, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

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
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [docType, setDocType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !docType) throw new Error('Missing file or document type');

      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${driverId}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, selectedFile);
      
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(fileName);

      // Save document record
      const { error: dbError } = await supabase.from('documents').insert({
        file_name: selectedFile.name,
        file_path: urlData.publicUrl,
        file_size: selectedFile.size,
        document_type: docType,
        uploaded_by: user?.id,
        related_type: 'driver',
        related_id: driverId,
      });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast.success('Document uploaded successfully');
      handleReset();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error('Failed to upload: ' + error.message);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setPreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
      }
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
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
    </Dialog>
  );
}
