# Quick Start: Supabase Cloud Account Setup

Follow these steps to set up your Supabase cloud account and configure it for the translate app.

## Step 1: Sign Up for Supabase

1. **Go to Supabase**: Visit [https://supabase.com](https://supabase.com)
2. **Click "Start your project"** or **"Sign Up"** (top right corner)
3. **Choose your sign-up method**:
   - Sign up with GitHub (recommended for developers)
   - Sign up with Email
   - Sign up with Google

## Step 2: Create Your First Project

After signing up, you'll be taken to the dashboard. Click **"New Project"**:

### Project Details:
- **Name**: `translate-app` (or any name you prefer)
- **Database Password**: 
  - Create a strong password (at least 12 characters)
  - **IMPORTANT**: Save this password! You'll need it to connect to the database
  - Example: `MySecurePass123!@#`
- **Region**: Choose the closest region to your users
  - For India: `Southeast Asia (Singapore)` or `South Asia (Mumbai)`
  - For US: `West US (California)` or `East US (Virginia)`
  - For Europe: `West EU (Ireland)` or `Central EU (Frankfurt)`
- **Pricing Plan**: Select **Free** (perfect for getting started)

4. Click **"Create new project"**
5. **Wait 1-2 minutes** for the project to be provisioned

## Step 3: Get Your API Credentials

Once your project is ready:

1. In the left sidebar, click **Settings** (gear icon)
2. Click **API** under Project Settings
3. You'll see two important values:

### Copy These Values:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```
- This is your `VITE_SUPABASE_URL`

**anon public key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4eHh4eHh4eHh4eHh4eHh4eCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjE2MjM5MDIyLCJleHAiOjE5MzE4MTUwMjJ9.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
- This is your `VITE_SUPABASE_ANON_KEY`

## Step 4: Create the Database Table

1. In the left sidebar, click **SQL Editor**
2. Click **"New query"**
3. Copy the entire contents of `supabase-schema.sql` file
4. Paste it into the SQL Editor
5. Click **"Run"** (or press `Cmd+Enter` / `Ctrl+Enter`)
6. You should see: `Success. No rows returned`

### Verify Table Creation:
1. Click **Table Editor** in the left sidebar
2. You should see `translation_history` table
3. Click on it to see the table structure

## Step 5: Configure Your App

1. **Open your `.env` file** in the `translate-app` directory
2. **Add your Supabase credentials**:

```env
# Your existing Sarvam API key
VITE_SARVAM_API_KEY=sk_y1bg4wgd_Mux2ThLDwcssErLiBr0fWDdm

# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Replace:**
- `your-project-id` with your actual project ID from Step 3
- `your_anon_key_here` with your actual anon key from Step 3

## Step 6: Install Supabase Client

Run this command in your terminal:

```bash
cd translate-app
npm install @supabase/supabase-js
```

## Step 7: Test the Integration

1. **Start your dev server**:
   ```bash
   npm run dev
   ```

2. **Translate some text** in your app

3. **Check Supabase**:
   - Go to Supabase dashboard → **Table Editor** → `translation_history`
   - You should see your translation saved!

## Troubleshooting

### "Invalid API key" error
- Double-check your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
- Make sure you copied the **anon/public** key, not the service_role key
- Restart your dev server after changing `.env`

### "relation does not exist" error
- Make sure you ran the SQL schema in Step 4
- Check that the table `translation_history` exists in Table Editor

### Translations not saving
- Check browser console for errors
- Verify RLS policies are set correctly (should allow all operations for now)
- Check Supabase dashboard → **Logs** for API errors

### Can't find Settings/API
- Make sure you're logged into the correct Supabase account
- The Settings icon is in the bottom left sidebar

## What's Next?

Once set up, every translation will automatically be saved to Supabase! You can:
- View all translations in Supabase Table Editor
- Build a history UI to show past translations
- Add user authentication for personalized history
- Export translations to CSV/JSON

## Need Help?

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Check `SUPABASE_SETUP.md` for more detailed information
