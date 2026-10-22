import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { W2Documents, EMPTY_W2_DOCS_STATE, type W2DocsState } from '@/components/onboarding/W2Documents';
import { ContractorDocuments, EMPTY_CONTRACTOR_DOCS_STATE, type ContractorDocsState } from '@/components/onboarding/ContractorDocuments';
import { StateTaxForm, EMPTY_STATE_TAX_FORM, type StateTaxFormState } from '@/components/onboarding/StateTaxForm';
import {
  TemplateBlock,
  EMPTY_TEMPLATE_STATE,
  computeTemplateValidity,
  type DocumentTemplateRow,
  type TemplateState,
} from '@/components/onboarding/DocumentSignatureStep';
import { generateSignedPdf } from '@/lib/onboarding/generateSignedPdf';
import { generateFormPdf, type FormPdfSection } from '@/lib/onboarding/generateFormPdf';
import { fullAccount, fullSsn, fullTin, maskTail } from '@/lib/onboarding/mask';
import { stateHasIncomeTax } from '@/lib/us-states';
import { cn } from '@/lib/utils';

/**
 * Onboarding for everyone who is not a driver: dispatchers, safety, payroll, shop staff, office.
 * Step 1 contact details, step 2 W-4, I-9, direct deposit and state tax, step 3 the documents the company
 * has set up for staff. Staff are W-2 employees or 1099 contractors, as the office set. Nothing is marked complete until the forms are on file.
 */

interface StaffRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  employment_type: 'w2' | '1099';
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
}

interface ProfileForm {
  phone: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
}

const EMPTY_PROFILE: ProfileForm = { phone: '', address: '', emergencyName: '', emergencyPhone: '', emergencyRelationship: '' };
const digits = (v: string) => v.replace(/\D/g, '');
const profileValid = (p: ProfileForm) =>
  digits(p.phone).length >= 10 && p.address.trim().length > 4 && p.emergencyName.trim().length > 0 && digits(p.emergencyPhone).length >= 10;

const STEPS = ['Your details', 'Tax forms', 'Documents'] as const;

export default function StaffOnboarding() {
  const { user, orgId, orgName, refreshOrgData, onboardingCompleted, requiresOnboarding } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [w2Docs, setW2Docs] = useState<W2DocsState>(EMPTY_W2_DOCS_STATE);
  const [w2Valid, setW2Valid] = useState(false);
  const [contractorDocs, setContractorDocs] = useState<ContractorDocsState>(EMPTY_CONTRACTOR_DOCS_STATE);
  const [contractorValid, setContractorValid] = useState(false);
  const [stateTax, setStateTax] = useState<StateTaxFormState>(EMPTY_STATE_TAX_FORM);
  const [stateTaxValid, setStateTaxValid] = useState(false);
  const [tState, setTState] = useState<Record<string, TemplateState>>({});

  // Anyone who finished (or never needed onboarding) has nothing to do here.
  useEffect(() => {
    if (onboardingCompleted || !requiresOnboarding) navigate('/', { replace: true });
  }, [onboardingCompleted, requiresOnboarding, navigate]);

  // The staff record. People invited before staff onboarding existed get theirs on first visit.
  const { data: staff, isLoading: staffLoading, error: staffError } = useQuery({
    queryKey: ['staff-onboarding/record', user?.id],
    enabled: !!user?.id && !!orgId,
    queryFn: async (): Promise<StaffRecord> => {
      const select = 'id, first_name, last_name, email, employment_type, phone, address, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship';
      const find = async () =>
        (await supabase.from('employees' as never).select(select).eq('user_id', user!.id).is('archived_at', null).maybeSingle()) as unknown as {
          data: StaffRecord | null;
          error: { message: string } | null;
        };
      let res = await find();
      if (res.error) throw new Error(res.error.message);
      if (!res.data) {
        const { error } = await supabase.rpc('ensure_my_employee' as never);
        if (error) throw new Error(error.message);
        res = await find();
        if (res.error) throw new Error(res.error.message);
      }
      if (!res.data) throw new Error('Your staff record could not be created.');
      return res.data;
    },
  });

  useEffect(() => {
    if (!staff) return;
    setProfile((p) => ({
      phone: p.phone || staff.phone || '',
      address: p.address || staff.address || '',
      emergencyName: p.emergencyName || staff.emergency_contact_name || '',
      emergencyPhone: p.emergencyPhone || staff.emergency_contact_phone || '',
      emergencyRelationship: p.emergencyRelationship || staff.emergency_contact_relationship || '',
    }));
  }, [staff]);

  // The company's staff documents (audience "staff").
  const { data: templates = [] } = useQuery({
    queryKey: ['staff-onboarding/templates', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<DocumentTemplateRow[]> => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, document_type, name, content, applies_to')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .eq('applies_to', 'staff' as never)
        .order('document_type');
      if (error) throw error;
      // The shared signing block groups by audience; staff documents are all signed by everyone, so call them shared.
      return ((data ?? []) as unknown as DocumentTemplateRow[]).map((t) => ({ ...t, applies_to: 'shared' as const }));
    },
  });

  // What the office has set up for this person: their position and pay package, shown so they know what to expect.
  const { data: setup } = useQuery({
    queryKey: ['staff-onboarding/setup', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [pos, pay] = await Promise.all([
        supabase.from('position_assignments').select('positions(name)').eq('user_id', user!.id).lte('effective_start', today).order('effective_start', { ascending: false }).limit(1),
        supabase.from('driver_pay_package_assignments').select('pay_packages(name)').eq('user_id', user!.id).lte('effective_start', today).order('effective_start', { ascending: false }).limit(1),
      ]);
      const first = <T,>(r: { data: unknown[] | null }) => (r.data?.[0] ?? null) as T | null;
      return {
        position: first<{ positions: { name: string } | null }>(pos)?.positions?.name ?? null,
        payPackage: first<{ pay_packages: { name: string } | null }>(pay)?.pay_packages?.name ?? null,
      };
    },
  });

  const isContractor = staff?.employment_type === '1099';
  const staffName = `${staff?.first_name ?? ''} ${staff?.last_name ?? ''}`.trim() || user?.email || 'Employee';
  const templatesValid = templates.every((t) => computeTemplateValidity(t, tState[t.id] ?? EMPTY_TEMPLATE_STATE));
  const formsValid = (isContractor ? contractorValid : w2Valid) && stateTaxValid;
  const stepValid = [profileValid(profile), formsValid, templatesValid][step];
  const lastStep = STEPS.length - 1;

  const patchTemplate = (id: string, patch: Partial<TemplateState>) =>
    setTState((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_TEMPLATE_STATE), ...patch } }));

  const submit = async () => {
    if (!staff || !orgId) return;
    setSubmitting(true);
    try {
      const employeeId = staff.id;
      const base = `${orgId}/staff/${employeeId}`;

      // 1. Details and forms into the database (encrypted where sensitive).
      const rpc = async (name: string, args: Record<string, unknown>, what: string) => {
        const { error } = await supabase.rpc(name as never, args as never);
        if (error) throw new Error(`Couldn't save ${what}: ${error.message}`);
      };
      await rpc('save_my_employee_profile', {
        _phone: profile.phone, _address: profile.address, _emergency_name: profile.emergencyName,
        _emergency_phone: profile.emergencyPhone, _emergency_relationship: profile.emergencyRelationship,
      }, 'your details');
      if (isContractor) {
      await rpc('upsert_employee_w9', {
        _employee_id: employeeId, _legal_name: contractorDocs.w9_legalName, _business_name: contractorDocs.w9_businessName,
        _tax_class: contractorDocs.w9_taxClass, _address: contractorDocs.w9_address, _tin_type: contractorDocs.w9_tinType,
        _tin: contractorDocs.w9_tin, _certify_accurate: contractorDocs.w9_certifyAccurate,
        _certify_backup_withholding: contractorDocs.w9_certifyBackupWithholding,
      }, 'your W-9');
      } else {
        await rpc('upsert_employee_w4', {
          _employee_id: employeeId, _filing_status: w2Docs.w4_filingStatus, _multiple_jobs: !!w2Docs.w4_multipleJobs,
          _dependents_amount: Number(w2Docs.w4_dependentsAmount || 0), _other_income: Number(w2Docs.w4_otherIncome || 0),
          _deductions: Number(w2Docs.w4_deductions || 0), _extra_withholding: Number(w2Docs.w4_extraWithholding || 0),
          _step_2c_checkbox: !!w2Docs.w4_multipleJobs,
        }, 'your W-4');
        await rpc('upsert_employee_i9', {
          _employee_id: employeeId, _full_name: w2Docs.i9_fullName, _other_last_names: w2Docs.i9_otherLastNames,
          _address: w2Docs.i9_address, _dob: w2Docs.i9_dob, _ssn: w2Docs.i9_ssn, _email: w2Docs.i9_email, _phone: w2Docs.i9_phone,
          _citizenship: w2Docs.i9_citizenship, _alien_number: w2Docs.i9_alienNumber,
          _work_auth_expiry: w2Docs.i9_workAuthExpiry || null, _work_auth_doc_number: w2Docs.i9_workAuthDocNumber,
        }, 'your I-9');
        await rpc('upsert_employee_banking', {
          _employee_id: employeeId, _bank_name: w2Docs.dd_bankName, _account_type: w2Docs.dd_accountType || '',
          _routing_number: w2Docs.dd_routingNumber, _account_number: w2Docs.dd_accountNumber,
        }, 'your direct deposit details');
      }
      const residenceHasSit = stateHasIncomeTax(stateTax.residenceState);
      await rpc('upsert_employee_state_tax', {
        _employee_id: employeeId, _work_state: stateTax.workState, _residence_state: stateTax.residenceState,
        _filing_status: residenceHasSit ? (stateTax.filingStatus || 'single') : 'single',
        _allowances: Number(stateTax.allowances || 0), _additional_withholding: Number(stateTax.additionalWithholding || 0),
        _exempt: !!stateTax.exempt,
      }, 'your state tax form');

      // 2. The signed paperwork as PDFs: a masked copy, and an unmasked payroll copy where there is sensitive data.
      const upload = async (docType: string, label: string, blob: Blob, adminBlob: Blob | null, templateId: string | null, extra: { address?: string; signature?: string | null } = {}) => {
        const ts = Date.now();
        const safe = docType.replace(/[^a-z0-9_-]/gi, '_');
        const filePath = `${base}/${safe}-${ts}.pdf`;
        const { error: upErr } = await supabase.storage.from('signed-documents').upload(filePath, blob, { contentType: 'application/pdf', upsert: false });
        if (upErr) throw new Error(`Couldn't upload ${label}: ${upErr.message}`);
        let adminPath: string | null = null;
        if (adminBlob) {
          adminPath = `${base}/${safe}-${ts}.full.pdf`;
          const { error: adminErr } = await supabase.storage.from('signed-documents').upload(adminPath, adminBlob, { contentType: 'application/pdf', upsert: false });
          if (adminErr) throw new Error(`Couldn't upload the payroll copy of ${label}: ${adminErr.message}`);
        }
        const { error: insErr } = await supabase.from('employee_signed_documents' as never).insert({
          org_id: orgId, employee_id: employeeId, template_id: templateId, document_type: docType, file_path: filePath,
          admin_file_path: adminPath, address: extra.address || null, signature_data_url: extra.signature ?? null,
        } as never);
        if (insErr) throw new Error(`Couldn't record ${label}: ${insErr.message}`);
      };

      const sub = 'Signed electronically as part of staff onboarding.';
      if (isContractor) {
      const w9Fields = [
        { label: 'Legal name', value: contractorDocs.w9_legalName }, { label: 'Business name', value: contractorDocs.w9_businessName || '—' },
        { label: 'Tax classification', value: contractorDocs.w9_taxClass }, { label: 'Address', value: contractorDocs.w9_address },
        { label: 'TIN type', value: contractorDocs.w9_tinType.toUpperCase() },
      ];
      const w9Notes = ['The contractor certifies, under penalty of perjury, that the TIN provided is correct and that they are not subject to backup withholding.'];
      await upload('w9', 'Form W-9', generateFormPdf({ title: 'Form W-9 — Request for Taxpayer Identification', subtitle: 'Signed electronically as part of contractor onboarding.', driverName: staffName, sections: [{ heading: 'Contractor Information', fields: [...w9Fields, { label: 'TIN', value: maskTail(contractorDocs.w9_tin) }], notes: w9Notes }], signatureLabel: 'Contractor signature', signature: contractorDocs.w9_signature }),
        generateFormPdf({ title: 'Form W-9 — Request for Taxpayer Identification (Payroll Copy)', subtitle: 'Unmasked copy for 1099 filing and tax reporting use only.', driverName: staffName, sections: [{ heading: 'Contractor Information', fields: [...w9Fields, { label: 'TIN', value: fullTin(contractorDocs.w9_tin, contractorDocs.w9_tinType) }], notes: w9Notes }], signatureLabel: 'Contractor signature', signature: contractorDocs.w9_signature }), null);
      } else {
        const w4: FormPdfSection[] = [
          { heading: 'Employee Information', fields: [
            { label: 'Full legal name', value: w2Docs.w4_fullName }, { label: 'Social Security Number', value: maskTail(w2Docs.w4_ssn) },
            { label: 'Home address', value: w2Docs.w4_address }, { label: 'Filing status', value: w2Docs.w4_filingStatus } ] },
          { heading: 'Adjustments', fields: [
            { label: 'Step 2(c) multiple jobs', value: w2Docs.w4_multipleJobs ? 'Yes' : 'No' }, { label: 'Dependents amount', value: `$${w2Docs.w4_dependentsAmount || '0'}` },
            { label: 'Other income', value: `$${w2Docs.w4_otherIncome || '0'}` }, { label: 'Deductions', value: `$${w2Docs.w4_deductions || '0'}` },
            { label: 'Extra withholding', value: `$${w2Docs.w4_extraWithholding || '0'}` } ] },
        ];
        const unmask = (sections: FormPdfSection[], label: string, value: string): FormPdfSection[] =>
          sections.map((s) => ({ ...s, fields: s.fields.map((f) => (f.label === label ? { ...f, value } : f)) }));
        await upload('w4', 'Federal W-4', generateFormPdf({ title: 'Form W-4 — Employee Withholding Certificate', subtitle: sub, driverName: staffName, sections: w4, signatureLabel: 'Employee signature', signature: w2Docs.w4_signature }),
          generateFormPdf({ title: 'Form W-4 — Employee Withholding Certificate (Payroll Copy)', subtitle: 'Unmasked copy for payroll and tax filing use only.', driverName: staffName, sections: unmask(w4, 'Social Security Number', fullSsn(w2Docs.w4_ssn)), signatureLabel: 'Employee signature', signature: w2Docs.w4_signature }), null);
  
        const i9: FormPdfSection[] = [{ heading: 'Section 1 — Employee Information', fields: [
          { label: 'Full legal name', value: w2Docs.i9_fullName }, { label: 'Other last names used', value: w2Docs.i9_otherLastNames || '—' }, { label: 'Address', value: w2Docs.i9_address },
          { label: 'Date of birth', value: w2Docs.i9_dob }, { label: 'SSN', value: maskTail(w2Docs.i9_ssn) }, { label: 'Email', value: w2Docs.i9_email }, { label: 'Phone', value: w2Docs.i9_phone },
          { label: 'Citizenship / status', value: w2Docs.i9_citizenship }, { label: 'Alien / USCIS number', value: w2Docs.i9_alienNumber || '—' },
          { label: 'Work authorization expiry', value: w2Docs.i9_workAuthExpiry || '—' }, { label: 'Work authorization doc #', value: w2Docs.i9_workAuthDocNumber || '—' } ],
          notes: ['The employee attests, under penalty of perjury, that the information provided is true and correct.'] }];
        await upload('i9', 'Form I-9', generateFormPdf({ title: 'Form I-9 — Employment Eligibility Verification', subtitle: 'Section 1 attestation completed by the employee.', driverName: staffName, sections: i9, signatureLabel: 'Employee signature', signature: w2Docs.i9_signature }),
          generateFormPdf({ title: 'Form I-9 — Employment Eligibility Verification (Payroll Copy)', subtitle: 'Unmasked copy for payroll and tax filing use only.', driverName: staffName, sections: unmask(i9, 'SSN', fullSsn(w2Docs.i9_ssn)), signatureLabel: 'Employee signature', signature: w2Docs.i9_signature }), null);
  
        const lastFour = (v: string) => { const d = digits(v); return d.length >= 4 ? `****${d.slice(-4)}` : '—'; };
        const dd: FormPdfSection[] = [{ heading: 'Banking Details', fields: [
          { label: 'Bank name', value: w2Docs.dd_bankName }, { label: 'Account type', value: w2Docs.dd_accountType }, { label: 'Routing number', value: w2Docs.dd_routingNumber },
          { label: 'Account number', value: lastFour(w2Docs.dd_accountNumber) } ],
          notes: ['Employee authorizes the employer to initiate direct deposits into the account listed above.'] }];
        await upload('direct_deposit_form', 'Direct Deposit Authorization', generateFormPdf({ title: 'Direct Deposit Authorization', driverName: staffName, sections: dd, signatureLabel: 'Employee signature', signature: w2Docs.dd_signature }),
          generateFormPdf({ title: 'Direct Deposit Authorization (Payroll Copy)', subtitle: 'Unmasked copy for payroll and ACH setup use only.', driverName: staffName, sections: unmask(dd, 'Account number', fullAccount(w2Docs.dd_accountNumber)), signatureLabel: 'Employee signature', signature: w2Docs.dd_signature }), null);
      }

      const st: FormPdfSection[] = [{ heading: 'Jurisdictions', fields: [{ label: 'Work state (SUTA)', value: stateTax.workState }, { label: 'State of residence', value: stateTax.residenceState }] }];
      st.push(isContractor
        ? { heading: '1099 Contractor Note', fields: [{ label: 'Withholding', value: 'Not applicable — contractors are not subject to state tax withholding by the payer.' }] }
        : residenceHasSit
        ? { heading: 'State Income Tax Withholding', fields: [
            { label: 'Claiming exempt', value: stateTax.exempt ? 'Yes' : 'No' }, { label: 'Filing status', value: stateTax.exempt ? '—' : (stateTax.filingStatus || '—') },
            { label: 'Allowances', value: stateTax.exempt ? '—' : (stateTax.allowances || '0') }, { label: 'Additional withholding per pay period', value: stateTax.exempt ? '—' : `$${stateTax.additionalWithholding || '0'}` } ],
            notes: ['Employee certifies, under penalty of perjury, that the information provided is accurate and will notify the employer of any change.'] }
        : { heading: 'State Income Tax Withholding', fields: [{ label: 'State income tax', value: `${stateTax.residenceState.toUpperCase()} has no state income tax — no withholding elections required.` }] });
      await upload('state_tax', 'State Tax Withholding', generateFormPdf({ title: 'State Tax Withholding Election', subtitle: sub, driverName: staffName, sections: st, signatureLabel: 'Employee signature', signature: stateTax.signature }), null, null);

      // 3. The company's own staff documents.
      for (const t of templates) {
        const s = tState[t.id] ?? EMPTY_TEMPLATE_STATE;
        const args = {
          title: t.name ?? t.document_type, content: t.content, driverAddress: s.driverAddress, signature: s.signature, driverName: staffName,
          cdlNumber: '', ssn: s.ssn, email: s.email, bankName: s.bankName, routingNumber: s.routingNumber, accountNumber: s.accountNumber, bankAccountType: s.bankAccountType,
        };
        const sensitive = !!(s.ssn || s.accountNumber);
        await upload(t.document_type, t.name ?? t.document_type, generateSignedPdf({ ...args, redact: true }), sensitive ? generateSignedPdf({ ...args, redact: false }) : null, t.id, { address: s.driverAddress, signature: s.signature });
      }

      // 4. Only now, with the forms really on file, is onboarding complete.
      const { error: doneErr } = await supabase.rpc('complete_my_staff_onboarding' as never);
      if (doneErr) throw new Error(doneErr.message);

      await refreshOrgData();
      await queryClient.invalidateQueries({ queryKey: ['staff-onboarding'] });
      toast.success('Onboarding complete. Welcome aboard.');
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong. Nothing was lost. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (staffLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (staffError || !staff) {
    return (
      <div className="mx-auto max-w-xl p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>We couldn't open your onboarding</AlertTitle>
          <AlertDescription>{(staffError as Error | null)?.message ?? 'Please ask the office to check your invitation.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-24 sm:p-6">
      <header>
        <h1 className="font-condensed text-[28px] font-bold leading-tight sm:text-[32px]">Welcome{staff.first_name ? `, ${staff.first_name}` : ''}</h1>
        <p className="mt-0.5 text-[15px] text-muted-foreground">
          Finish your onboarding for {orgName ?? 'the company'}.
          {setup?.position && <> Your position: <span className="font-medium text-foreground">{setup.position}</span>.</>}
          {setup?.payPackage && <> Pay: <span className="font-medium text-foreground">{setup.payPackage}</span>.</>}
        </p>
      </header>

      <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className={cn('flex min-h-11 items-center gap-2 bg-card px-3 py-2 text-sm', i === step ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold', i < step ? 'bg-success text-success-foreground' : i === step ? 'bg-carbon text-carbon-foreground' : 'bg-muted')}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>So the company can reach you and your emergency contact if needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="so-phone">Mobile phone</Label><Input id="so-phone" type="tel" inputMode="tel" autoComplete="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 123-4567" /></div>
              <div className="space-y-1.5"><Label htmlFor="so-address">Home address</Label><Input id="so-address" autoComplete="street-address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} placeholder="Street, city, state, ZIP" /></div>
            </div>
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-semibold">Emergency contact</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="so-ec-name">Name</Label><Input id="so-ec-name" value={profile.emergencyName} onChange={(e) => setProfile({ ...profile, emergencyName: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="so-ec-phone">Phone</Label><Input id="so-ec-phone" type="tel" inputMode="tel" value={profile.emergencyPhone} onChange={(e) => setProfile({ ...profile, emergencyPhone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="so-ec-rel">Relationship</Label><Input id="so-ec-rel" value={profile.emergencyRelationship} onChange={(e) => setProfile({ ...profile, emergencyRelationship: e.target.value })} placeholder="Spouse, parent…" /></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <div className="space-y-5">
          {isContractor ? (
            <ContractorDocuments value={contractorDocs} onChange={(patch) => setContractorDocs((c) => ({ ...c, ...patch }))} onValidityChange={setContractorValid} showAgreement={false} />
          ) : (
            <W2Documents value={w2Docs} onChange={(patch) => setW2Docs((d) => ({ ...d, ...patch }))} onValidityChange={setW2Valid} />
          )}
          <StateTaxForm value={stateTax} onChange={(patch) => setStateTax((t) => ({ ...t, ...patch }))} onValidityChange={setStateTaxValid} audience={isContractor ? '1099' : 'w2'} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">There are no extra documents to sign. You're ready to finish.</CardContent></Card>
          ) : (
            templates.map((t) => (
              <TemplateBlock key={t.id} template={t} tState={tState[t.id] ?? EMPTY_TEMPLATE_STATE} onPatch={(patch) => patchTemplate(t.id, patch)} driverRow={{ first_name: staff.first_name, last_name: staff.last_name, phone: profile.phone }} employmentType={isContractor ? '1099' : 'W-2'} revisionNote={null} />
            ))
          )}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button type="button" variant="outline" className="h-11" disabled={step === 0 || submitting} onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
          {step < lastStep ? (
            <Button type="button" className="h-11" disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>
              Next<ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" className="h-11" disabled={!stepValid || submitting} onClick={submit}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {submitting ? 'Submitting…' : 'Submit and finish'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
