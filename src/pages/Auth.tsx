import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Helmet } from 'react-helmet-async';
import textLogo from '@/assets/Text_Logo.png';
import logoIcon from '@/assets/Logo.png';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string().min(1, 'Password is required');

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
    const submittedPassword = (form.elements.namedItem('signin-password') as HTMLInputElement | null)?.value ?? password;
    if (submittedEmail !== email) setEmail(submittedEmail);
    try {
      emailSchema.parse(submittedEmail);
      passwordSchema.parse(submittedPassword);
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.errors[0].message);
      return;
    }
    setFormLoading(true);
    try {
      const { error } = await signIn(submittedEmail, submittedPassword);
      if (error) {
        toast.error(error.message.includes('Invalid login') ? 'Invalid email or password' : error.message);
      } else {
        toast.success('Welcome back!');
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
    try { emailSchema.parse(submittedEmail); }
    catch (err) { if (err instanceof z.ZodError) toast.error(err.errors[0].message); return; }
    setFormLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) { toast.error(error.message); } else { setResetEmailSent(true); toast.success('Password reset email sent!'); }
    } catch (err) {
      console.error('[Auth] resetPasswordForEmail threw:', err);
      toast.error("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setFormLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-8">
            <img src={logoIcon} alt="" className="h-10 w-auto" />
            <img src={textLogo} alt="JeanWay USA" className="h-10 w-auto" />
          </div>
          <Card className="border-border bg-card">
            <CardHeader className="text-center">
              <CardTitle>Reset Password</CardTitle>
              <CardDescription>
                {resetEmailSent ? 'Check your email for the reset link' : 'Enter your email to receive a password reset link'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resetEmailSent ? (
                <div className="space-y-4">
                  <p className="text-sm text-center text-muted-foreground">
                    We've sent a password reset link to <strong>{email}</strong>. Please check your inbox and spam folder.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => { setShowForgotPassword(false); setResetEmailSent(false); setEmail(''); }}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">Email</Label>
                    <Input id="reset-email" name="reset-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background" />
                  </div>
                  <Button type="submit" className="w-full gradient-gold text-primary-foreground hover:opacity-90 active:scale-[0.97] transition-transform" disabled={formLoading}>
                    {formLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : 'Send Reset Link'}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => { setShowForgotPassword(false); setEmail(''); }}>
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Helmet>
        <title>Sign In — JeanWay USA</title>
        <meta name="description" content="Sign in to your JeanWay USA account." />
      </Helmet>
      <h1 className="sr-only">Sign In</h1>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <img src={logoIcon} alt="" className="h-12 w-auto" />
          <img src={textLogo} alt="JeanWay USA" className="h-12 w-auto" />
        </div>
        <Card className="border-border bg-card shadow-lg">
          <CardHeader className="text-center">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" name="signin-email" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="signin-password">Password</Label>
                  <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm text-primary hover:underline">Forgot password?</button>
                </div>
                <Input id="signin-password" name="signin-password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background" />
              </div>
              <Button type="submit" className="w-full gradient-gold text-primary-foreground hover:opacity-90 active:scale-[0.97] transition-transform" disabled={formLoading}>
                {formLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-muted-foreground mt-6">
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  );
}
