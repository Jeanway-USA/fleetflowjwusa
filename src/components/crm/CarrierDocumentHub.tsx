import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Award, ShieldCheck, FileCheck2, Send, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentViewer } from '@/components/shared/DocumentViewer';
import { format } from 'date-fns';

interface DocType {
  type: string;
  label: string;
  icon: React.ElementType;
}

const DOC_TYPES: DocType[] = [
  { type: 'W-9', label: 'W-9 Form', icon: FileText },
  { type: 'MC Authority', label: 'MC Authority Certificate', icon: Award },
  { type: 'COI', label: 'Certificate of Insurance (COI)', icon: ShieldCheck },
  { type: 'NOA', label: 'Notice of Assignment (NOA)', icon: FileCheck2 },
];

const DEFAULT_MESSAGE = `Hi,

I'd like to be set up as a carrier with your brokerage. Please find attached my carrier packet documents including my W-9, MC Authority, Certificate of Insurance, and Notice of Assignment.

Please let me know if you need any additional information.

Thank you!`;

export function CarrierDocumentHub() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [selected, setSelected] = useState<string[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch carrier packet documents from DB
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['carrier-packet-documents', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('related_type', 'carrier_packet')
        .in('document_type', ['W-9', 'MC Authority', 'COI', 'NOA'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Get the latest document for each type
  const docByType = (type: string) => documents.find((d) => d.document_type === type);

  const handleUpload = async (docType: string, file: File) => {
    if (!orgId) {
      toast.error('No organization found');
      return;
    }

    setUploading(docType);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const filePath = `${orgId}/carrier-packet/${docType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.${fileExt}`;

      // Upload directly to native storage (bypass Google Drive)
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Delete the old document record if one exists
      const existing = docByType(docType);
      if (existing) {
        // Remove old file from storage
        await supabase.storage.from('documents').remove([existing.file_path]);
        // Delete old DB record
        await supabase.from('documents').delete().eq('id', existing.id);
      }

      // Insert new document record
      const { error: dbError } = await supabase.from('documents').insert({
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        document_type: docType as any,
        related_type: 'carrier_packet' as any,
        related_id: orgId,
        uploaded_by: user.id,
        org_id: orgId,
      });

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['carrier-packet-documents', orgId] });
      toast.success(`${docType} uploaded successfully`);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleFileSelect = (docType: string) => {
    const input = fileInputRefs.current[docType];
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const uploadedDocTypes = DOC_TYPES.filter((dt) => !!docByType(dt.type));

  const toggleDoc = (docId: string) => {
    setSelected((prev) => (prev.includes(docId) ? prev.filter((s) => s !== docId) : [...prev, docId]));
  };

  const handleSend = async () => {
    if (!email) {
      toast.error('Please enter a broker email address');
      return;
    }
    if (selected.length === 0) {
      toast.error('Please select at least one document to attach');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-carrier-packet', {
        body: {
          recipientEmail: email,
          message,
          documentIds: selected,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Carrier packet sent to ${email}`);
      setEmail('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send carrier packet');
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DOC_TYPES.map((dt) => {
          const Icon = dt.icon;
          const doc = docByType(dt.type);
          const isUploading = uploading === dt.type;

          return (
            <Card key={dt.type}>
              <CardContent className="p-5 flex items-start gap-4">
                <div className="rounded-lg bg-muted p-3">
                  <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-medium text-sm leading-tight">{dt.label}</p>
                  {doc ? (
                    <>
                      <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                        Uploaded {format(new Date(doc.created_at), 'MMM d, yyyy')}
                      </Badge>
                      <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                      <div className="flex gap-2 pt-1">
                        <DocumentViewer
                          storedPath={doc.file_path}
                          fileName={doc.file_name}
                          bucket="documents"
                        />
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleFileSelect(dt.type)}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          Update
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                        Missing
                      </Badge>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleFileSelect(dt.type)}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          Upload
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                {/* Hidden file input */}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  ref={(el) => { fileInputRefs.current[dt.type] = el; }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(dt.type, file);
                  }}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Send Carrier Packet */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Send Carrier Packet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="broker-email" className="text-sm font-medium">
              Broker Email Address
            </label>
            <Input
              id="broker-email"
              type="email"
              placeholder="dispatch@brokerage.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="packet-message" className="text-sm font-medium">
              Message
            </label>
            <Textarea
              id="packet-message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Attach Documents</p>
            {uploadedDocTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents uploaded yet. Upload your documents above first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {uploadedDocTypes.map((dt) => {
                  const doc = docByType(dt.type);
                  if (!doc) return null;
                  return (
                    <label key={dt.type} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={selected.includes(doc.id)}
                        onCheckedChange={() => toggleDoc(doc.id)}
                      />
                      {dt.label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            onClick={handleSend}
            className="gap-2"
            disabled={sending || uploadedDocTypes.length === 0}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Packet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
