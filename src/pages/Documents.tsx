import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { DocumentViewer } from '@/components/shared/DocumentViewer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Upload, Trash2, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useStorageProvider } from '@/hooks/useStorageProvider';
import type { Database } from '@/integrations/supabase/types';

type Document = Database['public']['Tables']['documents']['Row'];

const documentCategories = [
  { value: 'all', label: 'All Documents' },
  { value: 'BOL', label: 'BOL' },
  { value: 'POD', label: 'POD' },
  { value: 'Rate Confirmation', label: 'Rate Confirmations' },
  { value: 'Statement', label: 'Statements' },
  { value: 'Receipt', label: 'Receipts' },
  { value: 'Invoice', label: 'Invoices' },
  { value: 'License', label: 'Licenses' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Inspection', label: 'Inspections' },
  { value: 'Other', label: 'Other' },
];

export default function Documents() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const { upload: storageUpload, remove: storageRemove } = useStorageProvider();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState('BOL');
  const [filterType, setFilterType] = useState('all');

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['all-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: Document) => {
      if (doc.file_path) {
        await storageRemove('documents', doc.file_path);
      }
      const { error } = await supabase.from('documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-documents'] });
      toast.success('Document deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const filePath = `general/${Date.now()}.${fileExt}`;

      const { path, error: uploadError } = await storageUpload('documents', filePath, file);

      if (uploadError || !path) throw uploadError || new Error('Upload failed');

      const { error: dbError } = await supabase.from('documents').insert({
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        document_type: selectedType,
        related_type: 'general',
        uploaded_by: user.id,
        org_id: orgId,
      });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['all-documents'] });
      toast.success('Document uploaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredDocuments = filterType === 'all' 
    ? documents 
    : documents.filter(d => d.document_type === filterType);

  const columns = [
    { key: 'file_name', header: 'File Name' },
    { key: 'document_type', header: 'Type' },
    { key: 'related_type', header: 'Related To', render: (d: Document) => d.related_type || '-' },
    { key: 'file_size', header: 'Size', render: (d: Document) => formatFileSize(d.file_size) },
    { key: 'created_at', header: 'Uploaded', render: (d: Document) => new Date(d.created_at).toLocaleDateString() },
    {
      key: 'actions',
      header: 'Actions',
      render: (doc: Document) => (
        <div className="flex gap-1">
          <DocumentViewer storedPath={doc.file_path} fileName={doc.file_name} />
          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(doc)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Documents" description="Upload and manage BOLs, PODs, receipts, and other documents" />
      
      <div className="space-y-6">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Documents
            </CardTitle>
            <CardDescription>Upload new documents to the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Type</label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {documentCategories.filter(c => c.value !== 'all').map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFileUpload}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gradient-gold text-primary-foreground"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Uploading...' : 'Choose File'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                All Documents
              </CardTitle>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentCategories.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <DataTable 
              columns={columns} 
              data={filteredDocuments} 
              loading={isLoading} 
              emptyMessage="No documents uploaded yet"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
