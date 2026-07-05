import { format } from 'date-fns';
import { invokeWithAuth } from '@/lib/invoke-with-auth';

/**
 * Client-side service for the Gusto company-setup endpoints.
 *
 * All calls go through the `run-w2-payroll` edge function so Gusto bearer
 * tokens stay server-side (minted from GUSTO_CLIENT_ID / GUSTO_CLIENT_SECRET
 * in the backend environment). This file never handles a bearer token.
 */

export interface GustoApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function callAction<T = unknown>(
  action: string,
  payload: Record<string, unknown>,
): Promise<GustoApiResult<T>> {
  const { data, error } = await invokeWithAuth<T>('run-w2-payroll', {
    body: { action, payload },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? undefined) as T };
}

// -------- Signatory ---------------------------------------------------------

export interface SignatoryHomeAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface SignatoryInput {
  firstName: string;
  lastName: string;
  title: string;
  dateOfBirth: Date;
  ssn: string;
  phone: string;
  email: string;
  homeAddress: SignatoryHomeAddress;
}

export function upsertSignatory(input: SignatoryInput) {
  return callAction('upsert_signatory', {
    first_name: input.firstName,
    last_name: input.lastName,
    title: input.title,
    birthday: format(input.dateOfBirth, 'yyyy-MM-dd'),
    ssn: input.ssn,
    phone: input.phone,
    email: input.email,
    home_address: {
      street_1: input.homeAddress.street1,
      street_2: input.homeAddress.street2 || undefined,
      city: input.homeAddress.city,
      state: input.homeAddress.state,
      zip: input.homeAddress.zip,
    },
  });
}

// -------- Company primary location + industry -------------------------------

export interface CompanyLocationInput {
  legalName: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  industryCode?: string;
  phoneNumber?: string;
}

export function upsertPrimaryLocation(input: CompanyLocationInput) {
  return callAction('upsert_primary_location', {
    legal_name: input.legalName,
    street_1: input.street1,
    street_2: input.street2 || undefined,
    city: input.city,
    state: input.state,
    zip: input.zip,
    phone_number: input.phoneNumber || undefined,
    naics_code: input.industryCode && input.industryCode !== 'OTHER'
      ? input.industryCode
      : undefined,
  });
}

// -------- Bank account ------------------------------------------------------

export interface BankAccountInput {
  accountHolder: string;
  accountType: 'checking' | 'savings';
  routingNumber: string;
  accountNumber: string;
}

export function createBankAccount(input: BankAccountInput) {
  return callAction('create_bank_account', {
    account_holder_name: input.accountHolder,
    account_type: input.accountType,
    routing_number: input.routingNumber,
    account_number: input.accountNumber,
  });
}

// -------- Federal tax details ----------------------------------------------

export interface FederalTaxInput {
  ein: string;
  legalName?: string;
  filingForm?: string;
  taxableAsScorp?: boolean;
}

export function upsertFederalTaxDetails(input: FederalTaxInput) {
  return callAction('upsert_federal_tax_details', {
    ein: input.ein,
    legal_name: input.legalName,
    filing_form: input.filingForm ?? '941',
    taxable_as_scorp: input.taxableAsScorp ?? false,
  });
}

// -------- State tax details -------------------------------------------------

export interface StateTaxInput {
  state: string;
  withholdingAccountId: string;
  suiAccountId: string;
  suiRate: number;
}

export function upsertStateTaxes(input: { states: StateTaxInput[] }) {
  return callAction('upsert_state_taxes', {
    states: input.states.map((s) => ({
      state: s.state,
      withholding_account_id: s.withholdingAccountId,
      sui_account_id: s.suiAccountId,
      sui_rate: s.suiRate,
    })),
  });
}

// -------- Bank account verification ----------------------------------------

export interface VerifyBankAccountInput {
  deposit1: number;
  deposit2: number;
  bankAccountUuid?: string;
}

export function verifyBankAccount(input: VerifyBankAccountInput) {
  return callAction('verify_bank_account', {
    deposit_1: input.deposit1,
    deposit_2: input.deposit2,
    bank_account_uuid: input.bankAccountUuid,
  });
}
