/**
 * Shared formatters for onboarding PDFs. Never mask values — these produce
 * full unmasked strings for payroll / tax admin copies. Masked variants live
 * in the generators themselves (redact flag / maskTail helper).
 */

export const fullSsn = (v: string | null | undefined): string => {
  const d = (v || '').replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : (v || '—');
};

export const fullTin = (v: string | null | undefined, tinType: string | null | undefined): string => {
  const d = (v || '').replace(/\D/g, '');
  if (d.length !== 9) return v || '—';
  return (tinType || '').toLowerCase() === 'ein'
    ? `${d.slice(0, 2)}-${d.slice(2)}`
    : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
};

export const fullAccount = (v: string | null | undefined): string => {
  const d = (v || '').replace(/\D/g, '');
  return d.length > 0 ? d : '—';
};

export const maskTail = (v: string | null | undefined): string => {
  const digits = (v || '').replace(/\D/g, '');
  return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : '—';
};
