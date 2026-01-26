# Frontend Deployment Guide for Vercel

## Prerequisites

1. Backend deployed on Render (or another hosting service)
2. Supabase project set up
3. Vercel account

## Environment Variables

Before deploying to Vercel, you need to set the following environment variables in your Vercel project settings:

### Required Environment Variables:

1. **VITE_API_BASE_URL**
   - **Local Development**: `http://localhost:5000`
   - **Production**: Your Render backend URL (e.g., `https://your-backend.onrender.com`)
   - **Important**: Do NOT include a trailing slash

2. **VITE_SUPABASE_URL**
   - Your Supabase project URL
   - Format: `https://your-project-id.supabase.co`

3. **VITE_SUPABASE_ANON_KEY**
   - Your Supabase anonymous/public key
   - Found in: Supabase Dashboard → Settings → API

## Deployment Steps

### 1. Prepare Your Code

1. Make sure all changes are committed to your Git repository
2. Ensure `package.json` has the correct build script: `"build": "tsc -b && vite build"`

### 2. Deploy to Vercel

#### Option A: Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New Project"
3. Import your Git repository
4. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend` (if your frontend is in a subdirectory)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables:
   - Go to "Environment Variables" section
   - Add all three variables listed above
   - Make sure to set them for **Production**, **Preview**, and **Development** environments
6. Click "Deploy"

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to frontend directory
cd frontend

# Login to Vercel
vercel login

# Deploy
vercel

# Set environment variables
vercel env add VITE_API_BASE_URL
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY

# Deploy to production
vercel --prod
```

### 3. Update CORS on Backend

Make sure your Render backend has CORS configured to allow your Vercel frontend URL:

In `backend/src/server.ts`, update the CORS origin:

```typescript
app.use(
  cors({
    origin: [
      "http://localhost:5173", // local development
      "https://your-vercel-app.vercel.app" // your Vercel URL
    ],
    credentials: true
  })
);
```

### 4. Verify Deployment

1. After deployment, visit your Vercel URL
2. Check the browser console for any errors
3. Test API connectivity by logging in or accessing protected routes

## Local Development

For local development, create a `.env` file in the `frontend` directory:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

**Note**: Never commit the `.env` file to Git. Only commit `.env.example`.

## Troubleshooting

### Network Errors

If you see "Network Error" or "ERR_CONNECTION_REFUSED":
- Check that `VITE_API_BASE_URL` is set correctly in Vercel
- Verify your Render backend is running and accessible
- Check CORS configuration on the backend

### Build Errors

If the build fails:
- Check that all dependencies are in `package.json`
- Verify TypeScript compilation: `npm run build`
- Check Vercel build logs for specific errors

### Environment Variables Not Working

- Vite requires environment variables to start with `VITE_`
- After adding env vars in Vercel, you need to redeploy
- Check that variables are set for the correct environment (Production/Preview/Development)

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Render Documentation](https://render.com/docs)

