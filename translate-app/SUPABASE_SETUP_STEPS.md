# Supabase Setup - Step 3 & 4

## Step 3: Run SQL Query in Supabase

1. Go to: https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh/sql/new
2. Click "New query" if not already open
3. **Copy and paste this EXACT SQL query:**

```sql
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

-- Create a policy to allow all operations (for public access)
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
```

4. Click **"Run"** button (or press `Cmd+Enter` / `Ctrl+Enter`)
5. You should see: **"Success. No rows returned"**

### Verify Table Creation:
- Go to: https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh/editor
- You should see `translation_history` table in the list
- Click on it to see the table structure

---

## Step 4: Verify .env File

Your `.env` file should contain:

```env
VITE_SARVAM_API_KEY=sk_y1bg4wgd_Mux2ThLDwcssErLiBr0fWDdm

# Supabase Configuration
VITE_SUPABASE_URL=https://lsnflwkkppvdokhuunbh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzbmZsd2trcHB2ZG9raHV1bmJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyODMzNzEsImV4cCI6MjA4NTg1OTM3MX0.5NtPigj0lxm_--JSkRNvLOgWKdgR0iIAt2SeGfwMtHU
```

**Location:** `/Users/thamil-1041/Documents/GitHub/mern_projects/translate-app/.env`

**Note:** The `.env` file is already updated with your credentials. Just verify it matches the above.

---

## Step 5: Install Supabase Client

Run this command:

```bash
cd /Users/thamil-1041/Documents/GitHub/mern_projects/translate-app
npm install @supabase/supabase-js
```

---

## Step 6: Test

1. **Restart your dev server:**
   ```bash
   npm run dev
   ```

2. **Translate some text** in your app

3. **Check Supabase:**
   - Go to: https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh/editor
   - Click on `translation_history` table
   - You should see your translation saved!

---

## Quick Links

- **SQL Editor:** https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh/sql/new
- **Table Editor:** https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh/editor
- **Project Dashboard:** https://supabase.com/dashboard/project/lsnflwkkppvdokhuunbh
