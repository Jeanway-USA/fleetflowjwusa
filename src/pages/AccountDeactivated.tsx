import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PartyPopper, LogIn, LogOut } from 'lucide-react';

export default function AccountDeactivated() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">The Open Beta Phase Has Ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-base leading-relaxed text-muted-foreground">
            Thank you for testing the platform! Our open beta period is currently paused. Please pay attention to your Landstar BCO Facebook Groups for announcements on when we will open the next round of beta testing, or release the app to the public and open up official subscriptions.
          </p>

          <div className="space-y-3">
            <Button className="w-full" onClick={() => navigate('/auth')}>
              <LogIn className="mr-2 h-4 w-4" />
              Return to Login
            </Button>

            <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
