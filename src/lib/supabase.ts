import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // Create a dummy client for build time - will show error in UI
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
}

export { supabase };
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);
