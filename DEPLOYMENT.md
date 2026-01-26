# Deployment Guide

## Environment Variables

### Backend (Render)

Set these in your Render dashboard under "Environment":

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# CORS Configuration (comma-separated list)
# Include all frontend URLs that should be allowed
CORS_ORIGINS=http://localhost:5173,https://timeismoney-nbfm.onrender.com
```

### Frontend (Vercel/Render)

Set this in your deployment platform's environment variables:

```bash
# API Base URL - Point to your Render backend
VITE_API_BASE_URL=https://your-backend.onrender.com
```

## CORS Configuration

The backend CORS is configured to allow requests from:
- `http://localhost:5173` (local development)
- `https://timeismoney-nbfm.onrender.com` (production frontend)

You can customize this by setting the `CORS_ORIGINS` environment variable in your backend.

## Quick Test

After deploying, test your backend:

1. **Check if backend is live:**
   ```
   https://your-backend.onrender.com/api/auth/login
   ```
   
   Expected responses:
   - JSON response ✅ (backend is working)
   - Method not allowed ✅ (backend is working, just wrong method)
   - 404 or timeout ❌ (backend not deployed correctly)

2. **Test CORS:**
   Open browser console on your frontend and check for CORS errors when making API calls.

## Deployment Checklist

- [ ] Backend deployed on Render
- [ ] Frontend deployed on Vercel/Render
- [ ] `CORS_ORIGINS` set in backend environment variables
- [ ] `VITE_API_BASE_URL` set in frontend environment variables
- [ ] Backend health check passes
- [ ] Frontend can make API calls without CORS errors

