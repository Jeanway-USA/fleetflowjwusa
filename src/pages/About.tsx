import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Truck, Heart, Users, Target } from 'lucide-react';
import RevealOnScroll from '@/components/shared/RevealOnScroll';
import logoIcon from '@/assets/Logo.png';
import textLogo from '@/assets/Text_Logo.png';

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>About FleetFlow TMS — Built by Owner-Operators</title>
        <meta name="description" content="Learn how FleetFlow TMS was built by owner-operators to give independent truckers enterprise-grade tools without enterprise-grade costs." />
        <link rel="canonical" href="https://tms.jeanwayusa.com/about" />
        <meta property="og:title" content="About FleetFlow TMS" />
        <meta property="og:description" content="Built by owner-operators, for owner-operators." />
        <meta property="og:url" content="https://tms.jeanwayusa.com/about" />
      </Helmet>
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Back to home">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <img src={logoIcon} alt="" className="h-7 w-auto" />
            <img src={textLogo} alt="FleetFlow TMS" className="h-7 w-auto" />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16 space-y-20">
        {/* Hero */}
        <RevealOnScroll>
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold">About FleetFlow</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built by owner-operators, for owner-operators. FleetFlow started from a simple need and grew into a platform for every trucking business.
            </p>
          </div>
        </RevealOnScroll>

        {/* Origin Story */}
        <RevealOnScroll>
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold">How It All Started</h2>
            </div>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                Our founding team includes owner-operators who lived the problem firsthand — juggling spreadsheets, paper receipts, and disconnected apps just to keep track of revenue, expenses, and day-to-day operations.
              </p>
              <p>
                We wanted an easier way to see everything in one place — a single dashboard to monitor finances, track loads, and manage drivers. FleetFlow was originally built for a specific carrier's contractors, but we quickly realized the need was universal.
              </p>
              <p>
                What began as an internal tool quickly turned into something much bigger. Thousands of owner-operators face the same challenges, so we decided to make it available to everyone.
              </p>
            </div>
          </section>
        </RevealOnScroll>

        {/* Mission */}
        <RevealOnScroll>
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold">Our Mission</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We believe owner-operators deserve enterprise-grade tools without enterprise-grade costs. FleetFlow is built to give independent truckers the same visibility and control that large fleets have — load management, IFTA tracking, maintenance scheduling, financial reporting, and more — all in one place.
            </p>
          </section>
        </RevealOnScroll>

        {/* Why Free */}
        <RevealOnScroll>
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Heart className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold">Affordable for Everyone</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              We started FleetFlow because our team needed it. We know how tight margins can be in trucking, and the last thing an owner-operator needs is another expensive subscription eating into their bottom line. During our open beta, the platform is completely free so we can gather real feedback from real drivers. Once we launch fully, our pricing will remain competitive and accessible — designed so that businesses of any size can afford the tools they need to run efficiently.
            </p>
          </section>
        </RevealOnScroll>

        {/* Vision */}
        <RevealOnScroll>
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold">The Vision</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              FleetFlow is more than a TMS — it's a growing community of owner-operators helping shape the tools they actually need. Every feature we build is driven by feedback from drivers like you. Whether you're a solo owner-operator running one truck or managing a small fleet, FleetFlow is designed to scale with your business and make your life on the road just a little bit easier.
            </p>
          </section>
        </RevealOnScroll>

        {/* CTA */}
        <RevealOnScroll>
          <div className="text-center space-y-4 py-8">
            <h3 className="text-2xl font-semibold">Ready to get started?</h3>
            <Button className="gradient-gold text-primary-foreground" size="lg" onClick={() => navigate('/auth')}>
              Join the Beta — It's Free
            </Button>
          </div>
        </RevealOnScroll>
      </main>
    </div>
  );
}
