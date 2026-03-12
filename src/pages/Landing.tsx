import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Truck, DollarSign, Shield, BarChart3, Users, Package, 
  ArrowRight, CheckCircle2, Fuel, FileText, Wrench, MapPin, Loader2, Play, Smartphone, Menu, Sparkles, Clock
} from 'lucide-react';
import RevealOnScroll from '@/components/shared/RevealOnScroll';

const STATS = [
  { label: 'Loads Managed', value: '50K+' },
  { label: 'BCOs Served', value: '500+' },
  { label: 'IFTA Hours Saved', value: '10K+' },
  { label: 'Uptime', value: '99.9%' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('subscription_plans')
      .select('tier, base_price_monthly')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, number> = {};
          data.forEach((p) => { map[p.tier] = Number(p.base_price_monthly); });
          setPrices(map);
        }
        setPricesLoading(false);
      });
  }, []);

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
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div>
            <span className="text-xl font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</span>
            <span className="text-[10px] text-muted-foreground ml-1.5">by JeanWayUSA</span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate('/pricing')}>Pricing</Button>
            <Button variant="outline" onClick={() => navigate('/auth')}>Sign In</Button>
            <Button className="gradient-gold text-primary-foreground" onClick={() => navigate('/auth')}>
              Start Free Trial
            </Button>
          </div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <nav className="flex flex-col gap-4 mt-8">
                <Button variant="ghost" className="justify-start" onClick={() => { setMenuOpen(false); navigate('/pricing'); }}>Pricing</Button>
                <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); navigate('/auth'); }}>Sign In</Button>
                <Button className="gradient-gold text-primary-foreground" onClick={() => { setMenuOpen(false); navigate('/auth'); }}>
                  Start Free Trial
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[hsl(240_20%_4%)]">
        {/* Dot pattern overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle, hsl(45 80% 50% / 0.07) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        {/* Radial glow */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse 80% 60% at 70% 50%, hsl(45 80% 50% / 0.08) 0%, transparent 70%)',
        }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left column */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[hsl(45_80%_50%/0.12)] text-[hsl(45_80%_60%)] text-sm font-medium mb-6 border border-[hsl(45_80%_50%/0.2)]">
                <Truck className="h-4 w-4" />
                Built for Landstar BCOs & Agents
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight mb-6 leading-[1.1] text-white">
                Master Your Fleet's{' '}
                <span className="text-gradient-gold">Finances & Dispatch.</span>
              </h1>
              <p className="text-base sm:text-lg text-[hsl(0_0%_65%)] mb-8 max-w-xl leading-relaxed">
                The all-in-one platform built specifically for Landstar BCOs to track expenses, manage card advances, and streamline dispatching.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="gradient-gold text-primary-foreground text-lg px-8 pulse-glow-gold hover:scale-105 active:scale-[0.97] transition-transform"
                  onClick={() => navigate('/auth')}
                >
                  Join Free BCO Beta
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="text-lg px-8 border-[hsl(0_0%_25%)] text-white hover:bg-[hsl(0_0%_15%)] active:scale-[0.97] transition-transform"
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

            {/* Right column — Floating dashboard mockup */}
            <div className="hidden lg:block">
              <div className="animate-float" style={{ perspective: '1000px' }}>
                <div className="rounded-xl border border-[hsl(45_80%_50%/0.15)] bg-[hsl(240_10%_10%)] shadow-2xl shadow-[hsl(45_80%_50%/0.08)] overflow-hidden"
                  style={{ transform: 'perspective(1000px) rotateY(-8deg) rotateX(4deg)' }}>
                  {/* Top bar */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(0_0%_18%)]">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[hsl(0_70%_50%)]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[hsl(45_80%_50%)]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[hsl(142_70%_45%)]" />
                    </div>
                    <div className="flex-1 mx-4 h-5 rounded bg-[hsl(0_0%_15%)]" />
                  </div>
                  <div className="flex">
                    {/* Mini sidebar */}
                    <div className="w-10 border-r border-[hsl(0_0%_18%)] py-3 flex flex-col items-center gap-3">
                      {[BarChart3, Package, MapPin, Wrench, DollarSign].map((Icon, i) => (
                        <Icon key={i} className={`h-4 w-4 ${i === 0 ? 'text-[hsl(45_80%_55%)]' : 'text-[hsl(0_0%_35%)]'}`} />
                      ))}
                    </div>
                    {/* Content */}
                    <div className="flex-1 p-4 space-y-3">
                      {/* KPI row */}
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'Revenue', value: '$24,850', color: 'hsl(45 80% 50%)' },
                          { label: 'Loads', value: '18', color: 'hsl(142 70% 50%)' },
                          { label: 'Avg CPM', value: '$2.41', color: 'hsl(200 80% 55%)' },
                        ].map((kpi) => (
                          <div key={kpi.label} className="rounded-lg bg-[hsl(0_0%_13%)] p-2.5 border border-[hsl(0_0%_18%)]">
                            <p className="text-[10px] text-[hsl(0_0%_50%)] mb-0.5">{kpi.label}</p>
                            <p className="text-sm font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                          </div>
                        ))}
                      </div>
                      {/* Chart area */}
                      <div className="rounded-lg bg-[hsl(0_0%_13%)] border border-[hsl(0_0%_18%)] p-3 h-28">
                        <p className="text-[10px] text-[hsl(0_0%_45%)] mb-2">Weekly Revenue</p>
                        <svg viewBox="0 0 200 60" className="w-full h-16">
                          <defs>
                            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="hsl(45 80% 50%)" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="hsl(45 80% 50%)" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d="M0,50 Q25,45 50,35 T100,25 T150,15 T200,10" fill="none" stroke="hsl(45 80% 50%)" strokeWidth="2" />
                          <path d="M0,50 Q25,45 50,35 T100,25 T150,15 T200,10 L200,60 L0,60 Z" fill="url(#chartGrad)" />
                        </svg>
                      </div>
                      {/* Table rows */}
                      <div className="space-y-1">
                        {['ATL → MIA', 'DAL → HOU', 'CHI → DET'].map((route, i) => (
                          <div key={route} className="flex items-center justify-between text-[10px] px-2 py-1.5 rounded bg-[hsl(0_0%_13%)] border border-[hsl(0_0%_18%)]">
                            <span className="text-[hsl(0_0%_60%)]">{route}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                              i === 0 ? 'bg-[hsl(142_70%_45%/0.15)] text-[hsl(142_70%_55%)]' :
                              i === 1 ? 'bg-[hsl(45_80%_50%/0.15)] text-[hsl(45_80%_60%)]' :
                              'bg-[hsl(200_80%_55%/0.15)] text-[hsl(200_80%_60%)]'
                            }`}>
                              {i === 0 ? 'Delivered' : i === 1 ? 'In Transit' : 'Booked'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <RevealOnScroll>
      <section className="border-y border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gradient-gold">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      </RevealOnScroll>

      <RevealOnScroll>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="text-center mb-12">
          <h3 className="text-2xl sm:text-3xl font-bold mb-3">Simple, Transparent Pricing</h3>
          <p className="text-muted-foreground text-base sm:text-lg">Start free during our Open Beta. Premium tiers coming soon.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-center max-w-5xl mx-auto">
          {/* Solo BCO — Coming Soon */}
          <Card className="border-border opacity-60 relative overflow-hidden">
            <CardContent className="p-6">
              <Badge variant="secondary" className="mb-4"><Clock className="h-3 w-3 mr-1" />Coming Soon</Badge>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold">Solo BCO</h4>
                  <p className="text-xs text-muted-foreground">The Owner-Operator Pack</p>
                </div>
              </div>
              <div className="mb-5">
                {pricesLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <span className="text-2xl font-bold text-muted-foreground line-through">${prices['solo_bco'] ?? '—'}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </>
                )}
              </div>
              <ul className="space-y-2 mb-6">
                {['Per-load profit/loss', 'IFTA fuel tax automation', 'Maintenance reminders', 'Digital document storage'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full active:scale-[0.97] transition-transform" disabled>Coming Soon</Button>
            </CardContent>
          </Card>

          {/* Open Beta — Featured */}
          <Card className="border-primary/50 shadow-lg shadow-primary/10 md:scale-105 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 gradient-gold" />
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <Badge className="gradient-gold text-primary-foreground border-0">
                  <Sparkles className="h-3 w-3 mr-1" />Limited Time
                </Badge>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg gradient-gold flex items-center justify-center">
                  <Truck className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h4 className="text-lg font-bold">Open Beta</h4>
                  <p className="text-xs text-muted-foreground">Full access, zero cost</p>
                </div>
              </div>
              <div className="mb-5">
                <span className="text-4xl font-extrabold text-gradient-gold">$0</span>
                <span className="text-sm text-muted-foreground ml-1">/ forever during beta</span>
              </div>
              <ul className="space-y-2 mb-6">
                {['Per-load profit/loss', 'IFTA fuel tax automation', 'Maintenance reminders', 'Digital document storage', 'Priority feature requests', 'Early adopter perks'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button 
                className="w-full gradient-gold text-primary-foreground text-base pulse-glow-gold hover:scale-[1.02] active:scale-[0.97] transition-transform"
                size="lg"
                onClick={() => navigate('/auth')}
              >
                Start Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">No credit card required</p>
            </CardContent>
          </Card>

          {/* Fleet Owner — Coming Soon */}
          <Card className="border-border opacity-60 relative overflow-hidden">
            <CardContent className="p-6">
              <Badge variant="secondary" className="mb-4"><Clock className="h-3 w-3 mr-1" />Coming Soon</Badge>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold">Fleet Owner</h4>
                  <p className="text-xs text-muted-foreground">The Scalability Suite</p>
                </div>
              </div>
              <div className="mb-5">
                {pricesLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <span className="text-2xl font-bold text-muted-foreground line-through">${prices['fleet_owner'] ?? '—'}</span>
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </>
                )}
              </div>
              <ul className="space-y-2 mb-6">
                {['Driver settlements & payroll', 'Fleet-wide analytics', 'Real-time GPS tracking', 'Cost-per-mile reporting'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full active:scale-[0.97] transition-transform" disabled>Coming Soon</Button>
            </CardContent>
          </Card>
        </div>
        <div className="text-center mt-8">
          <Button variant="outline" size="lg" className="active:scale-[0.97] transition-transform" onClick={() => navigate('/pricing')}>
            Compare All Features <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </section>
      </RevealOnScroll>

      <RevealOnScroll>
      <section className="bg-card/50 border-y border-border py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-2xl sm:text-3xl font-bold mb-3">Built for the Way You Work</h3>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">Four core capabilities designed around how Landstar BCOs actually run their business.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { icon: FileText, title: 'Automated Statement Parsing', desc: 'Upload your Landstar settlement PDF and watch it auto-map every line item — revenue, deductions, and advances — in seconds.', accent: 'bg-primary/10 text-primary' },
              { icon: Fuel, title: 'Fuel & Card Advance Tracking', desc: 'Track fuel purchases, Comdata advances, and per-load expenses so you always know your true cost-per-mile.', accent: 'bg-emerald-500/10 text-emerald-500' },
              { icon: Package, title: 'Active Load Dispatching', desc: 'Assign drivers, update statuses, and monitor pickups & deliveries from a single real-time board.', accent: 'bg-blue-500/10 text-blue-500' },
              { icon: Smartphone, title: 'Driver Mobile Access', desc: 'Drivers get their own dashboard for BOL uploads, DVIR forms, and live trip updates — right from their phone.', accent: 'bg-purple-500/10 text-purple-500' },
            ].map((f) => (
              <div key={f.title} className="p-5 sm:p-8 rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30 active:scale-[0.98]">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-6 ${f.accent}`}>
                  <f.icon className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-semibold mb-2">{f.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      </RevealOnScroll>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="text-center rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-12">
          <h3 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Take Control?</h3>
          <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-xl mx-auto">
            Join hundreds of Landstar BCOs and agents already using Fleet Flow TMS to maximize profit and minimize headaches.
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
          <p className="text-sm text-muted-foreground">© 2026 Fleet Flow TMS by JeanWayUSA. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <button onClick={() => navigate('/pricing')} className="hover:text-foreground transition-colors">Pricing</button>
            <button onClick={() => navigate('/auth')} className="hover:text-foreground transition-colors">Sign In</button>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/80 backdrop-blur-md border-t border-border sm:hidden z-50">
        <Button 
          className="w-full gradient-gold text-primary-foreground"
          onClick={() => navigate('/auth')}
        >
          Join BCO Beta
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
