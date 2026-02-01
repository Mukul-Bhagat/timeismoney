-- Migration Part 1: Add RESUBMITTED and REJECTED to timesheet_status enum
-- 
-- IMPORTANT: Run this file FIRST in Supabase SQL Editor
-- Wait for it to complete successfully before running Part 2
--
-- PostgreSQL requires enum values to be committed in a separate transaction
-- before they can be used in policies or other statements.

-- Add REJECTED if it doesn't exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheet_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'REJECTED' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_status')
    ) THEN
      ALTER TYPE timesheet_status ADD VALUE 'REJECTED';
      RAISE NOTICE 'Added REJECTED to timesheet_status enum';
    ELSE
      RAISE NOTICE 'REJECTED already exists in timesheet_status enum';
    END IF;
  ELSE
    RAISE EXCEPTION 'timesheet_status enum does not exist. Please run migration_timesheet_system.sql first.';
  END IF;
END $$;

-- Add RESUBMITTED if it doesn't exist
-- Note: This must be in a separate DO block to ensure it commits separately
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheet_status') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'RESUBMITTED' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_status')
    ) THEN
      ALTER TYPE timesheet_status ADD VALUE 'RESUBMITTED';
      RAISE NOTICE 'Added RESUBMITTED to timesheet_status enum';
    ELSE
      RAISE NOTICE 'RESUBMITTED already exists in timesheet_status enum';
    END IF;
  ELSE
    RAISE EXCEPTION 'timesheet_status enum does not exist. Please run migration_timesheet_system.sql first.';
  END IF;
END $$;
