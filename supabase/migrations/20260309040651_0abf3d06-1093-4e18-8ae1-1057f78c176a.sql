-- Add auto_email_updates column to fleet_loads table
ALTER TABLE public.fleet_loads
  ADD COLUMN IF NOT EXISTS auto_email_updates boolean NOT NULL DEFAULT true;