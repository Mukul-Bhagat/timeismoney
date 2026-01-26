-- Migration: Update setup_status values from 'setup_done' to 'ready'
-- Run this SQL in your Supabase SQL Editor
-- This migration updates existing 'setup_done' values to 'ready' and sets default for null/undefined to 'draft'

-- Step 1: Drop existing check constraint (if it exists)
-- The constraint may be named 'projects_setup_status_check' or have an auto-generated name
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Try to drop by the known constraint name from error message
  BEGIN
    ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_setup_status_check;
    RAISE NOTICE 'Dropped constraint: projects_setup_status_check';
  EXCEPTION WHEN OTHERS THEN
    -- If that doesn't work, find and drop any constraint that checks setup_status
    FOR constraint_name IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'projects'::regclass
      AND contype = 'c'  -- 'c' = check constraint
      AND pg_get_constraintdef(oid) LIKE '%setup_status%'
    LOOP
      BEGIN
        EXECUTE 'ALTER TABLE projects DROP CONSTRAINT ' || quote_ident(constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_name;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not drop constraint %: %', constraint_name, SQLERRM;
      END;
    END LOOP;
  END;
END
$$;

-- Step 2: Update existing 'setup_done' values to 'ready'
UPDATE projects
SET setup_status = 'ready'
WHERE setup_status = 'setup_done';

-- Step 3: Set default 'draft' for any null or undefined values
UPDATE projects
SET setup_status = 'draft'
WHERE setup_status IS NULL OR setup_status = '';

-- Step 4: Add new check constraint to ensure only 'draft' or 'ready' values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'projects'::regclass
    AND conname = 'check_setup_status_values'
  ) THEN
    ALTER TABLE projects
    ADD CONSTRAINT check_setup_status_values
    CHECK (setup_status IN ('draft', 'ready'));
  END IF;
END
$$;

-- Step 5: Set default value for setup_status column (if not already set)
DO $$
BEGIN
  -- Check if default is already set
  IF NOT EXISTS (
    SELECT 1 FROM pg_attrdef 
    WHERE adrelid = 'projects'::regclass 
    AND adnum = (
      SELECT attnum FROM pg_attribute 
      WHERE attrelid = 'projects'::regclass 
      AND attname = 'setup_status'
    )
  ) THEN
    ALTER TABLE projects
    ALTER COLUMN setup_status SET DEFAULT 'draft';
  END IF;
END
$$;

-- Verification query (optional - run to check results)
-- SELECT setup_status, COUNT(*) as count
-- FROM projects
-- GROUP BY setup_status;

