import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { z } from 'zod';
import textLogo from '@/assets/Text_Logo.png';
import logoIcon from '@/assets/Logo.png';

const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

type AcceptState =
  | { kind: 'idle' }
  | { kind: 'processing' }
  | { kind: 'success'; orgName: string | null; requiresOnboarding: boolean }
  | { kind: 'error'; reason: string; message: string };

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [acceptState, setAcceptState] = useState<AcceptState>({ kind: 'idle' });
  const acceptedRef = useRef(false);
  const navigate = useNavigate();
  const { refreshOrgData, refreshRoles } = useAuth();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionReady(!!session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionReady(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Existing-user invitation acceptance flow
  useEffect(() => {
    if (!inviteToken || !sessionReady || acceptedRef.current) return;
    acceptedRef.current = true;

    (async () => {
      setAcceptState({ kind: 'processing' });
      const { data, error } = await supabase.functions.invoke('accept-invitation', {
        body: { token: inviteToken },
      });

      if (error || !data?.success) {
        const reason = data?.reason || 'invalid';
        const message =
          data?.error ||
          error?.message ||
          'We could not accept this invitation.';
        setAcceptState({ kind: 'error', reason, message });
        return;
      }

      await Promise.all([refreshOrgData(), refreshRoles()]);
      const orgName = data.org_name as string | null;
      const requiresOnboarding = !!data.requires_onboarding;
      setAcceptState({ kind: 'success', orgName, requiresOnboarding });
      toast.success(orgName ? `You've joined ${orgName}` : "You've joined the organization");

      setTimeout(() => {
        navigate(requiresOnboarding ? '/driver/onboarding' : '/', { replace: true });
      }, 800);
    })();
  }, [inviteToken, sessionReady, navigate, refreshOrgData, refreshRoles]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      passwordSchema.parse(password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
        return;
      }
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      toast.error(error.message);
    } else {
      await supabase.auth.signOut();
      setLoading(false);
      setSuccess(true);
      toast.success('Password set! Please sign in.');
    }
  };


  // ---------- Token-based flow (existing user) ----------
  if (inviteToken) {
    if (!sessionReady) {
      const redirectTo = `/auth/accept-invite?token=${encodeURIComponent(inviteToken)}`;
      return (
        <Shell>
          <Card className="border-border bg-card">
            <CardHeader className="text-center">
              <CardTitle>Sign in to accept</CardTitle>
              <CardDescription>
                You've been invited to join an organization on FleetFlow. Sign in to continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => navigate(`/auth?redirect=${encodeURIComponent(redirectTo)}`)}
                className="w-full gradient-gold text-primary-foreground hover:opacity-90"
              >
                Sign In
              </Button>
            </CardContent>
          </Card>
        </Shell>
      );
    }

    if (acceptState.kind === 'processing' || acceptState.kind === 'idle') {
      return (
        <Shell>
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Joining organization...</p>
              </div>
            </CardContent>
          </Card>
        </Shell>
      );
    }

    if (acceptState.kind === 'success') {
      return (
        <Shell>
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
                <h2 className="text-xl font-semibold">
                  {acceptState.orgName ? `Welcome to ${acceptState.orgName}!` : 'Welcome!'}
                </h2>
                <p className="text-muted-foreground">
                  {acceptState.requiresOnboarding
                    ? 'Redirecting you to complete your onboarding...'
                    : 'Redirecting you to your dashboard...'}
                </p>
              </div>
            </CardContent>
          </Card>
        </Shell>
      );
    }

    // error
    const isMismatch = acceptState.reason === 'email_mismatch';
    return (
      <Shell>
        <Card className="border-border bg-card">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Could not accept invitation</CardTitle>
            <CardDescription>{acceptState.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isMismatch ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await supabase.auth.signOut();
                  const redirectTo = `/auth/accept-invite?token=${encodeURIComponent(inviteToken)}`;
                  navigate(`/auth?redirect=${encodeURIComponent(redirectTo)}`);
                }}
              >
                Sign out and use a different account
              </Button>
            ) : null}
            <Button className="w-full" onClick={() => navigate('/')}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // ---------- Legacy "set password" flow (new invited user) ----------
  if (success) {
    return (
      <Shell>
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-green-500" />
              <h2 className="text-xl font-semibold">Account Ready!</h2>
              <p className="text-muted-foreground">Your password has been set. Sign in to access your account.</p>
              <Button
                onClick={() => navigate('/auth')}
                className="w-full gradient-gold text-primary-foreground hover:opacity-90"
              >
                Continue to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!sessionReady) {
    return (
      <Shell>
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying invitation...</p>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="border-border bg-card">
        <CardHeader className="text-center">
          <CardTitle>Set Your Password</CardTitle>
          <CardDescription>Create a password to finish activating your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="bg-background"
              />
            </div>
            <Button
              type="submit"
              className="w-full gradient-gold text-primary-foreground hover:opacity-90"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Activate Account'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}
