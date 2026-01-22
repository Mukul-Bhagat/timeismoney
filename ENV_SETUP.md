# Supabase Environment Variables Setup

## 📍 Where to Find Your Supabase Credentials

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Go to **Settings** → **API**
4. You'll find:
   - **Project URL** (this is your `SUPABASE_URL`)
   - **anon/public key** (for frontend - safe to expose)
   - **service_role key** (for backend - NEVER expose to frontend!)

---

## 🔐 Backend Environment Variables

**File:** `backend/.env`

```env
PORT=5000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**⚠️ Important:**
- Use `SUPABASE_SERVICE_ROLE_KEY` (NOT anon key)
- This key has admin privileges - keep it secret!
- Never commit this file to git (already in .gitignore)

**Usage:** Used in `backend/src/config/supabase.ts` for server-side operations

---

## 🌐 Frontend Environment Variables

**File:** `frontend/.env` or `frontend/.env.local`

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**⚠️ Important:**
- Must use `VITE_` prefix for Vite to expose them to the browser
- Use `SUPABASE_ANON_KEY` (public key, safe for client-side)
- This key is exposed in the browser, so it's safe to use publicly

**Usage:** Used in `frontend/src/config/supabase.ts` for client-side operations

---

## 🔑 Key Differences

| | Frontend | Backend |
|---|---|---|
| **Key Type** | `anon/public` key | `service_role` key |
| **Prefix** | `VITE_` required | No prefix needed |
| **Security** | Safe to expose | Must be secret |
| **Access** | Limited by RLS policies | Bypasses RLS (admin) |
| **File** | `frontend/.env` | `backend/.env` |

---

## 📝 Quick Setup Steps

1. **Get your Supabase credentials** from the dashboard
2. **Create `backend/.env`** with your service role key
3. **Create `frontend/.env`** with your anon key (with VITE_ prefix)
4. **Install Supabase client in frontend** (if not already):
   ```bash
   cd frontend
   npm install @supabase/supabase-js
   ```

---

## 🚨 Security Notes

- ✅ **Frontend anon key**: Safe to expose, protected by Row Level Security (RLS)
- ❌ **Backend service_role key**: NEVER expose to frontend or commit to git
- ✅ Both `.env` files are already in `.gitignore`

