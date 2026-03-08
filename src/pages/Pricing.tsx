import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Truck, Users, Package, Crown, ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TierMeta {
  id: string;
  name: string;
  tagline: string;
  icon: React.ElementType;
  heroFeature: string;
  features: string[];
  upgradeNote: string;
  popular?: boolean;
}

const TIER_META: Record<string, TierMeta> = {
  solo_bco: {
    id: 'solo_bco',
    name: 'Solo BCO',
    tagline: 'Owner-Operator Power Pack',
    icon: Truck,
    heroFeature: 'Per-Load Profit/Loss Snapshot',
    features: [
      'Single-truck load logging',
      'IFTA fuel tax automation',
      'Mileage-based maintenance reminders',
      'Digital BOL & document storage',
      'Personal profit/loss dashboard',
      'Fuel trip planner',
      'DVIR inspections',
    ],
    upgradeNote: 'Upgrade to Fleet when adding your 2nd truck',
  },
  fleet_owner: {
    id: 'fleet_owner',
    name: 'Fleet Owner',
    tagline: 'The Scalability Suite',
    icon: Users,
    heroFeature: 'Automated Driver Settlements',
    popular: true,
    features: [
      'Everything in Solo BCO',
      'Multi-driver login & permissions',
      'Automated driver settlements & payroll',
      'Fleet-wide maintenance scheduling',
      'Real-time GPS asset tracking',
      'Cost-per-mile analytics',
      'Driver performance scorecards',
      'Executive dashboard',
      'Incident reporting',
      'Safety compliance tools',
    ],
    upgradeNote: 'Upgrade to All-in-One when you start brokering',
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'Brokerage & Coordination Hub',
    icon: Package,
    heroFeature: 'Commission Calculator & Agent Dashboard',
    features: [
      'Agent-specific dashboard',
      'Load posting & management',
      'Carrier vetting & compliance',
      'Commission calculators & tracking',
      'Shipper CRM & relationships',
      'Document management',
      'Business insights & reporting',
    ],
    upgradeNote: 'Upgrade to All-in-One when running your own trucks',
  },
  all_in_one: {
    id: 'all_in_one',
    name: 'All-in-One',
    tagline: 'The Enterprise Hybrid',
    icon: Crown,
    heroFeature: 'Unified Brokerage + Carrier Command Center',
    popular: true,
    features: [
      'Everything in Fleet Owner',
      'Everything in Agency',
      'Toggle between Brokerage & Carrier views',
      'Cross-business-unit reporting',
      'Unlimited users & trucks',
      'Priority support',
    ],
    upgradeNote: 'The ultimate plan for Mega-BCOs',
  },
};

const BASE_TIERS = ['solo_bco', 'fleet_owner', 'agency'];

const COMPARISON_FEATURES = [
  { name: 'Load Logging', solo: true, fleet: true, agency: true, all: true },
  { name: 'IFTA Automation', solo: true, fleet: true, agency: false, all: true },
  { name: 'Maintenance Reminders', solo: true, fleet: true, agency: false, all: true },
  { name: 'Document Storage', solo: true, fleet: true, agency: true, all: true },
  { name: 'Per-Load P&L', solo: true, fleet: true, agency: false, all: true },
  { name: 'Multi-Driver Support', solo: false, fleet: true, agency: false, all: true },
  { name: 'Driver Settlements', solo: false, fleet: true, agency: false, all: true },
  { name: 'GPS Tracking', solo: false, fleet: true, agency: false, all: true },
  { name: 'Fleet Analytics', solo: false, fleet: true, agency: false, all: true },
  { name: 'Commission Tracking', solo: false, fleet: false, agency: true, all: true },
  { name: 'CRM / Shipper Mgmt', solo: false, fleet: false, agency: true, all: true },
  { name: 'Carrier Vetting', solo: false, fleet: false, agency: true, all: true },
  { name: 'Executive Dashboard', solo: false, fleet: true, agency: false, all: true },
  { name: 'Brokerage View Toggle', solo: false, fleet: false, agency: false, all: true },
];

interface PlanPrices {
  [tier: string]: { monthly: number; annual: number };
}

export default function Pricing() {
  const navigate = useNavigate();
  const [showAllInOne, setShowAllInOne] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [prices, setPrices] = useState<PlanPrices | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('subscription_plans')
      .select('tier, base_price_monthly, base_price_annual')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          const map: PlanPrices = {};
          data.forEach((p) => {
            map[p.tier] = { monthly: Number(p.base_price_monthly), annual: Number(p.base_price_annual) };
          });
          setPrices(map);
        }
        setLoading(false);
      });
  }, []);

  const displayedTierKeys = showAllInOne ? [...BASE_TIERS, 'all_in_one'] : BASE_TIERS;

  const formatPrice = (tier: string) => {
    if (!prices?.[tier]) return '—';
    const val = isAnnual ? prices[tier].annual : prices[tier].monthly;
    return `$${val}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/landing')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xl font-bold text-gradient-gold">FleetFlow TMS</span>
          </button>
          <Button variant="outline" onClick={() => navigate('/auth')}>Sign In</Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold mb-3">Simple, Transparent Pricing</h1>
          <p className="text-lg text-muted-foreground mb-6">Start with a 14-day free trial. No credit card required.</p>
          
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <div className="flex items-center gap-3">
              <Label htmlFor="billing-toggle" className={`text-sm ${!isAnnual ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>Monthly</Label>
              <Switch id="billing-toggle" checked={isAnnual} onCheckedChange={setIsAnnual} />
              <Label htmlFor="billing-toggle" className={`text-sm ${isAnnual ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>Annual</Label>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="all-in-one-toggle" className="text-sm text-muted-foreground">Show All-in-One Plan</Label>
              <Switch id="all-in-one-toggle" checked={showAllInOne} onCheckedChange={setShowAllInOne} />
            </div>
          </div>
        </div>

        {/* Tier Cards */}
        <div className={`grid gap-8 mb-20 ${showAllInOne ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
          {displayedTierKeys.map((tierKey) => {
            const tier = TIER_META[tierKey];
            if (!tier) return null;
            return (
              <Card 
                key={tier.id} 
                className={`relative flex flex-col ${tier.popular ? 'border-primary ring-2 ring-primary/20' : 'border-border'}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full gradient-gold text-primary-foreground text-xs font-semibold">
                    Most Popular
                  </div>
                )}
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                    <tier.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <CardDescription>{tier.tagline}</CardDescription>
                  <div className="mt-4">
                    {loading ? (
                      <Skeleton className="h-10 w-24 mx-auto" />
                    ) : (
                      <>
                        <span className="text-4xl font-extrabold">{formatPrice(tierKey)}</span>
                        <span className="text-muted-foreground">{isAnnual ? '/yr' : '/mo'}</span>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-4">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Hero Feature</p>
                    <p className="text-sm font-medium">{tier.heroFeature}</p>
                  </div>
                  <ul className="space-y-2 flex-1 mb-6">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground italic mb-4">{tier.upgradeNote}</p>
                  <Button 
                    className={`w-full ${tier.popular ? 'gradient-gold text-primary-foreground glow-gold' : ''}`}
                    variant={tier.popular ? 'default' : 'outline'}
                    onClick={() => navigate(`/auth?tier=${tier.id}`)}
                  >
                    Start 14-Day Beta Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Comparison Table */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-3 font-medium">Feature</th>
                  <th className="text-center p-3 font-medium">Solo BCO</th>
                  <th className="text-center p-3 font-medium">Fleet Owner</th>
                  <th className="text-center p-3 font-medium">Agency</th>
                  <th className="text-center p-3 font-medium">All-in-One</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_FEATURES.map((row, i) => (
                  <tr key={row.name} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="p-3">{row.name}</td>
                    <td className="text-center p-3">{row.solo ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-center p-3">{row.fleet ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-center p-3">{row.agency ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-center p-3">{row.all ? <CheckCircle2 className="h-4 w-4 text-primary mx-auto" /> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-muted-foreground">© 2026 FleetFlow TMS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
