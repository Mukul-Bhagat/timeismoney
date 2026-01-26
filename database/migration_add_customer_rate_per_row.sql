-- Migration: Add Customer Rate Per Row
-- This migration adds customer_rate_per_hour column to project_role_allocations
-- to support per-row customer pricing instead of global customer rate

-- Step 1: Add customer_rate_per_hour column to project_role_allocations
ALTER TABLE project_role_allocations 
ADD COLUMN IF NOT EXISTS customer_rate_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0 
CHECK (customer_rate_per_hour >= 0);

-- Step 2: Migrate existing data: copy global rate from project_setups to all allocations
-- This ensures existing projects have customer rates populated
UPDATE project_role_allocations pra
SET customer_rate_per_hour = COALESCE(
  (SELECT customer_rate_per_hour FROM project_setups ps WHERE ps.project_id = pra.project_id),
  0
)
WHERE customer_rate_per_hour = 0;  -- Only update rows that still have default 0

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_project_role_allocations_customer_rate 
ON project_role_allocations(project_id, customer_rate_per_hour);

-- Step 4: Add comment for documentation
COMMENT ON COLUMN project_role_allocations.customer_rate_per_hour IS 
'Customer billing rate per hour for this specific allocation. Allows per-resource pricing flexibility.';

