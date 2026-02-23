ALTER TABLE settlements
  ADD COLUMN lcn_satellite_fees numeric DEFAULT 0,
  ADD COLUMN prepass_scale_fees numeric DEFAULT 0,
  ADD COLUMN insurance_liability numeric DEFAULT 0,
  ADD COLUMN trailer_rental numeric DEFAULT 0,
  ADD COLUMN plates_permits numeric DEFAULT 0,
  ADD COLUMN cpp_benefits numeric DEFAULT 0;