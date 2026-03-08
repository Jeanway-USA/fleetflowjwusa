import { Check, Fuel, Sparkles, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  label: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
}

interface IFTAWorkflowStepperProps {
  hasFuelPurchases: boolean;
  hasIFTARecords: boolean;
  hasJurisdictionData: boolean;
  onAuditData?: () => void;
  auditLoading?: boolean;
}

export function IFTAWorkflowStepper({ hasFuelPurchases, hasIFTARecords, hasJurisdictionData }: IFTAWorkflowStepperProps) {
  const steps: Step[] = [
    {
      label: 'Sync Fuel',
      description: 'Import fuel purchases from expenses',
      icon: <Fuel className="h-4 w-4" />,
      completed: hasFuelPurchases,
    },
    {
      label: 'Generate Report',
      description: 'Auto-generate IFTA from delivered loads',
      icon: <Sparkles className="h-4 w-4" />,
      completed: hasIFTARecords,
    },
    {
      label: 'Review Summary',
      description: 'View tax liability by jurisdiction',
      icon: <MapPin className="h-4 w-4" />,
      completed: hasJurisdictionData && hasIFTARecords,
    },
  ];

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 mb-6">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2 flex-1">
          <div className={cn(
            'flex items-center justify-center rounded-full h-7 w-7 shrink-0 text-xs font-bold transition-colors',
            step.completed
              ? 'bg-success text-success-foreground'
              : 'bg-muted text-muted-foreground'
          )}>
            {step.completed ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <div className="min-w-0">
            <p className={cn(
              'text-sm font-medium leading-tight truncate',
              step.completed ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {step.label}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight truncate hidden sm:block">
              {step.description}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              'h-px flex-1 mx-2',
              step.completed ? 'bg-success/40' : 'bg-border'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
