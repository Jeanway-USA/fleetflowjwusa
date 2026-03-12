import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Sparkles, Truck, MessageSquare, CheckCircle } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number');

const BENEFITS = [
  {
    icon: Sparkles,
    title: '100% Free Access During Beta',
    description: 'Every feature unlocked at no cost. No credit card required — just sign up and start managing your fleet.',
  },
  {
    icon: MessageSquare,
    title: 'Shape the Future of the Platform',
    description: 'Your feedback drives our roadmap. Help us build the TMS that owner-operators actually need.',
  },
  {
    icon: Truck,
    title: 'Built Exclusively for Landstar BCOs',
    description: 'Purpose-built tools for independent contractors — loads, IFTA, settlements, and more in one place.',
  },
];

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user) navigate('/');
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return null;

  const validateForm = () => {
    try { emailSchema.parse(email); passwordSchema.parse(password); return true; }
    catch (error) { if (error instanceof z.ZodError) toast.error(error.errors[0].message); return false; }
  };

  const validateEmail = () => {
    try { emailSchema.parse(email); return true; }
    catch (error) { if (error instanceof z.ZodError) toast.error(error.errors[0].message); return false; }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setFormLoading(true);
    const { error } = await signIn(email, password);
    setFormLoading(false);
    if (error) {
      toast.error(error.message.includes('Invalid login') ? 'Invalid email or password' : error.message);
    } else {
      toast.success('Welcome back!');
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!firstName.trim() || !lastName.trim()) { toast.error('Please enter your first and last name'); return; }
    setFormLoading(true);
    const { error } = await signUp(email, password, firstName, lastName);
    if (error) {
      toast.error(error.message.includes('already registered') ? 'This email is already registered. Please sign in.' : error.message);
      setFormLoading(false);
      return;
    }
    setFormLoading(false);
    toast.success('Account created! Welcome aboard.');
    navigate('/');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail()) return;
    setFormLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setFormLoading(false);
    if (error) { toast.error(error.message); } else { setResetEmailSent(true); toast.success('Password reset email sent!'); }
  };

  // Forgot Password — centered card, no split layout
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-3xl font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</h1>
            <p className="text-xs text-muted-foreground mt-1">by JeanWayUSA</p>
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
                    <Input id="reset-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background" />
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

  // Main Auth — split-screen layout
  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-2">
      {/* Left Panel — Beta Benefits */}
      <div className="relative flex flex-col justify-center px-6 py-10 lg:py-0 lg:px-16 bg-[hsl(240_20%_4%)] text-white overflow-hidden">
        {/* Decorative gradient orbs */}
        <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-md mx-auto lg:mx-0 space-y-8">
          {/* Brand */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</h1>
            <p className="text-sm text-white/50 mt-1">by JeanWayUSA</p>
          </div>

          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <CheckCircle className="h-3.5 w-3.5" /> Open Beta — Free Access
          </span>

          {/* Benefits */}
          <div className="space-y-6">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-lg bg-primary/15">
                  <b.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight">{b.title}</h3>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{b.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Back link */}
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors mt-4">
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </button>
        </div>
      </div>

      {/* Right Panel — Auth Card */}
      <div className="flex items-center justify-center p-4 sm:p-8 lg:p-16">
        <div className="w-full max-w-md">
          <Card className="border-border bg-card shadow-lg">
            <CardHeader className="text-center">
              <CardTitle>Join the Beta</CardTitle>
              <CardDescription>Create your free account or sign in</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signup" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                </TabsList>

                {/* Sign Up */}
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first-name">First Name</Label>
                        <Input id="first-name" type="text" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="bg-background" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last-name">Last Name</Label>
                        <Input id="last-name" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="bg-background" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background" />
                      <p className="text-xs text-muted-foreground">Min 8 chars, 1 uppercase, 1 number</p>
                    </div>
                    <Button type="submit" className="w-full gradient-gold text-primary-foreground hover:opacity-90 active:scale-[0.97] transition-transform" disabled={formLoading}>
                      {formLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...</> : 'Create Free Beta Account'}
                    </Button>
                  </form>
                </TabsContent>

                {/* Sign In */}
                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input id="signin-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-background" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="signin-password">Password</Label>
                        <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm text-primary hover:underline">Forgot password?</button>
                      </div>
                      <Input id="signin-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-background" />
                    </div>
                    <Button type="submit" className="w-full gradient-gold text-primary-foreground hover:opacity-90 active:scale-[0.97] transition-transform" disabled={formLoading}>
                      {formLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Contact your administrator if you need access.
          </p>
        </div>
      </div>
    </div>
  );
}
