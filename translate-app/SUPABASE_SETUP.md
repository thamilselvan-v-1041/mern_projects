# Supabase Setup Guide for Translation History

This guide will help you set up Supabase to save translation history for your translate app.

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details:
   - **Name**: translate-app (or your preferred name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose the closest region to your users
5. Click "Create new project"
6. Wait for the project to be set up (takes 1-2 minutes)

## Step 2: Get Your Supabase Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (this is your `VITE_SUPABASE_URL`)
   - **anon/public key** (this is your `VITE_SUPABASE_ANON_KEY`)

## Step 3: Create the Database Table

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy and paste the contents of `supabase-schema.sql`
4. Click "Run" (or press Cmd/Ctrl + Enter)
5. Verify the table was created by going to **Table Editor** → you should see `translation_history`

## Step 4: Configure Environment Variables

1. Copy `.env.example` to `.env` (if you haven't already):
   ```bash
   cp .env.example .env
   ```

2. Add your Supabase credentials to `.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
   ```

3. **Important**: Make sure `.env` is in your `.gitignore` file (it should be already)

## Step 5: Install Supabase Client

Run this command in your project directory:
```bash
npm install @supabase/supabase-js
```

## Step 6: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Translate some text in the app
3. Check your Supabase dashboard → **Table Editor** → `translation_history`
4. You should see the translation saved in the database!

## Troubleshooting

### Translations are not being saved

1. **Check browser console** for any errors
2. **Verify environment variables** are set correctly:
   - Make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are in your `.env` file
   - Restart your dev server after adding environment variables
3. **Check Supabase dashboard** → **Logs** for any API errors
4. **Verify RLS policies** - Make sure the policy allows INSERT operations

### RLS Policy Issues

If you're getting permission errors, you can temporarily disable RLS for testing:
```sql
ALTER TABLE translation_history DISABLE ROW LEVEL SECURITY;
```

**Note**: Re-enable RLS and set up proper policies before deploying to production!

## Security Best Practices

1. **Never commit** your `.env` file to git
2. **Use RLS policies** to control who can access translation history
3. **Consider authentication** if you want user-specific translation history
4. **Set up proper CORS** in Supabase dashboard if deploying to production

## Next Steps (Optional)

- Add a UI to view translation history
- Add user authentication to save user-specific translations
- Add pagination for large history lists
- Add search/filter functionality
- Add export functionality (CSV, JSON)
