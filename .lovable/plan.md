

## Add About, Contact, Privacy Policy & Terms of Service Pages

### Overview
Create four new public pages linked from the Landing footer. Contact form emails sent via Resend (already configured with `RESEND_API_KEY`, sending from `no-reply@jeanwayusa.com`), matching the existing pattern used by `send-invoice-email` and `invite-user`.

### Changes

#### 1. New Edge Function: `supabase/functions/contact-form/index.ts`
- Accept POST with `name`, `email`, `subject`, `message` (validated with Zod)
- Authenticate as super admin NOT required — public endpoint
- Send email to `hr@jeanwayusa.com` via Resend with all form details
- Send confirmation reply to the submitter
- CORS headers included
- Uses existing `RESEND_API_KEY` secret

#### 2. New Page: `src/pages/About.tsx`
- Origin story based on provided context (Siadrak, Landstar, owner-operator needs)
- Sections: Mission, Origin Story, Why It's Free, Vision
- Dark theme with gold accents, RevealOnScroll animations
- Back-to-home navigation header

#### 3. New Page: `src/pages/Contact.tsx`
- Form fields: Name, Email, Subject, Message
- Client-side validation with zod + react-hook-form
- On submit: invoke `contact-form` edge function
- Success/error toast feedback
- Same dark theme styling

#### 4. New Page: `src/pages/PrivacyPolicy.tsx`
- Standard privacy policy tailored to fleet management TMS
- Covers: data collection, GPS/location data, financial records, cookies, third-party services, user rights
- Effective date included

#### 5. New Page: `src/pages/TermsOfService.tsx`
- Standard TOS covering: account responsibilities, acceptable use, service availability, limitation of liability, termination
- Tailored to FleetFlow TMS context

#### 6. Update `src/App.tsx`
- Add lazy imports and routes: `/about`, `/contact`, `/privacy`, `/terms`

#### 7. Update `src/pages/Landing.tsx` (footer)
- Wire the four footer buttons to `navigate('/about')`, `/contact`, `/privacy`, `/terms`

### No database table needed
Contact form submissions go directly to email via the edge function — no persistence required unless you want it later.

