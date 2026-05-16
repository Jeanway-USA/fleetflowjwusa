import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import logoIcon from '@/assets/Logo.png';
import textLogo from '@/assets/Text_Logo.png';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Privacy Policy — FleetFlow TMS</title>
        <meta name="description" content="How FleetFlow TMS collects, uses, and protects your information." />
        <link rel="canonical" href="https://tms.jeanwayusa.com/privacy" />
        <meta property="og:url" content="https://tms.jeanwayusa.com/privacy" />
      </Helmet>
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

      <main className="max-w-3xl mx-auto px-4 py-16 prose prose-neutral dark:prose-invert max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground"><strong>Effective Date:</strong> April 4, 2026</p>
        <p>FleetFlow TMS ("FleetFlow," "we," "us," or "our"), operated by JeanWay USA, is committed to protecting your privacy. This Privacy Policy describes how we collect, use, and safeguard your information when you use our fleet management platform.</p>

        <h2>1. Information We Collect</h2>
        <h3>Account Information</h3>
        <p>When you create an account, we collect your name, email address, phone number, and company details. For driver accounts, we may also collect CDL information, medical card expiry dates, and employment details.</p>
        <h3>Financial Data</h3>
        <p>We collect revenue, expense, settlement, and payroll data that you enter into the platform to provide financial reporting and IFTA compliance features.</p>
        <h3>Location Data</h3>
        <p>If you use our location-sharing features (e.g., driver tracking, geofence arrivals), we collect GPS coordinates, speed, and heading data. Location sharing is optional and can be disabled at any time.</p>
        <h3>Vehicle & Maintenance Data</h3>
        <p>We collect information about your trucks, trailers, and maintenance schedules, including VINs, odometer readings, service records, and DVIR inspection reports.</p>
        <h3>Usage Data</h3>
        <p>We automatically collect information about how you use the platform, including pages visited, features used, and interaction patterns, to improve our service.</p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the FleetFlow platform and its features</li>
          <li>To calculate IFTA tax obligations and generate compliance reports</li>
          <li>To send transactional emails (invoices, load updates, notifications)</li>
          <li>To provide customer support and respond to inquiries</li>
          <li>To improve our platform based on usage patterns</li>
          <li>To send important service announcements and updates</li>
        </ul>

        <h2>3. Data Storage & Security</h2>
        <p>Your data is stored on secure, encrypted servers. We use industry-standard security measures, including encryption in transit (TLS) and at rest, role-based access controls, and regular security audits. Financial data and credentials are encrypted with additional layers of protection.</p>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your personal information. We may share data with:</p>
        <ul>
          <li><strong>Service Providers:</strong> Third-party services that help us operate the platform (hosting, email delivery, payment processing)</li>
          <li><strong>At Your Direction:</strong> When you choose to share load tracking links, send invoices, or invite team members</li>
          <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation</li>
        </ul>

        <h2>5. Cookies & Tracking</h2>
        <p>We use essential cookies to maintain your session and preferences. We do not use third-party advertising trackers. Analytics data is collected in aggregate form to improve the platform.</p>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access and download your personal data</li>
          <li>Correct inaccurate information</li>
          <li>Delete your account and associated data</li>
          <li>Opt out of non-essential communications</li>
          <li>Disable location sharing at any time</li>
        </ul>

        <h2>7. Data Retention</h2>
        <p>We retain your data for as long as your account is active. Financial records may be retained for up to 7 years to comply with tax and regulatory requirements. Upon account deletion, personal data is removed within 30 days, except where retention is required by law.</p>

        <h2>8. Children's Privacy</h2>
        <p>FleetFlow is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors.</p>

        <h2>9. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or a notice on the platform. Continued use after changes constitutes acceptance.</p>

        <h2>10. Contact Us</h2>
        <p>If you have questions about this Privacy Policy, please contact us at:</p>
        <p>
          <strong>JeanWay USA</strong><br />
          Email: <a href="mailto:hr@jeanwayusa.com" className="text-primary">hr@jeanwayusa.com</a>
        </p>
      </main>
    </div>
  );
}
