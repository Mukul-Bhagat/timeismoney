-- Migration: Roles System - Many-to-Many Organization-Scoped Roles
-- Run this SQL in your Supabase SQL Editor
-- This migration creates the roles and user_roles tables and migrates existing data

-- Step 1: Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, name) -- Prevent duplicate role names per organization
);

-- Step 2: Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role_id) -- Prevent duplicate assignments
);

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_roles_organization_id ON roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_organization_id ON user_roles(organization_id);

-- Step 4: Make users.role nullable (only SUPER_ADMIN will have it set)
ALTER TABLE users ALTER COLUMN role DROP NOT NULL;

-- Step 5: Create system roles for each existing organization and migrate existing user roles
DO $$
DECLARE
  org_record RECORD;
  admin_role_id UUID;
  manager_role_id UUID;
  employee_role_id UUID;
  user_record RECORD;
  role_name TEXT;
BEGIN
  -- Loop through all organizations
  FOR org_record IN SELECT id FROM organizations LOOP
    -- Create system roles for this organization
    INSERT INTO roles (organization_id, name, is_system, created_at)
    VALUES (org_record.id, 'ADMIN', true, NOW())
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO admin_role_id;
    
    INSERT INTO roles (organization_id, name, is_system, created_at)
    VALUES (org_record.id, 'MANAGER', true, NOW())
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO manager_role_id;
    
    INSERT INTO roles (organization_id, name, is_system, created_at)
    VALUES (org_record.id, 'EMPLOYEE', true, NOW())
    ON CONFLICT (organization_id, name) DO NOTHING
    RETURNING id INTO employee_role_id;
    
    -- Get the role IDs if they already existed
    IF admin_role_id IS NULL THEN
      SELECT id INTO admin_role_id FROM roles WHERE organization_id = org_record.id AND name = 'ADMIN';
    END IF;
    IF manager_role_id IS NULL THEN
      SELECT id INTO manager_role_id FROM roles WHERE organization_id = org_record.id AND name = 'MANAGER';
    END IF;
    IF employee_role_id IS NULL THEN
      SELECT id INTO employee_role_id FROM roles WHERE organization_id = org_record.id AND name = 'EMPLOYEE';
    END IF;
    
    -- Migrate existing users to user_roles
    FOR user_record IN 
      SELECT id, role, organization_id 
      FROM users 
      WHERE organization_id = org_record.id 
      AND role IS NOT NULL 
      AND role != 'SUPER_ADMIN'
    LOOP
      -- Map old role to new role_id
      role_name := user_record.role::TEXT;
      
      IF role_name = 'ADMIN' THEN
        INSERT INTO user_roles (user_id, role_id, organization_id, created_at)
        VALUES (user_record.id, admin_role_id, org_record.id, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
      ELSIF role_name = 'MANAGER' THEN
        INSERT INTO user_roles (user_id, role_id, organization_id, created_at)
        VALUES (user_record.id, manager_role_id, org_record.id, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
      ELSIF role_name = 'EMPLOYEE' THEN
        INSERT INTO user_roles (user_id, role_id, organization_id, created_at)
        VALUES (user_record.id, employee_role_id, org_record.id, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Step 6: Create function to auto-create system roles when organization is created
CREATE OR REPLACE FUNCTION create_system_roles_for_organization()
RETURNS TRIGGER AS $$
DECLARE
  admin_role_id UUID;
  manager_role_id UUID;
  employee_role_id UUID;
BEGIN
  -- Create ADMIN role
  INSERT INTO roles (organization_id, name, is_system, created_at)
  VALUES (NEW.id, 'ADMIN', true, NOW())
  RETURNING id INTO admin_role_id;
  
  -- Create MANAGER role
  INSERT INTO roles (organization_id, name, is_system, created_at)
  VALUES (NEW.id, 'MANAGER', true, NOW())
  RETURNING id INTO manager_role_id;
  
  -- Create EMPLOYEE role
  INSERT INTO roles (organization_id, name, is_system, created_at)
  VALUES (NEW.id, 'EMPLOYEE', true, NOW())
  RETURNING id INTO employee_role_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create trigger to auto-create system roles
DROP TRIGGER IF EXISTS trigger_create_system_roles ON organizations;
CREATE TRIGGER trigger_create_system_roles
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION create_system_roles_for_organization();

-- Step 8: Enable Row Level Security
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS Policies for roles table
-- Users can read roles in their organization
CREATE POLICY "Users can read roles in their organization"
  ON roles
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

-- Only ADMIN and SUPER_ADMIN can create roles
CREATE POLICY "Admins can create roles"
  ON roles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'ADMIN'
      AND r.organization_id = roles.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Only ADMIN and SUPER_ADMIN can update roles (but not system roles)
CREATE POLICY "Admins can update custom roles"
  ON roles
  FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1 FROM user_roles ur_check
      JOIN roles r ON r.id = ur_check.role_id
      WHERE ur_check.user_id = auth.uid()
      AND r.name = 'ADMIN'
      AND r.organization_id = roles.organization_id
    ) OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    ))
    AND roles.is_system = false -- Cannot update system roles
  );

-- Only ADMIN and SUPER_ADMIN can delete custom roles (not system roles)
CREATE POLICY "Admins can delete custom roles"
  ON roles
  FOR DELETE
  USING (
    (EXISTS (
      SELECT 1 FROM user_roles ur_check
      JOIN roles r ON r.id = ur_check.role_id
      WHERE ur_check.user_id = auth.uid()
      AND r.name = 'ADMIN'
      AND r.organization_id = roles.organization_id
    ) OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    ))
    AND roles.is_system = false -- Cannot delete system roles
  );

-- Step 10: Create RLS Policies for user_roles table
-- Users can read user_roles in their organization
CREATE POLICY "Users can read user_roles in their organization"
  ON user_roles
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

-- Only ADMIN and SUPER_ADMIN can create user_roles
CREATE POLICY "Admins can create user_roles"
  ON user_roles
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur_check
      JOIN roles r ON r.id = ur_check.role_id
      WHERE ur_check.user_id = auth.uid()
      AND r.name = 'ADMIN'
      AND r.organization_id = user_roles.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Only ADMIN and SUPER_ADMIN can delete user_roles
CREATE POLICY "Admins can delete user_roles"
  ON user_roles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur_check
      JOIN roles r ON r.id = ur_check.role_id
      WHERE ur_check.user_id = auth.uid()
      AND r.name = 'ADMIN'
      AND r.organization_id = user_roles.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Step 11: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON user_roles TO anon, authenticated;

-- Step 12: Create helper function to check if user has role
CREATE OR REPLACE FUNCTION user_has_role(user_id UUID, role_name TEXT, org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = user_id
    AND r.name = role_name
    AND r.organization_id = org_id
  );
END;
$$;

-- Step 13: Create helper function to get user's roles in organization
CREATE OR REPLACE FUNCTION get_user_roles_in_org(user_id UUID, org_id UUID)
RETURNS TABLE(role_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.name::TEXT
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = user_id
  AND ur.organization_id = org_id;
END;
$$;

