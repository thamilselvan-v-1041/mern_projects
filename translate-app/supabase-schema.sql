-- Translation History Table Schema for Supabase
-- Run this SQL in your Supabase SQL Editor (https://supabase.com/dashboard)

-- Create the translation_history table
CREATE TABLE IF NOT EXISTS translation_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_language_code VARCHAR(10) NOT NULL,
  target_language_code VARCHAR(10) NOT NULL,
  detected_language_code VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create an index on created_at for faster queries when fetching history
CREATE INDEX IF NOT EXISTS idx_translation_history_created_at ON translation_history(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE translation_history ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (you can customize this based on your needs)
-- Option 1: Allow all operations for authenticated users only
-- CREATE POLICY "Allow all for authenticated users" ON translation_history
--   FOR ALL USING (auth.role() = 'authenticated');

-- Option 2: Allow all operations for everyone (for public access)
CREATE POLICY "Allow all operations" ON translation_history
  FOR ALL USING (true) WITH CHECK (true);

-- Optional: Create a function to automatically clean up old translations (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_translations()
RETURNS void AS $$
BEGIN
  DELETE FROM translation_history
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Optional: Schedule the cleanup function (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-old-translations', '0 2 * * *', 'SELECT cleanup_old_translations()');
