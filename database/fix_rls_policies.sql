-- Fix infinite recursion in RLS policies
-- Run this SQL in your Supabase SQL Editor

-- Drop the problematic policies
DROP POLICY IF EXISTS "Super admins can read all users" ON users;
DROP POLICY IF EXISTS "Users in same organization can read each other" ON users;

-- Create a security definer function to check if user is super admin
-- This function bypasses RLS to avoid recursion
CREATE OR REPLACE FUNCTION is_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id
    AND role = 'SUPER_ADMIN'
  );
END;
$$;

-- Create a function to get user's organization_id (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_organization_id(user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT organization_id FROM users
    WHERE id = user_id
    LIMIT 1
  );
END;
$$;

-- Recreate "Super admins can read all users" policy using the function
CREATE POLICY "Super admins can read all users"
  ON users
  FOR SELECT
  USING (is_super_admin(auth.uid()));

-- Recreate "Users in same organization can read each other" policy using the function
CREATE POLICY "Users in same organization can read each other"
  ON users
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND organization_id = get_user_organization_id(auth.uid())
  );
