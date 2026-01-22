-- Migration: Add phone and timezone fields to users table
-- Run this SQL in your Supabase SQL Editor

-- Step 1: Add phone column (nullable, optional)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Step 2: Add timezone column with default value
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- Step 3: Update existing users to have default timezone if they don't have one
-- (This handles the case where timezone was added as NOT NULL but existing rows need a value)
UPDATE users 
SET timezone = 'Asia/Kolkata' 
WHERE timezone IS NULL;

-- Step 4: Create index on phone for potential lookups (optional, but useful)
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

