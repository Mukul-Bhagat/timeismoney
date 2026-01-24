# How to Set Passwords for All Existing Users

You don't need to delete old organizations! Just set passwords for existing users.

## Option 1: Set Password for Individual Users (Recommended)

Use the setPassword script for each user:

```bash
cd backend
npx ts-node src/utils/setPassword.ts <email> "<password>"
```

**Examples:**
```bash
# Set password for super admin
npx ts-node src/utils/setPassword.ts supermukul@timesheet.com "attend#321"

# Set password for any other user
npx ts-node src/utils/setPassword.ts user@example.com "password123"
```

## Option 2: Bulk Set Passwords via SQL (Advanced)

If you have many users, you can use SQL to set passwords in bulk:

1. **First, generate password hashes** for each password you want to use:
   ```bash
   cd backend
   node -e "const bcrypt = require('bcrypt'); bcrypt.hash('password123', 10).then(hash => console.log(hash));"
   ```

2. **Then update users in Supabase SQL Editor:**
   ```sql
   -- Update specific user
   UPDATE users 
   SET password_hash = 'PASTE_HASHED_PASSWORD_HERE'
   WHERE email = 'user@example.com';

   -- Or update all users in an organization (use same password for all)
   UPDATE users 
   SET password_hash = 'PASTE_HASHED_PASSWORD_HERE'
   WHERE organization_id = 'YOUR_ORG_ID';
   ```

## Option 3: Create New Users (They Auto-Get Passwords)

New users created via:
- `/api/users` (admin creates user)
- `/api/organizations` (creates org + admin user)

These will automatically have `password_hash` set, so they can login immediately.

## What About Old Organizations?

✅ **Keep them!** They work fine once users have passwords set.

- Organizations don't need passwords
- Only users need `password_hash` to login
- Set passwords for users who need to login
- Old organizations continue to work normally

## Quick Checklist:

1. ✅ Keep existing organizations (no need to delete)
2. ✅ Set passwords for users who need to login
3. ✅ New users created will automatically have passwords
4. ✅ Old data (projects, timesheets, etc.) remains intact

## Testing:

After setting passwords, users can login with:
- Email: their email address
- Password: the password you set

No need to recreate organizations or lose any data!

