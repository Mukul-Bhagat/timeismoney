# Database Setup Instructions

## Issue
The `timesheets` table is missing from your Supabase database, causing the error:
```
Could not find the table 'public.timesheets' in the schema cache
```

## Solution: Run Database Migrations

You need to run the migration SQL files in your Supabase SQL Editor in the correct order.

### Step-by-Step Instructions:

1. **Go to Supabase Dashboard**
   - Open https://app.supabase.com
   - Select your project
   - Go to **SQL Editor** (left sidebar)

2. **Run Migrations in This Order:**

   **Migration 1: Core Schema** (if not already done)
   - Open `database/schema.sql`
   - Copy all SQL
   - Paste in SQL Editor
   - Click **Run** (or press Ctrl+Enter)

   **Migration 2: Roles System** (if not already done)
   - Open `database/migration_roles_system.sql`
   - Copy all SQL
   - Paste in SQL Editor
   - Click **Run**

   **Migration 3: Projects System** (if not already done)
   - Open `database/migration_projects_system.sql`
   - Copy all SQL
   - Paste in SQL Editor
   - Click **Run**

   **Migration 4: Timesheet System** ⚠️ **THIS IS THE ONE YOU NEED**
   - Open `database/migration_timesheet_system.sql`
   - Copy all SQL
   - Paste in SQL Editor
   - Click **Run**
   - This creates:
     - `timesheet_status` enum type
     - `timesheets` table
     - `timesheet_entries` table
     - Indexes, triggers, and RLS policies

   **Migration 5: Approval System** (if not already done)
   - Open `database/migration_approval_system.sql`
   - Copy all SQL
   - Paste in SQL Editor
   - Click **Run**

3. **Verify Tables Were Created**
   - In Supabase Dashboard, go to **Table Editor**
   - You should see:
     - `timesheets` table
     - `timesheet_entries` table

4. **Restart Backend Server**
   - Stop the backend server (Ctrl+C)
   - Start it again: `cd backend && npm run dev`

5. **Test the Application**
   - Refresh the timesheet page
   - The error should be gone!

## Quick Fix (Just Timesheet Table)

If you only need to create the timesheet tables right now:

1. Go to Supabase SQL Editor
2. Copy the entire contents of `database/migration_timesheet_system.sql`
3. Paste and Run
4. Restart backend server
5. Refresh frontend

## Troubleshooting

- **Error: "type timesheet_status already exists"**
  - The enum already exists, skip that line or use `CREATE TYPE IF NOT EXISTS`
  
- **Error: "table timesheets already exists"**
  - The table already exists, the migration uses `CREATE TABLE IF NOT EXISTS` so it's safe to run again

- **Error: "relation projects does not exist"**
  - You need to run `migration_projects_system.sql` first

- **After running migration, still getting errors**
  - Restart the backend server
  - Clear browser cache
  - Check Supabase logs for any errors

