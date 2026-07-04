import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { toast } from 'sonner';
import { downloadW2PayStub } from '@/lib/pdf/generateW2PayStubPdf';

/**
 * Driver-facing card that lists the signed-in driver's W-2 pay stubs.
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
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" /> Pay Stubs
        </CardTitle>
        <CardDescription>Your W-2 pay history. Tap Download to save a stub as PDF.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pay Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Taxes</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stubs.map((s: any) => {
                const taxes =
                  Number(s.federal_income_tax ?? 0) +
                  Number(s.social_security_tax ?? 0) +
                  Number(s.medicare_tax ?? 0) +
                  Number(s.additional_medicare_tax ?? 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell>{formatDate(s.payment_date ?? s.period_end)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(s.period_start)} – {formatDate(s.period_end)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(s.gross_pay ?? 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatCurrency(taxes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">
                      {formatCurrency(Number(s.net_pay ?? 0))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(s.id)}
                        disabled={downloadingId === s.id}
                      >
                        {downloadingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" /> PDF
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
