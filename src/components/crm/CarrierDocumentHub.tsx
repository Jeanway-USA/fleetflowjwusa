import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Award, ShieldCheck, FileCheck2, Send, Eye, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface DocInfo {
  id: string;
  label: string;
  icon: React.ElementType;
  status: 'valid' | 'missing' | 'expiring';
  statusText: string;
}

const DOCUMENTS: DocInfo[] = [
  { id: 'w9', label: 'W-9 Form', icon: FileText, status: 'valid', statusText: 'Valid through 12/31/2026' },
  { id: 'mc', label: 'MC Authority Certificate', icon: Award, status: 'valid', statusText: 'Active — MC-123456' },
  { id: 'coi', label: 'Certificate of Insurance (COI)', icon: ShieldCheck, status: 'expiring', statusText: 'Expires 06/15/2026' },
  { id: 'noa', label: 'Notice of Assignment (NOA)', icon: FileCheck2, status: 'missing', statusText: 'Missing' },
];

const STATUS_STYLES: Record<string, string> = {
  valid: 'bg-green-500/10 text-green-700 border-green-500/30',
  expiring: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  missing: 'bg-destructive/10 text-destructive border-destructive/30',
};

const DEFAULT_MESSAGE = `Hi,

I'd like to be set up as a carrier with your brokerage. Please find attached my carrier packet documents including my W-9, MC Authority, Certificate of Insurance, and Notice of Assignment.

Please let me know if you need any additional information.

Thank you!`;

export function CarrierDocumentHub() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [selected, setSelected] = useState<string[]>(DOCUMENTS.map((d) => d.id));

  const toggleDoc = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleSend = () => {
    if (!email) {
      toast.error('Please enter a broker email address');
      return;
    }
    if (selected.length === 0) {
      toast.error('Please select at least one document to attach');
      return;
    }
    const names = DOCUMENTS.filter((d) => selected.includes(d.id)).map((d) => d.label);
    toast.success(`Carrier packet sent to ${email}`, {
      description: `Attached: ${names.join(', ')}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DOCUMENTS.map((doc) => {
          const Icon = doc.icon;
          return (
            <Card key={doc.id}>
              <CardContent className="p-5 flex items-start gap-4">
                <div className="rounded-lg bg-muted p-3">
                  <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-medium text-sm leading-tight">{doc.label}</p>
                  <Badge variant="outline" className={STATUS_STYLES[doc.status]}>
                    {doc.statusText}
                  </Badge>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </Button>
                    <Button size="sm" className="gap-1.5">
                      <Upload className="h-3.5 w-3.5" /> {doc.status === 'missing' ? 'Upload' : 'Update'}
                    </Button>
                  </div>
                </div>
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
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {DOCUMENTS.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={selected.includes(doc.id)}
                    onCheckedChange={() => toggleDoc(doc.id)}
                  />
                  {doc.label}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleSend} className="gap-2">
            <Send className="h-4 w-4" /> Send Packet
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
