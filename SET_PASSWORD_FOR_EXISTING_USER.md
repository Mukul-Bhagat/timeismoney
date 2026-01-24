# How to Set Password for Existing Users

If you have existing users in your database who don't have `password_hash` set, you need to set their passwords.

## Option 1: Use the Admin Panel (Recommended)

1. Log in as SUPER_ADMIN or ADMIN
2. Go to "Manage Users" page
3. Create a new password for the user (this will set password_hash)

## Option 2: SQL Script (For Super Admin)

Run this SQL in Supabase SQL Editor to set a password for a user:

```sql
-- Replace 'user@example.com' with the actual email
-- Replace 'YourNewPassword123!' with the desired password
-- This will hash the password using bcrypt (you'll need to hash it first)

-- First, you need to hash the password using Node.js:
-- In backend directory, run: node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YourNewPassword123!', 10).then(hash => console.log(hash));"

-- Then update the user:
UPDATE users 
SET password_hash = 'PASTE_HASHED_PASSWORD_HERE'
WHERE email = 'user@example.com';
```

## Option 3: Create New User with Password

If the user doesn't exist yet, create them through the admin panel - they will automatically get password_hash set.

## Quick Test: Create a Test User

You can create a test user via the backend API (if you have admin access):

```bash
# First, get a JWT token by logging in as admin
# Then create a user:
curl -X POST http://localhost:5000/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "organization_id": "YOUR_ORG_ID"
  }'
```

