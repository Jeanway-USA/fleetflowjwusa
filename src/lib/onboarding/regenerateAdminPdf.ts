import { supabase } from '@/integrations/supabase/client';
import { generateFormPdf, type FormPdfSection } from './generateFormPdf';
import { fullAccount, fullSsn, fullTin } from './mask';

export type RegenerableDocumentType =
  | 'w4'
  | 'i9'
  | 'w9'
  | 'direct_deposit'
  | 'direct_deposit_form';

const filingStatusLabel: Record<string, string> = {
  single: 'Single or married filing separately',
  married: 'Married filing jointly',
  head: 'Head of household',
};

export async function regenerateAdminPdf(
  driverId: string,
  documentType: string,
): Promise<{ blob: Blob; filename: string } | null> {
  // Driver identity
  const { data: driver, error: driverErr } = await supabase
    .from('drivers')
    .select('id, first_name, last_name')
    .eq('id', driverId)
    .maybeSingle();
  if (driverErr) throw driverErr;
  if (!driver) throw new Error('Driver not found.');
  const driverName = `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() || 'Driver';

  switch (documentType) {
    case 'w4': {
      const [{ data: w4, error: w4Err }, { data: ssn, error: ssnErr }, { data: i9 }] =
        await Promise.all([
          supabase
            .from('driver_w4_info')
            .select('filing_status, multiple_jobs, dependents_amount, other_income, deductions, extra_withholding')
            .eq('driver_id', driverId)
            .maybeSingle(),
          supabase.rpc('get_driver_ssn' as never, { _driver_id: driverId } as never),
          supabase
            .from('driver_i9_info')
            .select('full_name, address')
            .eq('driver_id', driverId)
            .maybeSingle(),
        ]);
      if (w4Err) throw w4Err;
      if (ssnErr) throw ssnErr;
      if (!w4) throw new Error('No W-4 data on file for this driver yet.');
      const sections: FormPdfSection[] = [
        {
          heading: 'Employee Information',
          fields: [
            { label: 'Full legal name', value: i9?.full_name || driverName },
            { label: 'Social Security Number', value: fullSsn((ssn as string | null) ?? '') },
            { label: 'Home address', value: i9?.address || '—' },
            { label: 'Filing status', value: filingStatusLabel[w4.filing_status] ?? w4.filing_status },
          ],
        },
        {
          heading: 'Adjustments',
          fields: [
            { label: 'Step 2(c) multiple jobs', value: w4.multiple_jobs ? 'Yes' : 'No' },
            { label: 'Dependents amount', value: `$${w4.dependents_amount ?? 0}` },
            { label: 'Other income', value: `$${w4.other_income ?? 0}` },
            { label: 'Deductions', value: `$${w4.deductions ?? 0}` },
            { label: 'Extra withholding', value: `$${w4.extra_withholding ?? 0}` },
          ],
        },
      ];
      return {
        blob: generateFormPdf({
          title: 'Form W-4 — Employee Withholding Certificate (Payroll Copy)',
          subtitle: 'Regenerated unmasked copy for payroll and tax filing use only.',
          driverName,
          sections,
          signatureLabel: 'Employee signature',
          signature: null,
        }),
        filename: 'w4_full.pdf',
      };
    }
    case 'i9': {
      const [{ data: i9, error: i9Err }, { data: ssn, error: ssnErr }] = await Promise.all([
        supabase
          .from('driver_i9_info')
          .select(
            'full_name, other_last_names, address, dob, email, phone, citizenship, alien_number, work_auth_expiry, work_auth_doc_number',
          )
          .eq('driver_id', driverId)
          .maybeSingle(),
        supabase.rpc('get_driver_ssn' as never, { _driver_id: driverId } as never),
      ]);
      if (i9Err) throw i9Err;
      if (ssnErr) throw ssnErr;
      if (!i9) throw new Error('No I-9 data on file for this driver yet.');
      const sections: FormPdfSection[] = [
        {
          heading: 'Section 1 — Employee Information',
          fields: [
            { label: 'Full legal name', value: i9.full_name },
            { label: 'Other last names used', value: i9.other_last_names || '—' },
            { label: 'Address', value: i9.address },
            { label: 'Date of birth', value: i9.dob },
            { label: 'SSN', value: fullSsn((ssn as string | null) ?? '') },
            { label: 'Email', value: i9.email },
            { label: 'Phone', value: i9.phone },
            { label: 'Citizenship / status', value: i9.citizenship },
            { label: 'Alien / USCIS number', value: i9.alien_number || '—' },
            { label: 'Work authorization expiry', value: i9.work_auth_expiry || '—' },
            { label: 'Work authorization doc #', value: i9.work_auth_doc_number || '—' },
          ],
          notes: [
            'The employee attests, under penalty of perjury, that the information provided is true and correct.',
          ],
        },
      ];
      return {
        blob: generateFormPdf({
          title: 'Form I-9 — Employment Eligibility Verification (Payroll Copy)',
          subtitle: 'Regenerated unmasked copy for payroll and tax filing use only.',
          driverName,
          sections,
          signatureLabel: 'Employee signature',
          signature: null,
        }),
        filename: 'i9_full.pdf',
      };
    }
    case 'w9': {
      const [{ data: w9, error: w9Err }, { data: tinRows, error: tinErr }] = await Promise.all([
        supabase
          .from('driver_w9_info')
          .select('legal_name, business_name, tax_class, address, tin_type')
          .eq('driver_id', driverId)
          .maybeSingle(),
        supabase.rpc('get_driver_tin' as never, { _driver_id: driverId } as never),
      ]);
      if (w9Err) throw w9Err;
      if (tinErr) throw tinErr;
      if (!w9) throw new Error('No W-9 data on file for this driver yet.');
      const tinRow = Array.isArray(tinRows) && tinRows.length > 0 ? (tinRows[0] as { tin: string | null; tin_type: string | null }) : null;
      const sections: FormPdfSection[] = [
        {
          heading: 'Contractor Information',
          fields: [
            { label: 'Legal name', value: w9.legal_name },
            { label: 'Business name', value: w9.business_name || '—' },
            { label: 'Tax classification', value: w9.tax_class },
            { label: 'Address', value: w9.address },
            { label: 'TIN type', value: (w9.tin_type || '').toUpperCase() },
            { label: 'TIN', value: fullTin(tinRow?.tin ?? '', tinRow?.tin_type ?? w9.tin_type) },
          ],
          notes: [
            'The contractor certifies, under penalty of perjury, that the TIN provided is correct and that they are not subject to backup withholding.',
          ],
        },
      ];
      return {
        blob: generateFormPdf({
          title: 'Form W-9 — Request for Taxpayer Identification (Payroll Copy)',
          subtitle: 'Regenerated unmasked copy for 1099 filing and tax reporting use only.',
          driverName,
          sections,
          signatureLabel: 'Contractor signature',
          signature: null,
        }),
        filename: 'w9_full.pdf',
      };
    }
    case 'direct_deposit':
    case 'direct_deposit_form': {
      const { data, error } = await supabase.rpc('get_driver_banking', { _driver_id: driverId });
      if (error) throw error;
      const bank = Array.isArray(data) && data.length > 0 ? (data[0] as {
        bank_name: string | null;
        account_type: string | null;
        routing_number: string | null;
        account_number: string | null;
      }) : null;
      if (!bank) throw new Error('No banking info on file for this driver yet.');
      const sections: FormPdfSection[] = [
        {
          heading: 'Banking Details',
          fields: [
            { label: 'Bank name', value: bank.bank_name || '—' },
            { label: 'Account type', value: bank.account_type || '—' },
            { label: 'Routing number', value: bank.routing_number || '—' },
            { label: 'Account number', value: fullAccount(bank.account_number || '') },
          ],
          notes: [
            'Employee authorizes the employer to initiate direct deposits into the account listed above.',
          ],
        },
      ];
      return {
        blob: generateFormPdf({
          title: 'Direct Deposit Authorization (Payroll Copy)',
          subtitle: 'Regenerated unmasked copy for payroll and ACH setup use only.',
          driverName,
          sections,
          signatureLabel: 'Employee signature',
          signature: null,
        }),
        filename: 'direct_deposit_full.pdf',
      };
    }
    default:
      return null;
  }
}

export function isRegenerable(docType: string): docType is RegenerableDocumentType {
  return ['w4', 'i9', 'w9', 'direct_deposit', 'direct_deposit_form'].includes(docType);
}
