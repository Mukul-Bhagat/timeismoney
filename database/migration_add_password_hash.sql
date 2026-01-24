-- Migration: Add password_hash column to users table
-- Run this SQL in your Supabase SQL Editor
-- This migration adds password_hash column for JWT authentication

-- Step 1: Add password_hash column (nullable initially for migration)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Step 2: Create index on email for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_users_email_lookup ON users(email);

-- Note: Existing users will have NULL password_hash
-- They will need to reset their password or migrate from Supabase Auth
-- New users created via /api/users will have password_hash set

