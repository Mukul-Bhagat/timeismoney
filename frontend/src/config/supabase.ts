import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ MISSING');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ MISSING');
  console.error('');
  console.error('📝 To fix this:');
  console.error('1. Create frontend/.env file');
  console.error('2. Add: VITE_SUPABASE_URL=https://your-project.supabase.co');
  console.error('3. Add: VITE_SUPABASE_ANON_KEY=your-anon-key');
  console.error('4. Restart the dev server');
  console.error('');
  // Create a dummy client to prevent crashes, but it won't work
  console.warn('⚠️ Using placeholder Supabase client - authentication will not work!');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

