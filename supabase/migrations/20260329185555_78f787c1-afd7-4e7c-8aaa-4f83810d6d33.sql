
-- Add factoring columns to organizations
ALTER TABLE organizations ADD COLUMN factoring_enabled boolean DEFAULT false;
ALTER TABLE organizations ADD COLUMN factoring_fee_percentage numeric DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN factoring_remit_address text DEFAULT NULL;
ALTER TABLE organizations ADD COLUMN factoring_provider_name text DEFAULT NULL;

-- Add factoring columns to fleet_loads
ALTER TABLE fleet_loads ADD COLUMN factoring_status text DEFAULT NULL;
ALTER TABLE fleet_loads ADD COLUMN factoring_submission_id text DEFAULT NULL;

-- Update super_admin_organizations view to include factoring fields
DROP VIEW IF EXISTS super_admin_organizations;
CREATE OR REPLACE VIEW super_admin_organizations AS
SELECT
  o.id,
  o.name,
  o.subscription_tier,
  o.is_active,
  o.trial_ends_at,
  o.created_at,
  o.updated_at,
  o.primary_color,
  o.logo_url,
  o.banner_url,
  o.dot_number,
  o.mc_number,
  o.stripe_customer_id,
  o.stripe_subscription_id,
  o.subscription_status,
  o.tms_mode,
  o.is_complimentary,
  o.complimentary_ends_at,
  o.applied_promo_code_id,
  o.subscription_period_end,
  o.factoring_enabled,
  o.factoring_provider_name,
  (SELECT count(*) FROM profiles p WHERE p.org_id = o.id) AS user_count
FROM organizations o;
