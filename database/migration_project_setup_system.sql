-- Migration: Project Setup / Cost Planning System
-- Run this SQL in your Supabase SQL Editor
-- This migration creates the project cost planning system with weekly granularity
--
-- PREREQUISITES:
-- This migration requires the following tables to exist:
-- 1. users (from schema.sql)
-- 2. organizations (from schema.sql)
-- 3. projects (from migration_projects_system.sql)
-- 4. roles (from migration_roles_system.sql)
--
-- Make sure to run migrations in this order:
-- 1. schema.sql
-- 2. migration_roles_system.sql
-- 3. migration_projects_system.sql
-- 4. migration_project_setup_system.sql (this file)

-- ============================================================================
-- STEP 1: Extend projects table with setup-related fields
-- ============================================================================

-- Add project_manager_id field
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add setup_status field (separate from existing status field)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS setup_status TEXT DEFAULT 'draft' CHECK (setup_status IN ('draft', 'setup_done', 'locked'));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_id ON projects(project_manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_setup_status ON projects(setup_status);

-- ============================================================================
-- STEP 2: Create project_setups table (header/summary data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  total_weeks INT NOT NULL DEFAULT 0,
  total_internal_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_internal_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  customer_rate_per_hour DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_customer_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  gross_margin_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  sold_cost_percentage DECIMAL(5,2) NOT NULL DEFAULT 11.00,
  current_margin_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  margin_status TEXT NOT NULL DEFAULT 'red' CHECK (margin_status IN ('green', 'yellow', 'red')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_setups_project_id ON project_setups(project_id);
CREATE INDEX IF NOT EXISTS idx_project_setups_margin_status ON project_setups(margin_status);

-- ============================================================================
-- STEP 3: Create project_role_allocations table (Excel rows)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_role_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  total_hours DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  row_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id) -- One user can only be assigned once per project in setup
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_role_allocations_project_id ON project_role_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_role_allocations_role_id ON project_role_allocations(role_id);
CREATE INDEX IF NOT EXISTS idx_project_role_allocations_user_id ON project_role_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_project_role_allocations_row_order ON project_role_allocations(project_id, row_order);

-- ============================================================================
-- STEP 4: Create project_weekly_hours table (Excel cells)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_weekly_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id UUID NOT NULL REFERENCES project_role_allocations(id) ON DELETE CASCADE,
  week_number INT NOT NULL CHECK (week_number > 0),
  hours DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 168), -- Max hours per week
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(allocation_id, week_number) -- One entry per week per allocation
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_weekly_hours_allocation_id ON project_weekly_hours(allocation_id);
CREATE INDEX IF NOT EXISTS idx_project_weekly_hours_week_number ON project_weekly_hours(allocation_id, week_number);

-- ============================================================================
-- STEP 5: Create project_phases table (optional week labels)
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_name TEXT NOT NULL,
  start_week INT NOT NULL CHECK (start_week > 0),
  end_week INT NOT NULL CHECK (end_week > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_phase_weeks CHECK (start_week <= end_week)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_phases_project_id ON project_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_project_phases_weeks ON project_phases(project_id, start_week, end_week);

-- ============================================================================
-- STEP 6: Create user_hourly_rates table (auto-fill source)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_hourly_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hourly_rate DECIMAL(10,2) NOT NULL CHECK (hourly_rate >= 0),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role_id, organization_id) -- One rate per user-role-org combination
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_hourly_rates_user_id ON user_hourly_rates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_hourly_rates_role_id ON user_hourly_rates(role_id);
CREATE INDEX IF NOT EXISTS idx_user_hourly_rates_organization_id ON user_hourly_rates(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_hourly_rates_lookup ON user_hourly_rates(user_id, role_id, organization_id);

-- ============================================================================
-- STEP 7: Create triggers for updated_at timestamps
-- ============================================================================

-- Create function if not exists
CREATE OR REPLACE FUNCTION update_project_setup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for project_setups
CREATE TRIGGER update_project_setups_updated_at
  BEFORE UPDATE ON project_setups
  FOR EACH ROW
  EXECUTE FUNCTION update_project_setup_updated_at();

-- Triggers for project_role_allocations
CREATE TRIGGER update_project_role_allocations_updated_at
  BEFORE UPDATE ON project_role_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_project_setup_updated_at();

-- Triggers for project_weekly_hours
CREATE TRIGGER update_project_weekly_hours_updated_at
  BEFORE UPDATE ON project_weekly_hours
  FOR EACH ROW
  EXECUTE FUNCTION update_project_setup_updated_at();

-- Triggers for user_hourly_rates
CREATE TRIGGER update_user_hourly_rates_updated_at
  BEFORE UPDATE ON user_hourly_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_project_setup_updated_at();

-- ============================================================================
-- STEP 8: Enable Row Level Security
-- ============================================================================

ALTER TABLE project_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_role_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_weekly_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_hourly_rates ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 9: Create RLS Policies for project_setups
-- ============================================================================

-- Users can read setups in their organization
CREATE POLICY "Users can read project setups in their organization"
  ON project_setups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_setups.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- ADMIN and MANAGER can create/update/delete setups
CREATE POLICY "Admins and managers can manage project setups"
  ON project_setups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_setups.project_id
      AND u.id = auth.uid()
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
      WHERE p.id = project_setups.project_id
      AND u.id = auth.uid()
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

-- ============================================================================
-- STEP 10: Create RLS Policies for project_role_allocations
-- ============================================================================

-- Users can read allocations in their organization
CREATE POLICY "Users can read project allocations in their organization"
  ON project_role_allocations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_role_allocations.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- ADMIN and MANAGER can manage allocations
CREATE POLICY "Admins and managers can manage project allocations"
  ON project_role_allocations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_role_allocations.project_id
      AND u.id = auth.uid()
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
      WHERE p.id = project_role_allocations.project_id
      AND u.id = auth.uid()
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

-- ============================================================================
-- STEP 11: Create RLS Policies for project_weekly_hours
-- ============================================================================

-- Users can read weekly hours in their organization
CREATE POLICY "Users can read project weekly hours in their organization"
  ON project_weekly_hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_role_allocations pra
      JOIN projects p ON p.id = pra.project_id
      JOIN users u ON u.organization_id = p.organization_id
      WHERE pra.id = project_weekly_hours.allocation_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- ADMIN and MANAGER can manage weekly hours
CREATE POLICY "Admins and managers can manage project weekly hours"
  ON project_weekly_hours
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_role_allocations pra
      JOIN projects p ON p.id = pra.project_id
      JOIN users u ON u.organization_id = p.organization_id
      WHERE pra.id = project_weekly_hours.allocation_id
      AND u.id = auth.uid()
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
      SELECT 1 FROM project_role_allocations pra
      JOIN projects p ON p.id = pra.project_id
      JOIN users u ON u.organization_id = p.organization_id
      WHERE pra.id = project_weekly_hours.allocation_id
      AND u.id = auth.uid()
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

-- ============================================================================
-- STEP 12: Create RLS Policies for project_phases
-- ============================================================================

-- Users can read phases in their organization
CREATE POLICY "Users can read project phases in their organization"
  ON project_phases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_phases.project_id
      AND u.id = auth.uid()
      AND u.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- ADMIN and MANAGER can manage phases
CREATE POLICY "Admins and managers can manage project phases"
  ON project_phases
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN users u ON u.organization_id = p.organization_id
      WHERE p.id = project_phases.project_id
      AND u.id = auth.uid()
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
      WHERE p.id = project_phases.project_id
      AND u.id = auth.uid()
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

-- ============================================================================
-- STEP 13: Create RLS Policies for user_hourly_rates
-- ============================================================================

-- Users can read rates in their organization
CREATE POLICY "Users can read hourly rates in their organization"
  ON user_hourly_rates
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE users.id = auth.uid()
      AND organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- ADMIN and MANAGER can manage rates
CREATE POLICY "Admins and managers can manage hourly rates"
  ON user_hourly_rates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('ADMIN', 'MANAGER')
      AND r.organization_id = user_hourly_rates.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('ADMIN', 'MANAGER')
      AND r.organization_id = user_hourly_rates.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- ============================================================================
-- STEP 14: Grant necessary permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON project_setups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_role_allocations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_weekly_hours TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON project_phases TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_hourly_rates TO anon, authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- You can now use the project setup/cost planning system.
-- Next steps:
-- 1. Implement backend API routes in backend/src/routes/projectSetup.ts
-- 2. Create frontend UI components
-- 3. Test the complete flow

