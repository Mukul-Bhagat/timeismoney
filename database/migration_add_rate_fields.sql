-- Migration: Add Rate Fields to Roles and Users
-- Run this SQL in your Supabase SQL Editor
-- This migration adds default_rate_per_hour to roles and rate_per_hour to users

-- Step 1: Add default_rate_per_hour to roles table
ALTER TABLE roles 
ADD COLUMN IF NOT EXISTS default_rate_per_hour DECIMAL(10,2);

-- Step 2: Add rate_per_hour to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS rate_per_hour DECIMAL(10,2);

-- Step 3: Add check constraints to ensure rates are non-negative
-- Note: PostgreSQL doesn't support IF NOT EXISTS with ADD CONSTRAINT, so we use DO blocks

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_roles_rate_non_negative'
    ) THEN
        ALTER TABLE roles 
        ADD CONSTRAINT check_roles_rate_non_negative 
        CHECK (default_rate_per_hour IS NULL OR default_rate_per_hour >= 0);
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_users_rate_non_negative'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT check_users_rate_non_negative 
        CHECK (rate_per_hour IS NULL OR rate_per_hour >= 0);
    END IF;
END $$;

-- Step 4: Create indexes for performance (if needed for lookups)
CREATE INDEX IF NOT EXISTS idx_roles_default_rate ON roles(default_rate_per_hour) 
WHERE default_rate_per_hour IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_rate ON users(rate_per_hour) 
WHERE rate_per_hour IS NOT NULL;

-- Migration complete
-- Both fields are nullable (optional)
-- Rates can be set at role level (default) or user level (overrides role default)

