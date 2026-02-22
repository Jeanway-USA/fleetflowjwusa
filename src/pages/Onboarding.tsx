import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2, Truck, Users, Package, Crown, Building2, MapPin, SkipForward } from 'lucide-react';
import confetti from 'canvas-confetti';
import jwBannerLight from '@/assets/JW_Banner.png';
import jwBannerDark from '@/assets/JW_Banner_Dark.png';

const TIERS: Array<{
  id: string;
  name: string;
  tagline: string;
  price: string;
  icon: React.ElementType;
  popular?: boolean;
  features: string[];
}> = [
  {
    id: 'solo_bco',
    name: 'Solo BCO',
    tagline: 'Owner-Operator Power Pack',
    price: '$49',
    icon: Truck,
    features: ['Single-truck load logging', 'IFTA fuel tax automation', 'Personal profit/loss dashboard', 'Fuel trip planner & DVIR'],
  },
  {
    id: 'fleet_owner',
    name: 'Fleet Owner',
    tagline: 'The Scalability Suite',
    price: '$149',
    icon: Users,
    popular: true,
    features: ['Everything in Solo BCO', 'Multi-driver support & payroll', 'Fleet-wide maintenance', 'Executive dashboard & analytics'],
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Brokerage & Coordination Hub',
    price: '$99',
    icon: Package,
    features: ['Agent-specific dashboard', 'Commission tracking', 'Shipper CRM & relationships', 'Carrier vetting & compliance'],
  },
  {
    id: 'all_in_one',
    name: 'All-in-One',
    tagline: 'The Enterprise Hybrid',
    price: '$199',
    icon: Crown,
    features: ['Everything in Fleet + Agency', 'Brokerage & Carrier views', 'Cross-business reporting', 'Unlimited users & trucks'],
  },
];

export default function Onboarding() {
  const { user, refreshOrgData } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [companyName, setCompanyName] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [dotNumber, setDotNumber] = useState('');

  // Step 2
  const [selectedTier, setSelectedTier] = useState('solo_bco');

  // Step 3
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [rate, setRate] = useState('');
  const [pickupDate, setPickupDate] = useState('');

  const [orgId, setOrgId] = useState<string | null>(null);

  const bannerSrc = theme === 'dark' ? jwBannerLight : jwBannerDark;
  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;

  const handleStep1 = async () => {
    if (!companyName.trim()) {
      toast.error('Please enter your company name');
      return;
    }
    if (companyName.trim().length > 100) {
      toast.error('Company name must be under 100 characters');
      return;
    }

    setLoading(true);
    try {
      const { data: newOrgId, error } = await supabase.rpc('create_onboarding_org', {
        _name: companyName.trim(),
      });

      if (error) throw error;

      setOrgId(newOrgId);
      setStep(2);
    } catch {
      toast.error('Failed to create organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ subscription_tier: selectedTier })
        .eq('id', orgId);

      if (error) throw error;
      setStep(3);
    } catch {
      toast.error('Failed to update plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async (skip = false) => {
    if (!skip) {
      if (!origin.trim() || !destination.trim()) {
        toast.error('Please enter origin and destination');
        return;
      }
      const rateNum = parseFloat(rate);
      if (rate && (isNaN(rateNum) || rateNum <= 0)) {
        toast.error('Rate must be a positive number');
        return;
      }
    }

    setLoading(true);
    try {
      if (!skip && orgId) {
        await supabase.from('fleet_loads').insert({
          origin: origin.trim(),
          destination: destination.trim(),
          rate: rate ? parseFloat(rate) : null,
          pickup_date: pickupDate || null,
          status: 'pending',
          org_id: orgId,
        });
      }

      await refreshOrgData();

      // Confetti!
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

      toast.success('Welcome to FleetFlow! 🚀');
      setTimeout(() => navigate('/'), 1500);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const stepLabels = ['Company', 'Plan', 'First Load'];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center">
          <img src={bannerSrc} alt="FleetFlow TMS" className="h-16 object-contain" />
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    i + 1 < step ? 'bg-primary text-primary-foreground' :
                    i + 1 === step ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {i + 1 < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${
                    i + 1 <= step ? 'text-foreground' : 'text-muted-foreground'
                  }`}>{label}</span>
                </div>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step 1: Company Setup */}
          {step === 1 && (
            <Card className="border-border bg-card">
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-2">
                  <Building2 className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-bold">Set Up Your Company</h2>
                  <p className="text-muted-foreground mt-1">Tell us about your trucking business</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name *</Label>
                    <Input
                      id="company-name"
                      placeholder="Your Trucking Co."
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="bg-background"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="mc-number">MC Number (optional)</Label>
                      <Input
                        id="mc-number"
                        placeholder="MC-123456"
                        value={mcNumber}
                        onChange={(e) => setMcNumber(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dot-number">DOT Number (optional)</Label>
                      <Input
                        id="dot-number"
                        placeholder="1234567"
                        value={dotNumber}
                        onChange={(e) => setDotNumber(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full gradient-gold text-primary-foreground hover:opacity-90"
                  onClick={handleStep1}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Plan Selection */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Choose Your Plan</h2>
                <p className="text-muted-foreground mt-1">14-day free trial on all plans. No credit card required.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TIERS.map((tier) => {
                  const Icon = tier.icon;
                  const isSelected = selectedTier === tier.id;
                  return (
                    <Card
                      key={tier.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border hover:border-primary/40'
                      } ${tier.popular ? 'relative' : ''}`}
                      onClick={() => setSelectedTier(tier.id)}
                    >
                      {tier.popular && (
                        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full gradient-gold text-primary-foreground text-xs font-semibold">
                          Popular
                        </div>
                      )}
                      <CardContent className="pt-5 pb-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                          }`}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between">
                              <h3 className="font-semibold">{tier.name}</h3>
                              <span className="text-lg font-bold">{tier.price}<span className="text-xs text-muted-foreground font-normal">/mo</span></span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{tier.tagline}</p>
                            <ul className="space-y-1">
                              {tier.features.map((f) => (
                                <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
                                  {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-1 gradient-gold text-primary-foreground hover:opacity-90"
                  onClick={handleStep2}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: First Load */}
          {step === 3 && (
            <Card className="border-border bg-card">
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-2">
                  <MapPin className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-bold">Create Your First Load</h2>
                  <p className="text-muted-foreground mt-1">Get started by logging a load, or skip for now</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="origin">Origin</Label>
                      <Input
                        id="origin"
                        placeholder="Dallas, TX"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="destination">Destination</Label>
                      <Input
                        id="destination"
                        placeholder="Atlanta, GA"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="rate">Rate ($)</Label>
                      <Input
                        id="rate"
                        type="number"
                        placeholder="2500"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pickup-date">Pickup Date</Label>
                      <Input
                        id="pickup-date"
                        type="date"
                        value={pickupDate}
                        onChange={(e) => setPickupDate(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleStep3(true)}
                    disabled={loading}
                    className="flex-1"
                  >
                    <SkipForward className="mr-2 h-4 w-4" />
                    Skip
                  </Button>
                  <Button
                    className="flex-1 gradient-gold text-primary-foreground hover:opacity-90"
                    onClick={() => handleStep3(false)}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Finish
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
