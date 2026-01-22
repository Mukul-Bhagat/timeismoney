-- Migration: Approval System Extension
-- Run this SQL in your Supabase SQL Editor
-- This migration adds approval functionality to the timesheet system
--
-- PREREQUISITES:
-- This migration requires the following tables to exist:
-- 1. users (from schema.sql)
-- 2. projects (from migration_projects_system.sql)
-- 3. timesheets (from migration_timesheet_system.sql)
-- 4. roles and user_roles (from migration_roles_system.sql)
--
-- Make sure to run migrations in this order:
-- 1. schema.sql
-- 2. migration_roles_system.sql
-- 3. migration_projects_system.sql
-- 4. migration_timesheet_system.sql
-- 5. migration_approval_system.sql (this file)

-- Step 1: Add approved_by field to timesheets table (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'timesheets') THEN
    ALTER TABLE timesheets 
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
  ELSE
    RAISE NOTICE 'timesheets table does not exist. Please run migration_timesheet_system.sql first.';
  END IF;
END $$;

-- Step 2: Create project_costing table
CREATE TABLE IF NOT EXISTS project_costing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  quote_amount DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id) -- One costing record per user per project
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_costing_project_id ON project_costing(project_id);
CREATE INDEX IF NOT EXISTS idx_project_costing_user_id ON project_costing(user_id);

-- Create index on timesheets.approved_by (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'timesheets') THEN
    IF NOT EXISTS (SELECT FROM pg_indexes WHERE indexname = 'idx_timesheets_approved_by') THEN
      CREATE INDEX idx_timesheets_approved_by ON timesheets(approved_by);
    END IF;
  END IF;
END $$;

-- Step 4: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_costing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger to auto-update updated_at
CREATE TRIGGER update_project_costing_updated_at
  BEFORE UPDATE ON project_costing
  FOR EACH ROW
  EXECUTE FUNCTION update_project_costing_updated_at();

-- Step 6: Enable Row Level Security
ALTER TABLE project_costing ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS Policies for project_costing table
-- Users can read costing data in their organization
CREATE POLICY "Users can read project costing in their organization"
  ON project_costing
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_costing.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Only ADMIN and MANAGER can create/update costing data
CREATE POLICY "Admins and managers can manage project costing"
  ON project_costing
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_costing.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid()
          AND r.name IN ('ADMIN', 'MANAGER')
          AND r.organization_id = p.organization_id
        )
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role = 'SUPER_ADMIN'
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_costing.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid()
          AND r.name IN ('ADMIN', 'MANAGER')
          AND r.organization_id = p.organization_id
        )
        OR EXISTS (
          SELECT 1 FROM users
          WHERE users.id = auth.uid()
          AND users.role = 'SUPER_ADMIN'
        )
      )
    )
  );

-- Step 8: Update RLS policy for timesheets to allow ADMIN/MANAGER to update approved_by
-- This is handled by the existing policy, but we need to ensure approved_by can be set
-- The existing update policy allows users to update their own timesheets, but we need
-- ADMIN/MANAGER to be able to approve (update status and approved_by)

-- Create policy for ADMIN/MANAGER to approve timesheets (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'timesheets') THEN
    -- Drop policy if it already exists
    DROP POLICY IF EXISTS "Admins and managers can approve timesheets" ON timesheets;
    
    -- Create policy for ADMIN/MANAGER to approve timesheets
    CREATE POLICY "Admins and managers can approve timesheets"
      ON timesheets
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM projects p
          JOIN users u ON u.organization_id = p.organization_id
          WHERE p.id = timesheets.project_id
          AND u.id = auth.uid()
          AND u.organization_id IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = auth.uid()
              AND r.name IN ('ADMIN', 'MANAGER')
              AND r.organization_id = p.organization_id
            )
            OR EXISTS (
              SELECT 1 FROM users
              WHERE users.id = auth.uid()
              AND users.role = 'SUPER_ADMIN'
            )
          )
        )
        AND timesheets.status = 'SUBMITTED'
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM projects p
          JOIN users u ON u.organization_id = p.organization_id
          WHERE p.id = timesheets.project_id
          AND u.id = auth.uid()
          AND u.organization_id IS NOT NULL
          AND (
            EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = auth.uid()
              AND r.name IN ('ADMIN', 'MANAGER')
              AND r.organization_id = p.organization_id
            )
            OR EXISTS (
              SELECT 1 FROM users
              WHERE users.id = auth.uid()
              AND users.role = 'SUPER_ADMIN'
            )
          )
        )
        AND timesheets.status = 'APPROVED'
      );
  ELSE
    RAISE NOTICE 'timesheets table does not exist. Policy creation skipped. Please run migration_timesheet_system.sql first.';
  END IF;
END $$;

-- Step 9: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON project_costing TO anon, authenticated;

-- Grant permissions on timesheets (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'timesheets') THEN
    GRANT UPDATE ON timesheets TO anon, authenticated;
  END IF;
END $$;

