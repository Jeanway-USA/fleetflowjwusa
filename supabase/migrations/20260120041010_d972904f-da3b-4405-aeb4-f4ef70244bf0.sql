-- Add service_types array column to work_orders table
ALTER TABLE work_orders ADD COLUMN service_types text[] DEFAULT '{}';

-- Migrate existing single service_type values to the new array column
UPDATE work_orders SET service_types = ARRAY[service_type] WHERE service_type IS NOT NULL AND service_type != '';