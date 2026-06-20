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
  ArrowRight, CheckCircle2, Fuel, FileText, Wrench, MapPin, Loader2, Play, Smartphone, Menu, Sparkles, Clock,
  Search, Route, ReceiptText, WifiOff, MapPinned, CloudLightning, ShieldCheck, BellRing,
} from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import RevealOnScroll from '@/components/shared/RevealOnScroll';
import logoIcon from '@/assets/Logo.png';
import textLogo from '@/assets/Text_Logo.png';

const STATS = [
  { label: 'Cost to You', value: '$0' },
  { label: 'Built for Truckers', value: '100%' },
  { label: 'Features Included', value: 'All' },
  { label: 'Setup Time', value: '< 5 min' },
];

const DISPATCHER_FEATURES = [
  { icon: Search, title: 'Global Omni-Search', desc: 'Instantly filter loads by driver, city, truck, or shipper with our lightning-fast debounced search engine.' },
  { icon: Route, title: 'Dynamic Live Tracking', desc: 'Real-time GPS routing that automatically recalculates and persists active routes on the map.' },
  { icon: ReceiptText, title: 'Automated Billing', desc: 'Built-in Landstar tariff logic for automatic detention, over-dimension freight, and accessorial calculation.' },
];

const DRIVER_FEATURES = [
  { icon: WifiOff, title: 'Offline-First Documents', desc: 'Never lose a BOL again. Scan and queue documents offline; they auto-upload when you regain cell service.' },
  { icon: DollarSign, title: 'Transparent Settlements', desc: 'Live, pre-split financial previews on every load so you know exactly what you take home.' },
  { icon: MapPinned, title: 'Facility Intelligence', desc: 'Crowdsourced driver notes, gate codes, and instructions for seamless last-mile navigation.' },
];

const SAFETY_FEATURES = [
  { icon: CloudLightning, title: 'Route Hazard Overlays', desc: 'Live severe weather alerts directly overlaid on active driver routes.' },
  { icon: ShieldCheck, title: 'Advanced Credentialing', desc: 'Track TWIC, FAST cards, DOD Clearances, and Landstar Operator IDs in one secure hub.' },
  { icon: BellRing, title: 'Predictive PM Alerts', desc: 'Automated 2,000-mile / 14-day preventive-maintenance alerts keep trucks legal and on the road.' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [pricesLoading, setPricesLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsAuthed(!!data.session));
  }, []);

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

  const primaryCtaLabel = isAuthed ? 'Go to Dashboard' : 'Login';
  const handlePrimaryCta = () => navigate(isAuthed ? '/' : '/auth');

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
      <Helmet>
        <title>FleetFlow TMS — Next-Gen Fleet Management & Driver Intelligence</title>
        <meta name="description" content="Bridging dispatchers, owner-operators, and compliance with real-time tracking, transparent settlements, and automated logistics." />
        <link rel="canonical" href="https://tms.jeanwayusa.com/" />
        <meta property="og:title" content="FleetFlow TMS — Next-Gen Fleet Management & Driver Intelligence" />
        <meta property="og:description" content="Real-time tracking, transparent settlements, and automated logistics for modern fleets and owner-operators." />
        <meta property="og:url" content="https://tms.jeanwayusa.com/" />
      </Helmet>
      {/* Nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logoIcon} alt="" className="h-8 w-auto" />
            <img src={textLogo} alt="FleetFlow TMS by JeanWay USA" className="h-8 w-auto" />
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <Button variant="ghost" className="active:scale-[0.97] transition-transform" onClick={() => navigate('/pricing')}>Pricing</Button>
            <Button variant="outline" className="active:scale-[0.97] transition-transform" onClick={() => navigate('/auth')}>Sign In</Button>
            <Button className="gradient-gold text-primary-foreground active:scale-[0.97] transition-transform" onClick={() => navigate('/auth')}>
              Join Free Beta
            </Button>
          </div>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open navigation menu">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <nav className="flex flex-col gap-4 mt-8">
                <Button variant="ghost" className="justify-start" onClick={() => { setMenuOpen(false); navigate('/pricing'); }}>Pricing</Button>
                <Button variant="outline" className="justify-start" onClick={() => { setMenuOpen(false); navigate('/auth'); }}>Sign In</Button>
                <Button className="gradient-gold text-primary-foreground" onClick={() => { setMenuOpen(false); navigate('/auth'); }}>
                  Join Free Beta
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Dot pattern overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, hsl(var(--primary) / 0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />
        {/* Gold radial glow */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.18),transparent_60%)]" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36 relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-6 border border-primary/20">
            <Sparkles className="h-3.5 w-3.5" />
            v2026 · Next-Gen TMS Platform
          </div>
          <h1 className="font-heading text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.05]">
            Next-Generation Fleet Management
            <br className="hidden sm:block" />
            <span className="text-gradient-gold"> & Driver Intelligence.</span>
          </h1>
          <p className="text-base sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Bridging the gap between dispatchers, owner-operators, and compliance with real-time tracking, transparent settlements, and automated logistics.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="gradient-gold text-primary-foreground text-base px-8 pulse-glow-gold hover:scale-105 active:scale-[0.97] transition-transform"
              onClick={handlePrimaryCta}
            >
              {primaryCtaLabel}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8 active:scale-[0.97] transition-transform"
              onClick={handleDemoLogin}
              disabled={demoLoading}
            >
              {demoLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Demo...</>
              ) : (
                <><Play className="mr-2 h-5 w-5" /> Try Live Demo</>
              )}
            </Button>
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
          <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-3 tracking-tight">Simple, Transparent Pricing</h2>
          <p className="text-muted-foreground text-base sm:text-lg">Start free during our Open Beta. Premium tiers coming soon.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 items-center max-w-5xl mx-auto">
          {/* Solo Operator — Coming Soon */}
          <Card className="border-border opacity-60 relative overflow-hidden">
            <CardContent className="p-6">
              <Badge variant="secondary" className="mb-4"><Clock className="h-3 w-3 mr-1" />Coming Soon</Badge>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold">Solo Operator</h4>
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

      {[
        { id: 'dispatch', eyebrow: 'For Dispatchers', title: 'Dispatcher Superpowers', desc: 'Run the board faster with tools built for high-volume operations.', items: DISPATCHER_FEATURES, tone: 'default' as const },
        { id: 'driver', eyebrow: 'For Drivers', title: 'The Driver Experience', desc: 'A mobile-first workspace designed for the cab, not the cubicle.', items: DRIVER_FEATURES, tone: 'muted' as const },
        { id: 'safety', eyebrow: 'For Safety & Ops', title: 'Safety & Compliance Guardrails', desc: 'Stay ahead of weather, credentials, and maintenance windows.', items: SAFETY_FEATURES, tone: 'default' as const },
      ].map((section) => (
        <RevealOnScroll key={section.id}>
          <section
            aria-labelledby={`section-${section.id}`}
            className={section.tone === 'muted'
              ? 'bg-card/50 border-y border-border py-16 sm:py-24'
              : 'py-16 sm:py-24'}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12 max-w-2xl mx-auto">
                <span className="inline-block text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-3">{section.eyebrow}</span>
                <h2 id={`section-${section.id}`} className="font-heading text-3xl sm:text-4xl font-bold mb-3 tracking-tight">{section.title}</h2>
                <p className="text-muted-foreground text-base sm:text-lg">{section.desc}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {section.items.map((f) => (
                  <div
                    key={f.title}
                    className="group relative p-6 sm:p-8 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.35)]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 ring-1 ring-primary/20 transition-colors group-hover:bg-primary/15">
                      <f.icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-heading text-lg font-semibold mb-2 tracking-tight">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </RevealOnScroll>
      ))}


      <RevealOnScroll>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        <div className="text-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08),transparent_70%)]" />
          <div className="relative z-10">
            <span className="inline-block text-xs font-semibold uppercase tracking-widest text-primary mb-4 border border-primary/30 rounded-full px-4 py-1 bg-primary/10">Open Beta</span>
            <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-3 tracking-tight">Join the Open Beta</h2>
            <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-xl mx-auto">
              Be among the first owner-operators to experience Fleet Flow TMS. Full platform access, zero cost during the beta period.
            </p>
            <Button 
              size="lg" 
              className="gradient-gold text-primary-foreground text-lg px-10 pulse-glow-gold active:scale-[0.97] transition-transform"
              onClick={() => navigate('/auth')}
            >
              Join Beta
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <p className="text-xs text-muted-foreground mt-4">Free during Open Beta · No credit card required</p>
          </div>
        </div>
      </section>
      </RevealOnScroll>
      </main>

      <footer className="bg-[hsl(240_20%_4%)] border-t border-border pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <img src={logoIcon} alt="" className="h-7 w-auto" />
                <img src={textLogo} alt="FleetFlow TMS by JeanWay USA" className="h-7 w-auto" />
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">The all-in-one platform built for owner-operators to track finances, dispatch loads, and grow profitably.</p>
            </div>
            {/* Product */}
            <div>
              <h5 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Product</h5>
              <ul className="space-y-2.5">
                {['Loads', 'IFTA', 'Maintenance', 'Dispatch', 'Driver App'].map((item) => (
                  <li key={item}>
                    <button onClick={() => navigate('/auth')} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">{item}</button>
                  </li>
                ))}
              </ul>
            </div>
            {/* Company */}
            <div>
              <h5 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Company</h5>
              <ul className="space-y-2.5">
                <li><button onClick={() => navigate('/pricing')} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Pricing</button></li>
                <li><button onClick={() => navigate('/about')} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">About</button></li>
                <li><button onClick={() => navigate('/contact')} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Contact</button></li>
              </ul>
            </div>
            {/* Legal */}
            <div>
              <h5 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">Legal</h5>
              <ul className="space-y-2.5">
                <li><button onClick={() => navigate('/privacy')} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Privacy Policy</button></li>
                <li><button onClick={() => navigate('/terms')} className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Terms of Service</button></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p className="text-xs text-muted-foreground">© 2026 FleetFlow TMS by JeanWay USA. All rights reserved.</p>
            <p className="text-xs text-muted-foreground">Built for Owner-Operators</p>
          </div>
        </div>
      </footer>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-background/80 backdrop-blur-md border-t border-border sm:hidden z-50">
        <Button 
          className="w-full gradient-gold text-primary-foreground"
          onClick={() => navigate('/auth')}
        >
          Join Beta
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
