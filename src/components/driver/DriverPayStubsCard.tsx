import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Download, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from 'sonner';
import { downloadW2PayStub } from '@/lib/pdf/generateW2PayStubPdf';
import { DBtn, Panel, PanelHead } from '@/components/driver/ui/driver-ui';

/**
 * Driver-facing list of the signed-in driver's W-2 pay stubs.
 * Only renders if the driver has at least one W-2 payroll row.
 */
export function DriverPayStubsCard() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: driver } = useQuery({
    queryKey: ['self-driver'],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return null;
      const { data } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userRes.user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: stubs = [], isLoading } = useQuery({
    queryKey: ['driver_payroll_w2_self', driver?.id],
    enabled: !!driver?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_payroll')
        .select('*')
        .eq('driver_id', driver!.id)
        .eq('employment_type', 'w2_company')
        .is('deleted_at', null)
        .order('period_end', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!driver || (!isLoading && stubs.length === 0)) return null;

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadW2PayStub(id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to download pay stub');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Panel>
      <PanelHead title="Pay stubs" aside="W-2 pay history" />
      <ul className="divide-y divide-border">
        {stubs.map((s: any) => {
          const taxes =
            Number(s.federal_income_tax ?? 0) +
            Number(s.social_security_tax ?? 0) +
            Number(s.medicare_tax ?? 0) +
            Number(s.additional_medicare_tax ?? 0);
          return (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tabular-nums">{formatDate(s.payment_date ?? s.period_end)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(s.period_start)} to {formatDate(s.period_end)}</p>
                </div>
                <DBtn tone="secondary" size="md" onClick={() => handleDownload(s.id)} disabled={downloadingId === s.id} aria-label="Download pay stub as PDF">
                  {downloadingId === s.id ? <Loader2 className="animate-spin" /> : <Download />} PDF
                </DBtn>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-muted-foreground">Gross</p><p className="mt-0.5 font-medium tabular-nums">{formatCurrency(Number(s.gross_pay ?? 0))}</p></div>
                <div><p className="text-muted-foreground">Taxes</p><p className="mt-0.5 font-medium tabular-nums">{formatCurrency(taxes)}</p></div>
                <div><p className="text-muted-foreground">Net</p><p className="mt-0.5 text-sm font-semibold tabular-nums">{formatCurrency(Number(s.net_pay ?? 0))}</p></div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
