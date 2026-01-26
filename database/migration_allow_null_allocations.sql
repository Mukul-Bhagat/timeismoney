-- ============================================================================
-- Migration: Allow NULL values for role_id and user_id in project_role_allocations
-- Purpose: Enable Excel-like empty row creation in planning sheets
-- Date: 2026-01-24
-- ============================================================================

-- Step 1: Make role_id nullable
ALTER TABLE project_role_allocations 
  ALTER COLUMN role_id DROP NOT NULL;

-- Step 2: Make user_id nullable  
ALTER TABLE project_role_allocations 
  ALTER COLUMN user_id DROP NOT NULL;

-- Step 3: Drop the existing UNIQUE constraint on (project_id, user_id)
-- since NULL values in user_id should be allowed and won't violate uniqueness
ALTER TABLE project_role_allocations 
  DROP CONSTRAINT IF EXISTS project_role_allocations_project_id_user_id_key;

-- Step 4: Create a conditional UNIQUE constraint that only applies when user_id is NOT NULL
-- This allows multiple rows with NULL user_id but maintains uniqueness for assigned users
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_role_allocations_unique_user 
  ON project_role_allocations(project_id, user_id) 
  WHERE user_id IS NOT NULL;

-- Note: Empty rows (role_id IS NULL AND user_id IS NULL) are allowed during draft mode
-- Validation will enforce completeness only during "Finalize Setup"

