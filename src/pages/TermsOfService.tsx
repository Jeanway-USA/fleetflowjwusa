import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import logoIcon from '@/assets/Logo.png';
import textLogo from '@/assets/Text_Logo.png';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Terms of Service — FleetFlow TMS</title>
        <meta name="description" content="The terms that govern your use of FleetFlow TMS." />
        <link rel="canonical" href="https://tms.jeanwayusa.com/terms" />
        <meta property="og:url" content="https://tms.jeanwayusa.com/terms" />
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
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground"><strong>Effective Date:</strong> April 4, 2026</p>
        <p>Welcome to FleetFlow TMS ("FleetFlow," "the Platform"), operated by JeanWay USA. By accessing or using FleetFlow, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, please do not use the Platform.</p>

        <h2>1. Account Registration</h2>
        <p>To use FleetFlow, you must create an account with accurate and complete information. You are responsible for maintaining the confidentiality of your credentials and for all activities under your account. You must be at least 18 years old to create an account.</p>

        <h2>2. Description of Service</h2>
        <p>FleetFlow is a transportation management system (TMS) designed for owner-operators, BCOs, and small fleet operators. The Platform provides tools for load management, financial tracking, IFTA compliance, maintenance scheduling, driver management, CRM, and related fleet operations features.</p>

        <h2>3. Acceptable Use</h2>
        <p>You agree to use the Platform only for lawful purposes related to your trucking and fleet operations. You shall not:</p>
        <ul>
          <li>Use the Platform for any illegal or unauthorized purpose</li>
          <li>Attempt to gain unauthorized access to other accounts or system resources</li>
          <li>Upload malicious code, viruses, or harmful content</li>
          <li>Interfere with or disrupt the Platform's operation</li>
          <li>Use automated tools to scrape or extract data from the Platform</li>
          <li>Resell, sublicense, or redistribute access to the Platform</li>
        </ul>

        <h2>4. Your Data</h2>
        <p>You retain ownership of all data you enter into FleetFlow, including financial records, load information, driver details, and documents. We do not claim ownership of your content. You grant us a limited license to use your data solely to provide the Platform's services to you.</p>

        <h2>5. Accuracy of Financial Data</h2>
        <p>FleetFlow provides tools for financial tracking, IFTA calculations, and reporting. While we strive for accuracy, you are solely responsible for verifying all financial data, tax calculations, and compliance reports. FleetFlow does not provide tax, legal, or financial advice. Always consult qualified professionals for tax filings and regulatory compliance.</p>

        <h2>6. Service Availability</h2>
        <p>We strive to maintain high availability but do not guarantee uninterrupted access. The Platform may experience downtime for maintenance, updates, or unforeseen issues. We will make reasonable efforts to provide advance notice of planned maintenance.</p>

        <h2>7. Beta Program</h2>
        <p>During the open beta period, features may change, be added, or removed without prior notice. Beta features are provided "as-is" and may contain bugs or incomplete functionality. Your feedback during the beta period helps us improve the Platform.</p>

        <h2>8. Fees & Billing</h2>
        <p>FleetFlow is currently offered free during the open beta period. If we introduce paid tiers in the future, we will provide at least 30 days' notice and clearly communicate pricing changes. You will never be charged without explicit consent.</p>

        <h2>9. Termination</h2>
        <p>You may delete your account at any time from your account settings. We reserve the right to suspend or terminate accounts that violate these Terms or engage in abusive behavior. Upon termination, your data will be handled in accordance with our Privacy Policy.</p>

        <h2>10. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, FleetFlow and JeanWay USA shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of revenue, data, or business opportunities, arising from your use of the Platform. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim (or $100 if no fees were paid).</p>

        <h2>11. Disclaimer of Warranties</h2>
        <p>The Platform is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Platform will be error-free, secure, or available at all times. We disclaim all warranties, including implied warranties of merchantability, fitness for a particular purpose, and non-infringement.</p>

        <h2>12. Indemnification</h2>
        <p>You agree to indemnify and hold harmless JeanWay USA, its officers, employees, and affiliates from any claims, damages, or expenses arising from your use of the Platform or violation of these Terms.</p>

        <h2>13. Governing Law</h2>
        <p>These Terms shall be governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict-of-law provisions. Any disputes shall be resolved in the courts located in the State of Florida.</p>

        <h2>14. Changes to These Terms</h2>
        <p>We may update these Terms from time to time. We will notify you of material changes via email or a notice on the Platform. Continued use after changes constitutes acceptance of the revised Terms.</p>

        <h2>15. Contact Us</h2>
        <p>If you have questions about these Terms, please contact us at:</p>
        <p>
          <strong>JeanWay USA</strong><br />
          Email: <a href="mailto:hr@jeanwayusa.com" className="text-primary">hr@jeanwayusa.com</a>
        </p>
      </main>
    </div>
  );
}
