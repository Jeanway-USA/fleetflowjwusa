
-- Phase 1: Gusto W-2 payroll compliance schema upgrades

-- gusto_integration: cache onboarding + bank + pay schedule + tax status
ALTER TABLE public.gusto_integration
  ADD COLUMN IF NOT EXISTS onboarding_steps jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_steps_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_account_uuid text,
  ADD COLUMN IF NOT EXISTS bank_verification_status text,
  ADD COLUMN IF NOT EXISTS bank_verification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_pay_schedule_uuid text,
  ADD COLUMN IF NOT EXISTS pay_schedule_frequency text,
  ADD COLUMN IF NOT EXISTS federal_tax_status text,
  ADD COLUMN IF NOT EXISTS signatory_status text,
  ADD COLUMN IF NOT EXISTS state_tax_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_accepted_ip text;

ALTER TABLE public.gusto_integration
  DROP CONSTRAINT IF EXISTS gusto_integration_bank_verification_status_check;
ALTER TABLE public.gusto_integration
  ADD CONSTRAINT gusto_integration_bank_verification_status_check
  CHECK (bank_verification_status IS NULL OR bank_verification_status IN
    ('unverified','awaiting_deposits','verified','failed'));

-- drivers: work-state onboarding fields (tax_state and gusto_employee_id already exist)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS assigned_work_address_id text,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started';

-- Normalize tax_state to 2-char uppercase where present
UPDATE public.drivers
   SET tax_state = upper(substring(tax_state from 1 for 2))
 WHERE tax_state IS NOT NULL
   AND (length(tax_state) <> 2 OR tax_state <> upper(tax_state));
