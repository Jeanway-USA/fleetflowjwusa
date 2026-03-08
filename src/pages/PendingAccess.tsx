import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogOut, Clock } from 'lucide-react';


export default function PendingAccess() {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is not authenticated, redirect to auth
  if (!user) {
    navigate('/auth');
    return null;
  }

  const userEmail = user.email || 'Unknown';
  const firstName = user.user_metadata?.first_name || '';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src={bannerLogo} 
              alt="JW Trucking" 
              className="h-12 object-contain"
            />
          </div>
          <div className="flex justify-center">
            <div className="rounded-full bg-muted p-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
          <CardDescription className="text-base">
            {firstName ? `Welcome, ${firstName}!` : 'Welcome!'} Your account has been created successfully.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">
              An administrator needs to assign you a role before you can access the system. 
              Please contact your manager or wait for approval.
            </p>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            <p>Logged in as:</p>
            <p className="font-medium text-foreground">{userEmail}</p>
          </div>

          <Button 
            onClick={handleSignOut} 
            variant="outline" 
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
