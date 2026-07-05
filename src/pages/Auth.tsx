import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, ShieldCheck, Truck, Lock } from 'lucide-react';
import { z } from 'zod';
import { Helmet } from 'react-helmet-async';

const emailSchema = z.string().email('Please enter a valid email address');

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const safeRedirect = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/';

  useEffect(() => {
    if (!authLoading && user) navigate(safeRedirect, { replace: true });
  }, [user, authLoading, navigate, safeRedirect]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return null;

  const readField = (form: HTMLFormElement, name: string): string => {
    const el = form.elements.namedItem(name) as HTMLInputElement | null;
    return (el?.value ?? '').trim();
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submittedEmail = readField(form, 'signin-email') || email;
    const submittedPassword =
      (form.elements.namedItem('signin-password') as HTMLInputElement | null)?.value ?? password;
    if (submittedEmail !== email) setEmail(submittedEmail);
    try {
      emailSchema.parse(submittedEmail);
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.errors[0].message);
      return;
    }
    if (!submittedPassword) {
      toast.error('Please enter your password');
      return;
    }
    setFormLoading(true);
    try {
      const { error } = await signIn(submittedEmail, submittedPassword);
      if (error) {
        toast.error(
          error.message.includes('Invalid login') ? 'Invalid email or password' : error.message,
        );
      } else {
        toast.success('Welcome back');
        navigate(safeRedirect, { replace: true });
      }
    } catch (err) {
      console.error('[Auth] signIn threw:', err);
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setFormLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submittedEmail = readField(form, 'reset-email') || email;
    if (submittedEmail !== email) setEmail(submittedEmail);
    try {
      emailSchema.parse(submittedEmail);
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.errors[0].message);
      return;
    }
    setFormLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setResetEmailSent(true);
        toast.success('Password reset email sent');
      }
    } catch (err) {
      console.error('[Auth] resetPasswordForEmail threw:', err);
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setFormLoading(false);
    }
  };

  // Forgot Password screen
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Helmet>
          <title>Reset Password — JeanWay TMS</title>
          <meta name="description" content="Reset your JeanWay TMS password." />
        </Helmet>
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center justify-center gap-2 mb-8">
            <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-primary/15 border border-primary/30">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">JeanWay TMS</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                Internal Fleet Operations
              </p>
            </div>
          </div>
          <Card className="border-border bg-card">
            <CardHeader className="text-center">
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                {resetEmailSent
                  ? 'Check your email for the reset link'
                  : 'Enter your email to receive a password reset link'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resetEmailSent ? (
                <div className="space-y-4">
                  <p className="text-sm text-center text-muted-foreground">
                    We've sent a password reset link to <strong>{email}</strong>. Please check your
                    inbox and spam folder.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetEmailSent(false);
                    }}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input
                      id="reset-email"
                      name="reset-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@jeanwayusa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="bg-background"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={formLoading}>
                    {formLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowForgotPassword(false)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Main login — minimalist, branded, single centered card.
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Helmet>
        <title>Sign In — JeanWay TMS</title>
        <meta
          name="description"
          content="Secure sign-in for JeanWay LLC internal staff and authorized drivers."
        />
        <link rel="canonical" href="https://tms.jeanwayusa.com/auth" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">Sign in to JeanWay TMS</h1>

      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-primary/15 border border-primary/30">
            <Truck className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold tracking-tight">JeanWay TMS</div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em] mt-1">
              Internal Fleet Operations
            </p>
          </div>
        </div>

        <Card className="border-border bg-card shadow-lg">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>
              Authorized staff and drivers only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  name="signin-email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@jeanwayusa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="signin-password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="signin-password"
                  name="signin-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-background"
                />
              </div>
              <Button type="submit" className="w-full" disabled={formLoading}>
                {formLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" /> Sign In
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Access is restricted. All activity is logged.</span>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-2">
          Need access? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
