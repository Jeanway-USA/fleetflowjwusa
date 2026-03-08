import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Truck, DollarSign, Shield, BarChart3, Users, Package, 
  ArrowRight, CheckCircle2, Fuel, FileText, Wrench, MapPin, Loader2, Play
} from 'lucide-react';

const TIERS = [
  {
    name: 'Solo BCO',
    tagline: 'The Owner-Operator Power Pack',
    icon: Truck,
    features: ['Per-load profit/loss', 'IFTA fuel tax automation', 'Maintenance reminders', 'Digital document storage'],
    color: 'from-blue-500 to-blue-600',
  },
  {
    name: 'Fleet Owner',
    tagline: 'The Scalability Suite',
    icon: Users,
    features: ['Driver settlements & payroll', 'Fleet-wide analytics', 'Real-time GPS tracking', 'Cost-per-mile reporting'],
    color: 'from-primary to-accent',
  },
  {
    name: 'Agency',
    tagline: 'The Brokerage Hub',
    icon: Package,
    features: ['Agent dashboard', 'Commission tracking', 'Carrier vetting', 'Shipper CRM'],
    color: 'from-emerald-500 to-emerald-600',
  },
];

const STATS = [
  { label: 'Loads Managed', value: '50K+' },
  { label: 'BCOs Served', value: '500+' },
  { label: 'IFTA Hours Saved', value: '10K+' },
  { label: 'Uptime', value: '99.9%' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('demo-login');
      if (error) throw error;
      if (data?.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        toast.success('Welcome to the demo!');
        navigate('/');
      } else {
        throw new Error('No session returned');
      }
    } catch (err: any) {
      toast.error('Demo login failed. Please try again.');
      console.error('Demo login error:', err);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <span className="text-xl font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</span>
            <span className="text-[10px] text-muted-foreground ml-1.5">by JeanWayUSA</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/pricing')}>Pricing</Button>
            <Button variant="outline" onClick={() => navigate('/auth')}>Sign In</Button>
            <Button className="gradient-gold text-primary-foreground" onClick={() => navigate('/auth')}>
              Start Free Trial
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Truck className="h-4 w-4" />
              Built for Landstar BCOs & Agents
            </div>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6">
              Run Your Trucking Business{' '}
              <span className="text-gradient-gold">Like a Fortune 500</span>
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              From solo owner-operators to multi-truck fleets and agencies — one platform 
              for loads, IFTA, settlements, maintenance, and profitability.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="gradient-gold text-primary-foreground text-lg px-8 glow-gold"
                onClick={() => navigate('/auth')}
              >
                Start 14-Day Free Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8"
                onClick={handleDemoLogin}
                disabled={demoLoading}
              >
                {demoLoading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Demo...</>
                ) : (
                  <><Play className="mr-2 h-5 w-5" /> Try Demo</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-gradient-gold">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tiers Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-3">A Plan for Every Stage of Growth</h3>
          <p className="text-muted-foreground text-lg">Start solo. Scale to a fleet. Grow into an agency.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {TIERS.map((tier) => (
            <Card key={tier.name} className="border-border hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${tier.color} flex items-center justify-center`}>
                    <tier.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold">{tier.name}</h4>
                    <p className="text-xs text-muted-foreground">{tier.tagline}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-center mt-8">
          <Button variant="outline" size="lg" onClick={() => navigate('/pricing')}>
            Compare All Features <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="bg-card/50 border-y border-border py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-center mb-12">Everything You Need to Succeed</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: DollarSign, title: 'Per-Load P&L', desc: 'Know your true profit on every load — fuel, tolls, fees included.' },
              { icon: Fuel, title: 'IFTA Automation', desc: 'Auto-calculate fuel tax by jurisdiction. Print-ready quarterly reports.' },
              { icon: Wrench, title: 'Maintenance Tracker', desc: 'Oil changes, tire rotations, 120-day inspections — never miss one.' },
              { icon: MapPin, title: 'GPS Fleet Tracking', desc: 'Real-time driver locations on a live map with route history.' },
              { icon: BarChart3, title: 'Fleet Analytics', desc: 'Cost-per-mile, revenue trends, and driver performance scorecards.' },
              { icon: FileText, title: 'Document Vault', desc: 'BOLs, rate confirmations, and compliance docs — all in one place.' },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors">
                <f.icon className="h-8 w-8 text-primary mb-3" />
                <h4 className="font-semibold mb-1">{f.title}</h4>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center rounded-2xl border border-primary/20 bg-primary/5 p-12">
          <h3 className="text-3xl font-bold mb-3">Ready to Take Control?</h3>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
            Join hundreds of Landstar BCOs and agents already using FleetFlow to maximize profit and minimize headaches.
          </p>
          <Button 
            size="lg" 
            className="gradient-gold text-primary-foreground text-lg px-10 glow-gold"
            onClick={() => navigate('/auth')}
          >
            Start Your 14-Day Free Trial
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">© 2026 FleetFlow TMS. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <button onClick={() => navigate('/pricing')} className="hover:text-foreground transition-colors">Pricing</button>
            <button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Sign In</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
