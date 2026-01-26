-- Migration: Add Project Types (Simple vs Planned)
-- Run this SQL in your Supabase SQL Editor
-- This migration adds support for two project types:
-- Type A (Simple): Daily working projects with optional member assignment
-- Type B (Planned): Cost-based projects requiring planning sheet

-- Step 1: Add project type and related fields
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'simple',
ADD COLUMN IF NOT EXISTS daily_working_hours INTEGER DEFAULT 8,
ADD COLUMN IF NOT EXISTS project_manager_1_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS project_manager_2_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Step 2: Add constraint for project type
ALTER TABLE projects
ADD CONSTRAINT check_project_type 
CHECK (project_type IN ('simple', 'planned'));

-- Step 3: Add constraint for daily working hours
ALTER TABLE projects
ADD CONSTRAINT check_daily_hours 
CHECK (daily_working_hours > 0 AND daily_working_hours <= 24);

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_project_type ON projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_pm1 ON projects(project_manager_1_id);
CREATE INDEX IF NOT EXISTS idx_projects_pm2 ON projects(project_manager_2_id);

-- Step 5: Update existing projects to be 'simple' type (already default)
UPDATE projects SET project_type = 'simple' WHERE project_type IS NULL;

-- Step 6: Add comments for documentation
COMMENT ON COLUMN projects.project_type IS 'Type of project: simple (daily working) or planned (cost-based with planning sheet)';
COMMENT ON COLUMN projects.daily_working_hours IS 'Default daily working hours for Type A projects (simple)';
COMMENT ON COLUMN projects.project_manager_1_id IS 'Primary project manager';
COMMENT ON COLUMN projects.project_manager_2_id IS 'Secondary project manager (optional)';

-- Step 7: Grant permissions (if needed)
-- Already covered by existing RLS policies

