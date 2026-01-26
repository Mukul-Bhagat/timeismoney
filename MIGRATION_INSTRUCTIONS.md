# Migration Instructions - Per-Row Customer Rate

## IMPORTANT: Run Database Migration First

Before using the new per-row customer rate feature, you **MUST** run the database migration:

### Step 1: Run the Migration

1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `database/migration_add_customer_rate_per_row.sql`
4. Click "Run" to execute the migration

This migration will:
- Add `customer_rate_per_hour` column to `project_role_allocations` table
- Copy existing global customer rates to all allocation rows
- Create an index for performance

### Step 2: Verify Migration Success

After running the migration, verify it worked:
- Check that the `project_role_allocations` table now has a `customer_rate_per_hour` column
- Existing allocations should have their customer rates populated from the global rate

### Step 3: Test the Feature

1. Open a project's planning sheet
2. You should now see two new columns:
   - **Customer Rate (₹/hr)** - Editable per row
   - **Customer Amount (₹)** - Auto-calculated per row
3. Try saving a draft - it should work without errors
4. Try finalizing setup - it should create project members and timesheets

## Troubleshooting

### Error: "Failed to save draft" (500 error)

**Cause**: The migration hasn't been run yet, so the `customer_rate_per_hour` column doesn't exist.

**Solution**: Run the migration file `database/migration_add_customer_rate_per_row.sql` in Supabase SQL Editor.

### Error: "Database migration not run"

**Cause**: The backend detected that the column is missing.

**Solution**: Run the migration as described above.

## After Finalizing Setup

When you finalize a Type B (planned) project setup:
1. **Project Members** are automatically created from allocations
2. **Timesheets** are automatically created for each employee
3. Employees can now see the project in their Timesheet page and start logging hours

## Notes

- The global `customer_rate_per_hour` in `project_setups` is kept for backward compatibility
- New rows default to the global rate, but can be overridden per row
- All calculations are done client-side for fast Excel-like editing
- Customer amounts are calculated per row: `Total Hours × Customer Rate`

