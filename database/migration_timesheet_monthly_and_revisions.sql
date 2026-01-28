-- Migration: Monthly Timesheets + Revisions + State Machine
-- Run this SQL in your Supabase SQL Editor
-- This migration converts timesheets to monthly periods and adds revision tracking
--
-- PREREQUISITES:
-- This migration requires the following tables to exist:
-- 1. users (from schema.sql)
-- 2. projects (from migration_projects_system.sql)
-- 3. timesheets (from migration_timesheet_system.sql)
-- 4. timesheet_entries (from migration_timesheet_system.sql)

-- Step 1: Extend timesheet_status enum to include REJECTED and RESUBMITTED
DO $$
BEGIN
  -- Check if enum exists and add new values if they don't exist
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'timesheet_status') THEN
    -- Add REJECTED if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'REJECTED' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_status')
    ) THEN
      ALTER TYPE timesheet_status ADD VALUE 'REJECTED';
    END IF;
    
    -- Add RESUBMITTED if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'RESUBMITTED' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'timesheet_status')
    ) THEN
      ALTER TYPE timesheet_status ADD VALUE 'RESUBMITTED';
    END IF;
  ELSE
    RAISE NOTICE 'timesheet_status enum does not exist. Please run migration_timesheet_system.sql first.';
  END IF;
END $$;

-- Step 2: Add month column to timesheets (nullable initially for migration)
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS month DATE;

-- Step 3: Add rejection fields to timesheets
ALTER TABLE timesheets 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Step 4: Create timesheet_revisions table for audit history
CREATE TABLE IF NOT EXISTS timesheet_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('SUBMIT', 'RESUBMIT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metadata JSONB,
  UNIQUE(timesheet_id, revision_number)
);

-- Step 5: Create timesheet_revision_entries table
CREATE TABLE IF NOT EXISTS timesheet_revision_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES timesheet_revisions(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours DECIMAL(4,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(revision_id, date)
);

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_timesheets_month ON timesheets(month);
CREATE INDEX IF NOT EXISTS idx_timesheets_project_user_month ON timesheets(project_id, user_id, month);
CREATE INDEX IF NOT EXISTS idx_timesheet_revisions_timesheet_id ON timesheet_revisions(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_revisions_created_at ON timesheet_revisions(created_at);
CREATE INDEX IF NOT EXISTS idx_timesheet_revision_entries_revision_id ON timesheet_revision_entries(revision_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_revision_entries_date ON timesheet_revision_entries(date);

-- Step 7: Data migration - Split existing timesheets by month
-- This is a critical step that converts legacy per-project timesheets to monthly timesheets
DO $$
DECLARE
  timesheet_record RECORD;
  entry_record RECORD;
  current_month DATE;
  month_start DATE;
  new_timesheet_id UUID;
  month_timesheets_map JSONB := '{}'::JSONB;
  month_key TEXT;
BEGIN
  -- Loop through all existing timesheets
  FOR timesheet_record IN 
    SELECT id, project_id, user_id, status, submitted_at, approved_at, approved_by, created_at, updated_at
    FROM timesheets
    WHERE month IS NULL
  LOOP
    RAISE NOTICE 'Processing timesheet % for project %, user %', 
      timesheet_record.id, timesheet_record.project_id, timesheet_record.user_id;
    
    -- Reset map for this timesheet
    month_timesheets_map := '{}'::JSONB;
    
    -- Get all entries for this timesheet and group by month
    FOR entry_record IN
      SELECT date, hours
      FROM timesheet_entries
      WHERE timesheet_id = timesheet_record.id
      ORDER BY date
    LOOP
      -- Extract month (first day of month)
      month_start := DATE_TRUNC('month', entry_record.date)::DATE;
      month_key := month_start::TEXT;
      
      -- If we haven't created a timesheet for this month yet, create it
      IF NOT (month_timesheets_map ? month_key) THEN
        -- Create new monthly timesheet
        INSERT INTO timesheets (
          project_id,
          user_id,
          status,
          submitted_at,
          approved_at,
          approved_by,
          month,
          created_at,
          updated_at
        )
        VALUES (
          timesheet_record.project_id,
          timesheet_record.user_id,
          timesheet_record.status,
          timesheet_record.submitted_at,
          timesheet_record.approved_at,
          timesheet_record.approved_by,
          month_start,
          timesheet_record.created_at,
          timesheet_record.updated_at
        )
        RETURNING id INTO new_timesheet_id;
        
        -- Store in map
        month_timesheets_map := month_timesheets_map || jsonb_build_object(month_key, new_timesheet_id::TEXT);
        
        RAISE NOTICE 'Created monthly timesheet % for month %', new_timesheet_id, month_start;
      ELSE
        -- Get existing timesheet ID from map
        new_timesheet_id := (month_timesheets_map->>month_key)::UUID;
      END IF;
      
      -- Move entry to new monthly timesheet
      UPDATE timesheet_entries
      SET timesheet_id = new_timesheet_id
      WHERE id = (
        SELECT id FROM timesheet_entries
        WHERE timesheet_id = timesheet_record.id
        AND date = entry_record.date
        LIMIT 1
      );
    END LOOP;
    
    -- If timesheet had no entries, create a single monthly timesheet for the current month
    -- (or project start date if available)
    IF month_timesheets_map = '{}'::JSONB THEN
      -- Try to get project start date, otherwise use current month
      SELECT COALESCE(
        DATE_TRUNC('month', (SELECT start_date FROM projects WHERE id = timesheet_record.project_id LIMIT 1))::DATE,
        DATE_TRUNC('month', NOW())::DATE
      ) INTO month_start;
      
      INSERT INTO timesheets (
        project_id,
        user_id,
        status,
        submitted_at,
        approved_at,
        approved_by,
        month,
        created_at,
        updated_at
      )
      VALUES (
        timesheet_record.project_id,
        timesheet_record.user_id,
        timesheet_record.status,
        timesheet_record.submitted_at,
        timesheet_record.approved_at,
        timesheet_record.approved_by,
        month_start,
        timesheet_record.created_at,
        timesheet_record.updated_at
      );
      
      RAISE NOTICE 'Created monthly timesheet for month % (no entries)', month_start;
    END IF;
    
    -- Delete old timesheet (entries have been moved)
    DELETE FROM timesheets WHERE id = timesheet_record.id;
    
    RAISE NOTICE 'Deleted old timesheet %', timesheet_record.id;
  END LOOP;
  
  RAISE NOTICE 'Data migration completed';
END $$;

-- Step 8: Make month column NOT NULL and update unique constraint
-- First, set any remaining NULL months to a default (shouldn't happen after migration, but safety check)
UPDATE timesheets 
SET month = DATE_TRUNC('month', COALESCE(created_at, NOW()))::DATE
WHERE month IS NULL;

-- Drop old unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'timesheets_project_id_user_id_key'
  ) THEN
    ALTER TABLE timesheets DROP CONSTRAINT timesheets_project_id_user_id_key;
  END IF;
END $$;

-- Add new unique constraint for (project_id, user_id, month)
ALTER TABLE timesheets 
ADD CONSTRAINT timesheets_project_user_month_unique UNIQUE(project_id, user_id, month);

-- Make month NOT NULL
ALTER TABLE timesheets 
ALTER COLUMN month SET NOT NULL;

-- Step 9: Enable Row Level Security for new tables
ALTER TABLE timesheet_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_revision_entries ENABLE ROW LEVEL SECURITY;

-- Step 10: Create RLS Policies for timesheet_revisions
-- Users can read revisions for timesheets they can read
CREATE POLICY "Users can read timesheet revisions"
  ON timesheet_revisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_revisions.timesheet_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM projects p
          JOIN users u ON u.organization_id = p.organization_id
          WHERE p.id = t.project_id
          AND u.id = auth.uid()
          AND u.organization_id IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role = 'SUPER_ADMIN'
        )
      )
    )
  );

-- Users can create revisions when submitting/resubmitting (via backend)
CREATE POLICY "Users can create timesheet revisions"
  ON timesheet_revisions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_revisions.timesheet_id
      AND t.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Step 11: Create RLS Policies for timesheet_revision_entries
-- Users can read revision entries for revisions they can read
CREATE POLICY "Users can read timesheet revision entries"
  ON timesheet_revision_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM timesheet_revisions tr
      JOIN timesheets t ON t.id = tr.timesheet_id
      WHERE tr.id = timesheet_revision_entries.revision_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM projects p
          JOIN users u ON u.organization_id = p.organization_id
          WHERE p.id = t.project_id
          AND u.id = auth.uid()
          AND u.organization_id IS NOT NULL
        )
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role = 'SUPER_ADMIN'
        )
      )
    )
  );

-- Users can create revision entries when creating revisions (via backend)
CREATE POLICY "Users can create timesheet revision entries"
  ON timesheet_revision_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timesheet_revisions tr
      JOIN timesheets t ON t.id = tr.timesheet_id
      WHERE tr.id = timesheet_revision_entries.revision_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role = 'SUPER_ADMIN'
        )
      )
    )
  );

-- Step 12: Update RLS policy for timesheets to allow RESUBMITTED status updates
-- Drop existing update policy that restricts to DRAFT
DROP POLICY IF EXISTS "Users can update their own draft timesheets" ON timesheets;

-- Create new policy that allows updates for DRAFT, REJECTED, and RESUBMITTED
CREATE POLICY "Users can update their own editable timesheets"
  ON timesheets
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status IN ('DRAFT', 'REJECTED', 'RESUBMITTED')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status IN ('DRAFT', 'REJECTED', 'RESUBMITTED', 'SUBMITTED')
  );

-- Step 13: Grant necessary permissions
GRANT SELECT, INSERT ON timesheet_revisions TO anon, authenticated;
GRANT SELECT, INSERT ON timesheet_revision_entries TO anon, authenticated;

-- Step 14: Create function to get next revision number for a timesheet
CREATE OR REPLACE FUNCTION get_next_revision_number(timesheet_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO next_num
  FROM timesheet_revisions
  WHERE timesheet_id = timesheet_uuid;
  
  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

