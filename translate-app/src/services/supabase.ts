import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Get Supabase cloud server credentials from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validate cloud Supabase configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase cloud configuration missing. Translation history will not be saved.');
  console.warn('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file');
} else {
  // Verify it's a cloud URL (not localhost)
  if (supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1')) {
    console.warn('⚠️ Warning: Supabase URL appears to be local. Make sure you are using the cloud Supabase URL.');
  } else {
    console.log('✅ Connected to Supabase cloud server:', supabaseUrl);
  }
}

// Create Supabase client for cloud database connection
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // We don't need session persistence for this app
    autoRefreshToken: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: {
      'x-client-info': 'translate-app@0.0.1',
    },
  },
});

// Translation history type
export interface TranslationHistory {
  id?: string;
  source_text: string;
  translated_text: string;
  source_language_code: string;
  target_language_code: string;
  detected_language_code?: string;
  created_at?: string;
}
