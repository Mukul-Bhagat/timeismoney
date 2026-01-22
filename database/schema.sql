-- TimeIsMoney Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'EMPLOYEE');

-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations table
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

-- Only service role (backend) can create organizations
-- This is handled by backend using service role key, so no policy needed
-- But we'll create a policy that denies all inserts from client
CREATE POLICY "Only backend can create organizations"
  ON organizations
  FOR INSERT
  WITH CHECK (false); -- Deny all client-side inserts

-- Only service role (backend) can update organizations
CREATE POLICY "Only backend can update organizations"
  ON organizations
  FOR UPDATE
  USING (false); -- Deny all client-side updates

-- RLS Policies for users table
-- Users can read their own profile
CREATE POLICY "Users can read their own profile"
  ON users
  FOR SELECT
  USING (auth.uid() = id);

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

-- Users in same organization can read each other (for COMPANY_ADMIN and EMPLOYEE)
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

-- Only service role (backend) can create users
CREATE POLICY "Only backend can create users"
  ON users
  FOR INSERT
  WITH CHECK (false); -- Deny all client-side inserts

-- Only service role (backend) can update users
CREATE POLICY "Only backend can update users"
  ON users
  FOR UPDATE
  USING (false); -- Deny all client-side updates

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON organizations TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON users TO anon, authenticated;
GRANT USAGE ON TYPE user_role TO anon, authenticated;

