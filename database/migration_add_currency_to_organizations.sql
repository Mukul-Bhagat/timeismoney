-- Migration: Add Currency Support to Organizations
-- Run this SQL in your Supabase SQL Editor
-- This migration adds currency_code and currency_symbol columns to organizations table

-- Step 1: Add currency columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(5) DEFAULT '₹';

-- Step 2: Update existing organizations to have INR as default
UPDATE organizations 
SET 
  currency_code = 'INR',
  currency_symbol = '₹'
WHERE currency_code IS NULL OR currency_symbol IS NULL;

-- Step 3: Add constraint to ensure currency_code is not null
ALTER TABLE organizations 
ALTER COLUMN currency_code SET NOT NULL,
ALTER COLUMN currency_symbol SET NOT NULL;

-- Step 4: Create index for performance (if needed for lookups)
CREATE INDEX IF NOT EXISTS idx_organizations_currency_code ON organizations(currency_code);

-- Migration complete
-- All existing organizations now have currency_code='INR' and currency_symbol='₹'
-- New organizations will default to INR unless specified otherwise

