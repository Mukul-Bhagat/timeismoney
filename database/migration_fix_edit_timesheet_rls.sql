-- Migration Part 2: Create RLS Policy for Edit Timesheet Feature
-- This allows users to change status from SUBMITTED/APPROVED to RESUBMITTED
-- 
-- IMPORTANT: Run migration_add_timesheet_status_enum_values.sql FIRST
-- Wait for it to complete successfully, then run this file
--
-- PostgreSQL requires enum values to be committed in a separate transaction
-- before they can be used in policies. This is why we split into two files.

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS "Users can edit their submitted/approved timesheets" ON timesheets;

-- Create policy to allow editing SUBMITTED/APPROVED timesheets
-- This policy allows users to change their own timesheet status from SUBMITTED or APPROVED to RESUBMITTED
CREATE POLICY "Users can edit their submitted/approved timesheets"
  ON timesheets
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status IN ('SUBMITTED', 'APPROVED')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'RESUBMITTED'
  );

-- Note: This policy works alongside the existing "Users can update their own editable timesheets" policy
-- The backend uses service role key which bypasses RLS, but this policy ensures the transition is allowed
-- for cases where RLS is enforced or for direct database access.
