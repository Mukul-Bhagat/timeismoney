-- Migration: Add approved_by column to timesheets table
-- This migration adds the approved_by column if it doesn't exist
-- Run this SQL in your Supabase SQL Editor

-- Add approved_by column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'timesheets' 
    AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE timesheets 
    ADD COLUMN approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'approved_by column added successfully';
  ELSE
    RAISE NOTICE 'approved_by column already exists';
  END IF;
END $$;

-- Create index on approved_by for performance (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_indexes 
    WHERE indexname = 'idx_timesheets_approved_by'
  ) THEN
    CREATE INDEX idx_timesheets_approved_by ON timesheets(approved_by);
    RAISE NOTICE 'Index idx_timesheets_approved_by created successfully';
  ELSE
    RAISE NOTICE 'Index idx_timesheets_approved_by already exists';
  END IF;
END $$;

