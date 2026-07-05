import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

/**
 * Shared visual shell for each payroll-setup section. Sections drop their
 * real forms/flow-token launchers into `children` when implemented.
 */
export function PayrollSetupSectionCard({ icon: Icon, title, description, children }: Props) {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {children ?? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Guided setup coming soon
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              This section will let you clear the related Gusto blockers without leaving FleetFlow.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
