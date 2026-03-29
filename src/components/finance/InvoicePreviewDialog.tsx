import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { Printer, FileText, Loader2, Save, Mail } from 'lucide-react';

interface LineItem {
  key: string;
  label: string;
  amount: number;
}

interface InvoicePreviewDialogProps {
  load: any;
  open: boolean;
  onClose: () => void;
  mode: 'preview' | 'edit';
  onConfirm: (updatedAmounts?: Record<string, number>, overrideEmail?: string) => void;
  confirming?: boolean;
}

const LINE_ITEM_KEYS: { key: string; label: string; field: string }[] = [
  { key: 'rate', label: 'Linehaul Rate', field: 'rate' },
  { key: 'fuel_surcharge', label: 'Fuel Surcharge', field: 'fuel_surcharge' },
  { key: 'accessorials', label: 'Accessorials', field: 'accessorials' },
  { key: 'detention_pay', label: 'Detention', field: 'detention_pay' },
  { key: 'lumper', label: 'Lumper', field: 'lumper' },
];

export function InvoicePreviewDialog({ load, open, onClose, mode, onConfirm, confirming }: InvoicePreviewDialogProps) {
  const { orgName, logoUrl } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [brokerName, setBrokerName] = useState<string>('');
  const [brokerEmail, setBrokerEmail] = useState<string>('');
  const [emailOverride, setEmailOverride] = useState<string>('');

  useEffect(() => {
    if (load && open) {
      const initial: Record<string, number> = {};
      LINE_ITEM_KEYS.forEach(({ key, field }) => {
        initial[key] = load[field] || 0;
      });
      setAmounts(initial);
      setEmailOverride('');

      // Look up broker/agent from CRM
      if (load.agency_code) {
        supabase
          .from('crm_contacts')
          .select('email, company_name, contact_name')
          .eq('agent_code', load.agency_code)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setBrokerName(data.contact_name || data.company_name || '');
              setBrokerEmail(data.email || '');
            } else {
              setBrokerName('');
              setBrokerEmail('');
            }
          });
      } else {
        setBrokerName('');
        setBrokerEmail('');
      }
    }
  }, [load, open]);

  if (!load) return null;

  const total = Object.values(amounts).reduce((sum, v) => sum + (v || 0), 0);
  const invoiceNumber = load.invoice_number || `INV-${format(new Date(), 'yyyyMMdd')}-${load.id.slice(0, 6).toUpperCase()}`;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Invoice ${invoiceNumber}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1a1a1a; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        th { font-weight: 600; background: #f5f5f5; }
        .text-right { text-align: right; }
        .total-row { font-weight: 700; font-size: 1.1em; border-top: 2px solid #333; }
        h1 { margin: 0; font-size: 1.5em; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .meta { color: #666; font-size: 0.9em; }
        .logo { max-height: 48px; }
      </style>
      </head><body>${content.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleConfirm = () => {
    const finalEmail = emailOverride || brokerEmail || '';
    if (mode === 'edit') {
      onConfirm(amounts, finalEmail);
    } else {
      onConfirm(undefined, finalEmail);
    }
  };

  const updateAmount = (key: string, value: string) => {
    setAmounts(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'preview' ? 'Invoice Preview' : 'Edit Invoice'}</DialogTitle>
        </DialogHeader>

        <div ref={printRef} className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              {logoUrl && <img src={logoUrl} alt="Logo" className="h-10 max-w-[120px] object-contain" />}
              <div>
                <h2 className="text-lg font-bold text-foreground">{orgName || 'Company Name'}</h2>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p className="text-xl font-bold text-foreground">INVOICE</p>
              <p className="font-mono">{invoiceNumber}</p>
              <p>{format(new Date(), 'MMMM d, yyyy')}</p>
            </div>
          </div>

          <Separator />

          {/* Load Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Load Reference</p>
              <p className="font-medium text-foreground">{load.landstar_load_id || load.id.slice(0, 8)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Delivery Date</p>
              <p className="font-medium text-foreground">
                {load.delivery_date ? format(parseISO(load.delivery_date), 'MMM d, yyyy') : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Origin</p>
              <p className="font-medium text-foreground">{load.origin}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Destination</p>
              <p className="font-medium text-foreground">{load.destination}</p>
            </div>
          </div>

          <Separator />

          {/* Bill To */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1">
              <Mail className="h-4 w-4" /> Bill To
            </p>
            {brokerName && (
              <p className="text-sm text-foreground font-medium">{brokerName}</p>
            )}
            {brokerEmail ? (
              <p className="text-sm text-muted-foreground">{brokerEmail}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No broker email found in CRM</p>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="Override recipient email"
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                className="h-8 text-sm max-w-xs"
              />
              {emailOverride && (
                <span className="text-xs text-muted-foreground">Will send to this email instead</span>
              )}
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-foreground">Description</th>
                <th className="text-right py-2 font-semibold text-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {LINE_ITEM_KEYS.map(({ key, label }) => {
                const value = amounts[key] || 0;
                if (mode === 'preview' && value === 0) return null;
                return (
                  <tr key={key} className="border-b border-border/50">
                    <td className="py-2 text-foreground">{label}</td>
                    <td className="py-2 text-right">
                      {mode === 'edit' ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={value || ''}
                          onChange={(e) => updateAmount(key, e.target.value)}
                          className="w-32 ml-auto text-right h-8"
                        />
                      ) : (
                        <span className="font-medium text-foreground">{formatCurrency(value)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-foreground">
                <td className="py-3 font-bold text-foreground text-base">Total</td>
                <td className="py-3 text-right font-bold text-foreground text-base">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1" />
            Print / PDF
          </Button>
          <Button onClick={handleConfirm} disabled={confirming}>
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : mode === 'edit' ? (
              <Save className="h-4 w-4 mr-1" />
            ) : (
              <FileText className="h-4 w-4 mr-1" />
            )}
            {mode === 'edit' ? 'Save & Resend' : 'Generate Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
