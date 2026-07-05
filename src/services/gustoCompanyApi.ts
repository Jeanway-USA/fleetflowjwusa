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

// -------- Pay schedules -----------------------------------------------------

export type PayScheduleFrequency =
  | 'Every week'
  | 'Every other week'
  | 'Twice per month'
  | 'Monthly';

export interface CreatePayScheduleInput {
  frequency: PayScheduleFrequency;
  anchorPayDate: Date;
  anchorEndOfPayPeriod: Date;
  customName?: string;
}

export interface GustoPaySchedule {
  uuid: string;
  frequency: string;
  anchor_pay_date?: string;
  anchor_end_of_pay_period?: string;
  custom_name?: string | null;
}

export function createPaySchedule(input: CreatePayScheduleInput) {
  return callAction<{ ok: true; gusto: GustoPaySchedule }>('create_pay_schedule', {
    frequency: input.frequency,
    anchor_pay_date: format(input.anchorPayDate, 'yyyy-MM-dd'),
    anchor_end_of_pay_period: format(input.anchorEndOfPayPeriod, 'yyyy-MM-dd'),
    custom_name: input.customName || undefined,
  });
}

export interface AssignEmployeePayScheduleInput {
  employeeUuid: string;
  payScheduleUuid: string;
}

export function assignEmployeePaySchedule(input: AssignEmployeePayScheduleInput) {
  return callAction('assign_employee_pay_schedule', {
    employee_uuid: input.employeeUuid,
    pay_schedule_uuid: input.payScheduleUuid,
  });
}

// -------- Employee sync + onboarding status --------------------------------

export function syncEmployeeToGusto(driverId: string) {
  return callAction<{ gusto_employee_id: string | null; existed?: boolean }>(
    'sync_employee',
    { driver_id: driverId },
  );
}

export interface EmployeeOnboardingStatus {
  employee_uuid: string;
  onboarding_completed: boolean;
  w4_signed: boolean;
  i9_signed: boolean;
  error?: string;
}

export function getEmployeesOnboardingStatus(employeeUuids: string[]) {
  return callAction<{ statuses: EmployeeOnboardingStatus[] }>(
    'get_employees_onboarding_status',
    { employee_uuids: employeeUuids },
  );
}

export function sendEmployeeOnboardingInvite(driverId: string) {
  return callAction<{ sent: boolean; email: string | null }>(
    'send_employee_onboarding_invite',
    { driver_id: driverId },
  );
}

export function getEmployeeOnboardingLink(driverId: string) {
  return callAction<{ flow_url: string | null; expires_at: string | null }>(
    'get_employee_onboarding_link',
    { driver_id: driverId },
  );
}

// -------- Phase 2: onboarding steps, state tax reqs, bank, pay schedules ----

export interface GustoOnboardingStep {
  id?: string;
  step?: string;
  title?: string;
  completed?: boolean;
  required?: boolean;
  [k: string]: unknown;
}

export interface PayrollSetupStatus {
  federal_tax_status?: string | null;
  signatory_status?: string | null;
  state_tax_requirements?: Record<string, unknown> | null;
  bank_verification_status?: string | null;
  active_pay_schedule_uuid?: string | null;
  pay_schedule_frequency?: string | null;
}

export function syncOnboardingSteps() {
  return callAction<{
    onboarding_status: string | null;
    onboarding_steps: GustoOnboardingStep[];
    setup_status?: PayrollSetupStatus | null;
  }>('sync_onboarding_steps', {});
}

export function getPayrollSetupStatus() {
  return callAction<{ setup_status: PayrollSetupStatus | null }>(
    'get_payroll_setup_status',
    {},
  );
}

export function getStateTaxRequirements(state: string) {
  return callAction<{ state: string; requirements: Record<string, unknown> }>(
    'get_state_tax_requirements',
    { state },
  );
}

export function submitStateTaxRequirements(input: {
  state: string;
  requirementSets: unknown[];
}) {
  return callAction('submit_state_tax_requirements', {
    state: input.state,
    requirement_sets: input.requirementSets,
  });
}

export function createBankAccountFromPlaid(input: {
  plaidProcessorToken: string;
  accountHolderName?: string;
}) {
  return callAction('create_bank_account_from_plaid', {
    plaid_processor_token: input.plaidProcessorToken,
    account_holder_name: input.accountHolderName || undefined,
  });
}

export function initiateMicroDeposits(bankAccountUuid?: string) {
  return callAction<{ bank_account_uuid: string }>('initiate_micro_deposits', {
    bank_account_uuid: bankAccountUuid,
  });
}

export function listPaySchedules() {
  return callAction<{ pay_schedules: GustoPaySchedule[] }>('list_pay_schedules', {});
}

export function createEmployeeSelfOnboardingFlowToken(input: {
  driverId?: string;
  employeeUuid?: string;
}) {
  return callAction<{ flow_url: string | null; expires_at: string | null }>(
    'create_employee_self_onboarding_flow_token',
    {
      driver_id: input.driverId,
      employee_uuid: input.employeeUuid,
    },
  );
}

// -------- Read-side hydration ----------------------------------------------

export interface GustoLocation {
  uuid?: string;
  street_1?: string;
  street_2?: string | null;
  city?: string;
  state?: string;
  zip?: string;
  phone_number?: string;
  [k: string]: unknown;
}

export interface GustoCompanyInfo {
  legal_name: string | null;
  primary_location: GustoLocation | null;
  naics_code: string | null;
}

export function getCompany() {
  return callAction<GustoCompanyInfo>('get_company', {});
}

export interface GustoSignatory {
  uuid?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  home_address?: {
    street_1?: string;
    street_2?: string | null;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  [k: string]: unknown;
}

export function getSignatory() {
  return callAction<{ signatory: GustoSignatory | null }>('get_signatory', {});
}

export interface GustoFederalTaxDetails {
  ein?: string;
  legal_name?: string;
  filing_form?: string;
  taxable_as_scorp?: boolean;
  [k: string]: unknown;
}

export function getFederalTaxDetails() {
  return callAction<{ federal_tax_details: GustoFederalTaxDetails | null }>(
    'get_federal_tax_details',
    {},
  );
}

export interface GustoBankAccount {
  uuid?: string;
  hidden_account_number?: string;
  account_type?: string;
  name?: string;
  verification_status?: string;
  verification_type?: string;
  [k: string]: unknown;
}

export function listBankAccounts() {
  return callAction<{ bank_accounts: GustoBankAccount[] }>('list_bank_accounts', {});
}



