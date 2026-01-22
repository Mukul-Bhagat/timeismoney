# 🔐 Supabase Environment Variables Guide

## 📋 Summary: What You Need

### Backend (`backend/.env`)
```env
PORT=5000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Frontend (`frontend/.env`)
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🎯 Where to Find These Values

1. **Go to:** https://app.supabase.com
2. **Select your project**
3. **Navigate to:** Settings → API
4. **Copy:**
   - **Project URL** → Use for both `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - **anon public** key → Use for `VITE_SUPABASE_ANON_KEY` (frontend)
   - **service_role** key → Use for `SUPABASE_SERVICE_ROLE_KEY` (backend)

---

## 📁 File Locations

### Backend
- **File:** `backend/.env`
- **Used in:** `backend/src/config/supabase.ts`
- **Key type:** `service_role` (admin access)

### Frontend
- **File:** `frontend/.env` or `frontend/.env.local`
- **Used in:** `frontend/src/config/supabase.ts`
- **Key type:** `anon` (public, safe to expose)
- **⚠️ Must use `VITE_` prefix** for Vite to expose variables

---

## 🔄 Installation Required

**Frontend needs Supabase client:**
```bash
cd frontend
npm install @supabase/supabase-js
```

---

## ⚠️ Security Reminders

- ✅ **Frontend anon key**: Safe to expose in browser
- ❌ **Backend service_role key**: NEVER expose - it bypasses all security!
- ✅ Both `.env` files are in `.gitignore` (won't be committed)

---

## 🚀 After Setup

1. Create both `.env` files with your actual Supabase credentials
2. Install Supabase in frontend: `npm install @supabase/supabase-js`
3. Restart your dev servers to load environment variables

