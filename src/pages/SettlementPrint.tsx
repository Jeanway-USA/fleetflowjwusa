import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { SettlementPrintable } from '@/components/finance/driver-settlements/SettlementPrintable';
import {
  buildSettlementDocumentData,
  type SettlementDocumentData,
} from '@/lib/settlement-document-data';
import { generateSettlementPdf } from '@/lib/pdf/generateSettlementPdf';

export default function SettlementPrint() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SettlementDocumentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setError('Missing settlement id');
      return;
    }
    buildSettlementDocumentData(id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? 'Unable to load settlement');
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (data) {
      document.title = `Settlement ${String(data.settlement.id).slice(0, 8).toUpperCase()}`;
    }
  }, [data]);

  const handleDownload = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      await generateSettlementPdf(id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not generate PDF');
    } finally {
      setDownloading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 py-6 print:bg-white print:py-0">
      <div className="max-w-4xl mx-auto px-4 mb-4 flex flex-wrap gap-2 justify-end print:hidden">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print / Save as PDF
        </Button>
        <Button onClick={handleDownload} disabled={downloading}>
          <Download className="h-4 w-4 mr-2" />
          {downloading ? 'Generating…' : 'Download PDF'}
        </Button>
      </div>
      <SettlementPrintable data={data} />
    </div>
  );
}
