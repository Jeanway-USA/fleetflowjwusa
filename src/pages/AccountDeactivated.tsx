import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Trash2, Mail, CreditCard, Loader2, LogOut } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { toast } from 'sonner';

export default function AccountDeactivated() {
  const { user, signOut, orgName } = useAuth();
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('delete-own-account', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete account');
      }

      toast.success('Your account has been deleted.');
      localStorage.clear();
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg border-destructive/30">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Account Deactivated</CardTitle>
          <CardDescription className="text-base">
            {orgName ? (
              <>Your organization <span className="font-semibold text-foreground">{orgName}</span> has been deactivated.</>
            ) : (
              <>Your organization has been deactivated.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">This may have happened because:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your subscription has expired or payment failed</li>
              <li>An administrator deactivated the account</li>
              <li>Your free trial period has ended</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              onClick={() => navigate('/pricing')}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Reactivate Subscription
            </Button>

            <Button
              variant="outline"
              className="w-full"
              asChild
            >
              <a href="mailto:support@fleetflow-tms.com">
                <Mail className="mr-2 h-4 w-4" />
                Contact Support
              </a>
            </Button>

            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete My Account
            </Button>

            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDeleteAccount}
        title="Delete Your Account"
        description="This will permanently delete your account and all associated data. This action cannot be undone."
        isDeleting={isDeleting}
      />
    </div>
  );
}
