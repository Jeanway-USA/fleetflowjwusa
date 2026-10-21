import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
}

export function PageHeader({ title, description, action, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-end sm:justify-between gap-3 sm:gap-4 mb-5">
      <div className="min-w-0">
        <h1 className="font-condensed text-[28px] leading-tight sm:text-[32px] font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-0.5 text-[15px]">{description}</p>}
      </div>
      <div className="flex w-full sm:w-auto items-center gap-2">
        {children}
        {action && (
          <Button onClick={action.onClick} className="h-11 sm:h-10 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
