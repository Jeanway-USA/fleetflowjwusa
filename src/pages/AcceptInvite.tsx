import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, CheckCircle } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { z } from 'zod';
import textLogo from '@/assets/Text_Logo.png';
import logoIcon from '@/assets/Logo.png';

const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export default function AcceptInvite() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) setSessionReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <img src={logoIcon} alt="" className="h-10 w-auto" />
            <img src={textLogo} alt="FleetFlow TMS by JeanWay USA" className="h-10 w-auto" />
          </div>
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
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <img src={logoIcon} alt="" className="h-10 w-auto" />
            <img src={textLogo} alt="FleetFlow TMS by JeanWay USA" className="h-10 w-auto" />
          </div>
          <Card className="border-border bg-card">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Verifying invitation...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <h1 className="sr-only">Accept your FleetFlow TMS invitation</h1>
      <div className="w-full max-w-md">
        <Helmet>
          <title>Accept Invitation — FleetFlow TMS</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={logoIcon} alt="" className="h-10 w-auto" />
          <img src={textLogo} alt="FleetFlow TMS by JeanWay USA" className="h-10 w-auto" />
        </div>
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
      </div>
    </div>
  );
}
