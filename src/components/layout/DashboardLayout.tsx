import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DEMO_EMAIL = 'demo@fleetflow-tms.com';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const isDemo = user?.email === DEMO_EMAIL;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-h-screen">
          {isDemo && (
            <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <span className="font-medium">You're in Demo Mode</span>
                <span className="text-muted-foreground hidden sm:inline">— exploring with sample data</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={async () => {
                  await signOut();
                  navigate('/auth');
                }}
              >
                Sign Up for Real
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
      </div>
    </SidebarProvider>
  );
}
