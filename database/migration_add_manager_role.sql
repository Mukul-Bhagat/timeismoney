-- Migration: Add MANAGER role and rename COMPANY_ADMIN to ADMIN
-- Run this SQL in your Supabase SQL Editor AFTER running the initial schema.sql

-- IMPORTANT: This migration drops and recreates RLS policies that depend on the role column

-- Step 1: Drop all policies that depend on the role column
DROP POLICY IF EXISTS "Super admins can read all organizations" ON organizations;
DROP POLICY IF EXISTS "Users can read their own organization" ON organizations;
DROP POLICY IF EXISTS "Super admins can read all users" ON users;
DROP POLICY IF EXISTS "Users in same organization can read each other" ON users;

-- Step 2: Create a new enum with all roles
CREATE TYPE user_role_new AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE');

-- Step 3: Convert the role column to text temporarily
ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;

-- Step 4: Update existing COMPANY_ADMIN to ADMIN (now it's text, so this works)
UPDATE users SET role = 'ADMIN' WHERE role = 'COMPANY_ADMIN';

-- Step 5: Drop the old enum (no longer referenced)
DROP TYPE user_role;

-- Step 6: Rename the new enum to user_role
ALTER TYPE user_role_new RENAME TO user_role;

-- Step 7: Convert the column back to enum type using the new enum
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- Step 8: Recreate the policies with updated role references
-- Super admins can read all organizations
CREATE POLICY "Super admins can read all organizations"
  ON organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'SUPER_ADMIN'
    )
  );

-- Users can read their own organization
CREATE POLICY "Users can read their own organization"
  ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM users
      WHERE users.id = auth.uid()
    )
  );

-- Super admins can read all users
CREATE POLICY "Super admins can read all users"
  ON users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users AS u
      WHERE u.id = auth.uid()
      AND u.role = 'SUPER_ADMIN'
    )
  );

-- Users in same organization can read each other (for ADMIN, MANAGER, and EMPLOYEE)
CREATE POLICY "Users in same organization can read each other"
  ON users
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE users.id = auth.uid()
      AND organization_id IS NOT NULL
    )
    AND organization_id IS NOT NULL
  );

-- Verify the update
SELECT DISTINCT role FROM users;
