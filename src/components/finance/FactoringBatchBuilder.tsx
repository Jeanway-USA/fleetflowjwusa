import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FileCheck2, Camera, Send, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';

interface MockLoad {
  id: string;
  loadNumber: string;
  broker: string;
  deliveryDate: string;
  grossPay: number;
  hasRateCon: boolean;
  hasPOD: boolean;
}

const MOCK_LOADS: MockLoad[] = [
  { id: '1', loadNumber: 'LD-4521', broker: 'TQL', deliveryDate: '04/08/2026', grossPay: 3200, hasRateCon: true, hasPOD: true },
  { id: '2', loadNumber: 'LD-4518', broker: 'Echo', deliveryDate: '04/06/2026', grossPay: 2750, hasRateCon: true, hasPOD: true },
  { id: '3', loadNumber: 'LD-4515', broker: 'CH Robinson', deliveryDate: '04/04/2026', grossPay: 4100, hasRateCon: true, hasPOD: false },
  { id: '4', loadNumber: 'LD-4510', broker: 'Coyote', deliveryDate: '04/02/2026', grossPay: 1950, hasRateCon: true, hasPOD: true },
  { id: '5', loadNumber: 'LD-4507', broker: 'XPO', deliveryDate: '03/30/2026', grossPay: 3600, hasRateCon: true, hasPOD: true },
];

const FEE_RATE = 0.025;

export function FactoringBatchBuilder() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleLoad = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedLoads = MOCK_LOADS.filter((l) => selectedIds.has(l.id));
  const totalGross = selectedLoads.reduce((sum, l) => sum + l.grossPay, 0);
  const factoringFee = totalGross * FEE_RATE;
  const netPayout = totalGross - factoringFee;

  const handleSend = () => {
    if (selectedLoads.length === 0) {
      toast.error('Select at least one load to factor');
      return;
    }
    toast.success(`Factoring schedule created for ${selectedLoads.length} load(s) — ${formatCurrency(netPayout)} estimated payout`);
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Ready to Factor
            </CardTitle>
            <p className="text-sm text-muted-foreground">Select delivered loads to include in your factoring batch.</p>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[420px] px-6 pb-6">
              <div className="space-y-3">
                {MOCK_LOADS.map((load) => {
                  const isSelected = selectedIds.has(load.id);
                  const disabled = !load.hasPOD;

                  const card = (
                    <div
                      key={load.id}
                      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border'
                      } ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
                      onClick={() => !disabled && toggleLoad(load.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={disabled}
                        onCheckedChange={() => toggleLoad(load.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{load.loadNumber}</span>
                          <span className="font-semibold text-sm">{formatCurrency(load.grossPay)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{load.broker}</span>
                          <span className="text-xs text-muted-foreground">{load.deliveryDate}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="flex items-center gap-1 text-xs">
                            <FileCheck2 className={`h-3.5 w-3.5 ${load.hasRateCon ? 'text-green-600' : 'text-destructive'}`} />
                            Rate Con
                          </span>
                          <span className="flex items-center gap-1 text-xs">
                            <Camera className={`h-3.5 w-3.5 ${load.hasPOD ? 'text-green-600' : 'text-destructive'}`} />
                            POD
                            {!load.hasPOD && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-1">Missing</Badge>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );

                  if (disabled) {
                    return (
                      <Tooltip key={load.id}>
                        <TooltipTrigger asChild>{card}</TooltipTrigger>
                        <TooltipContent side="right" className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          POD required before factoring
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return card;
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Column */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Current Batch Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Loads Selected</span>
                <span className="font-semibold">{selectedLoads.length}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Total Gross</span>
                <span className="font-semibold">{formatCurrency(totalGross)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Factoring Fee (2.5%)</span>
                <span className="font-semibold text-destructive">-{formatCurrency(factoringFee)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium">Estimated Net Payout</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(netPayout)}</span>
              </div>

              {selectedLoads.length > 0 && (
                <div className="rounded-lg border p-3 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Included Loads</p>
                  {selectedLoads.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm">
                      <span>{l.loadNumber} — {l.broker}</span>
                      <span className="text-muted-foreground">{formatCurrency(l.grossPay)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button size="lg" className="w-full" onClick={handleSend} disabled={selectedLoads.length === 0}>
              <Send className="h-4 w-4 mr-2" />
              Generate Factoring Schedule &amp; Send
            </Button>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
