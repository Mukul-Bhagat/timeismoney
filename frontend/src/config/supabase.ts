import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate URL format
const isValidSupabaseUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.endsWith('.supabase.co') && urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ MISSING');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ MISSING');
  console.error('');
  console.error('📝 To fix this:');
  console.error('1. Go to https://app.supabase.com');
  console.error('2. Select your project → Settings → API');
  console.error('3. Copy the Project URL and anon key');
  console.error('4. Create frontend/.env file with:');
  console.error('   VITE_SUPABASE_URL=https://your-project-id.supabase.co');
  console.error('   VITE_SUPABASE_ANON_KEY=your-anon-key');
  console.error('5. Restart the dev server');
  console.error('');
  console.warn('⚠️ Using placeholder Supabase client - authentication will not work!');
} else if (!isValidSupabaseUrl(supabaseUrl)) {
  console.error('❌ Invalid Supabase URL format!');
  console.error('Current URL:', supabaseUrl);
  console.error('');
  console.error('📝 The URL must be:');
  console.error('   - Format: https://your-project-id.supabase.co');
  console.error('   - Must start with https://');
  console.error('   - Must end with .supabase.co');
  console.error('');
  console.error('🔍 To get the correct URL:');
  console.error('1. Go to https://app.supabase.com');
  console.error('2. Select your project');
  console.error('3. Go to Settings → API');
  console.error('4. Copy the "Project URL" exactly as shown');
  console.error('5. Update frontend/.env and restart the dev server');
  console.error('');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

