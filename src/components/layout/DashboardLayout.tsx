import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoControls } from '@/components/demo/DemoControls';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isDemoMode, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-h-screen">
          {isDemoMode && (
            <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <span className="font-medium">You're in Demo Mode</span>
                <span className="text-muted-foreground hidden sm:inline">— exploring with sample data</span>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs gradient-gold text-primary-foreground"
                onClick={async () => {
                  await signOut();
                  navigate('/auth');
                }}
              >
                Start Your Beta Account
              </Button>
            </div>
          )}
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
              <SidebarTrigger className="lg:hidden" />
              <div className="flex-1" />
            </div>
          </header>
          <div className="flex-1 p-4 lg:p-6 animate-fade-in">
            {children}
          </div>
        </main>
        {isDemoMode && <DemoControls />}
      </div>
    </SidebarProvider>
  );
}
