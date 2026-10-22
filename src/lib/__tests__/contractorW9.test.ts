import { describe, expect, it } from 'vitest';
import { EMPTY_CONTRACTOR_DOCS_STATE, isContractorDocsValid, type ContractorDocsState } from '@/components/onboarding/ContractorDocuments';

const w9Done: ContractorDocsState = {
  ...EMPTY_CONTRACTOR_DOCS_STATE,
  w9_legalName: 'Pat Example',
  w9_taxClass: 'individual' as ContractorDocsState['w9_taxClass'],
  w9_address: '1 Main St, Fort Worth, TX 76155',
  w9_tinType: 'ssn',
  w9_tin: '123-45-6789',
  w9_certifyAccurate: true,
  w9_certifyBackupWithholding: true,
  w9_signature: 'data:image/png;base64,AAAA',
};

describe('contractor forms for staff (W-9 only)', () => {
  it('a finished W-9 is enough when the owner-operator agreement is not asked for', () => {
    expect(isContractorDocsValid(w9Done, false)).toBe(true);
  });

  it('drivers still need the agreement as well, so a W-9 alone is not valid for them', () => {
    expect(isContractorDocsValid(w9Done)).toBe(false);
  });

  it('an unsigned or incomplete W-9 is never valid', () => {
    expect(isContractorDocsValid({ ...w9Done, w9_signature: null }, false)).toBe(false);
    expect(isContractorDocsValid({ ...w9Done, w9_tin: '12345' }, false)).toBe(false);
    expect(isContractorDocsValid(EMPTY_CONTRACTOR_DOCS_STATE, false)).toBe(false);
  });
});
