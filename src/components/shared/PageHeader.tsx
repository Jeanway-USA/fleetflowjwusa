import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { NotificationCenter } from '@/components/shared/NotificationCenter';

interface PageHeaderProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  children?: ReactNode;
  hideNotifications?: boolean;
}

export function PageHeader({ title, description, action, children, hideNotifications }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      <div className="flex w-full sm:w-auto items-center gap-2">
        {!hideNotifications && <NotificationCenter />}
        {children}
        {action && (
          <Button onClick={action.onClick} className="w-full sm:w-auto gradient-gold text-primary-foreground">
            <Plus className="h-4 w-4 mr-2" />
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
