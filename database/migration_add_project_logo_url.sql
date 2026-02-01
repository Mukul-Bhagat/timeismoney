-- Migration: Add project_logo_url column to projects table
-- Run this SQL in your Supabase SQL Editor
-- This migration adds support for project logos

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS project_logo_url TEXT;

-- Add comment to document the column
COMMENT ON COLUMN projects.project_logo_url IS 'Public URL to the project logo stored in Supabase Storage (project-logos bucket)';
