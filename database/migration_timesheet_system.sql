-- Migration: Timesheet System
-- Run this SQL in your Supabase SQL Editor
-- This migration creates the timesheets and timesheet_entries tables

-- Step 1: Create timesheet status enum
CREATE TYPE timesheet_status AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- Step 2: Create timesheets table
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status timesheet_status NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id) -- One timesheet per user per project
);

-- Step 3: Create timesheet_entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  hours DECIMAL(4,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 24),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(timesheet_id, date) -- One entry per date per timesheet
);

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_timesheets_project_id ON timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_user_id ON timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet_id ON timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_date ON timesheet_entries(date);

-- Step 5: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timesheet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create triggers to auto-update updated_at
CREATE TRIGGER update_timesheets_updated_at
  BEFORE UPDATE ON timesheets
  FOR EACH ROW
  EXECUTE FUNCTION update_timesheet_updated_at();

CREATE TRIGGER update_timesheet_entries_updated_at
  BEFORE UPDATE ON timesheet_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_timesheet_updated_at();

-- Step 7: Enable Row Level Security
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS Policies for timesheets table
-- Users can read their own timesheets
CREATE POLICY "Users can read their own timesheets"
  ON timesheets
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can read timesheets in their organization (for ADMIN/MANAGER approval)
CREATE POLICY "Users can read timesheets in their organization"
  ON timesheets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = timesheets.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Users can create timesheets for projects they're assigned to
CREATE POLICY "Users can create timesheets for assigned projects"
  ON timesheets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = timesheets.project_id
      AND pm.user_id = auth.uid()
    )
  );

-- Users can update their own draft timesheets
CREATE POLICY "Users can update their own draft timesheets"
  ON timesheets
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'DRAFT'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND (status = 'DRAFT' OR status = 'SUBMITTED')
  );

-- Users can submit their own timesheets (change DRAFT to SUBMITTED)
CREATE POLICY "Users can submit their own timesheets"
  ON timesheets
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'DRAFT'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'SUBMITTED'
  );

-- Step 9: Create RLS Policies for timesheet_entries table
-- Users can read entries for timesheets they can read
CREATE POLICY "Users can read timesheet entries"
  ON timesheet_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
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

-- Users can create/update entries for their own draft timesheets
CREATE POLICY "Users can manage entries for their draft timesheets"
  ON timesheet_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
      AND t.user_id = auth.uid()
      AND t.status = 'DRAFT'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
      AND t.user_id = auth.uid()
      AND t.status = 'DRAFT'
    )
  );

-- Step 10: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON timesheets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON timesheet_entries TO anon, authenticated;
GRANT USAGE ON TYPE timesheet_status TO anon, authenticated;

