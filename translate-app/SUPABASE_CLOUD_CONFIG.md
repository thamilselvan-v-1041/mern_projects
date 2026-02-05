# Supabase Cloud Configuration

This application is configured to connect to **Supabase Cloud Server**, not a local database.

## Cloud Connection Details

### Current Configuration
- **Cloud URL**: `https://lsnflwkkppvdokhuunbh.supabase.co`
- **Connection Type**: HTTPS (secure cloud connection)
- **Database**: PostgreSQL (hosted on Supabase cloud)
- **Region**: Cloud-hosted (managed by Supabase)

### Environment Variables

Your `.env` file contains the cloud Supabase credentials:

```env
VITE_SUPABASE_URL=https://lsnflwkkppvdokhuunbh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## How It Works

1. **Client-Side Connection**: The app uses `@supabase/supabase-js` client library
2. **Cloud API**: All requests go directly to Supabase cloud REST API
3. **No Local Database**: There is no local PostgreSQL or database server required
4. **Secure Connection**: All connections use HTTPS to Supabase cloud servers

## Verification

When the app starts, check the browser console for:
- ✅ `Connected to Supabase cloud server: https://lsnflwkkppvdokhuunbh.supabase.co`
- ✅ `Translation saved to cloud Supabase database` (after translating)

## Benefits of Cloud Supabase

1. **No Local Setup**: No need to install PostgreSQL locally
2. **Scalable**: Automatically scales with your usage
3. **Secure**: Managed security and backups
4. **Accessible**: Access your data from anywhere
5. **Real-time**: Built-in real-time capabilities
6. **Free Tier**: Generous free tier for development

## Troubleshooting

### Connection Issues

If you see warnings about missing configuration:
1. Check `.env` file has correct cloud URL (not localhost)
2. Verify the URL starts with `https://` (cloud) not `http://localhost`
3. Restart dev server after changing `.env`

### Verify Cloud Connection

1. Open browser DevTools → Console
2. Look for connection messages
3. Check Network tab → Filter by "supabase" → See requests to cloud URL

## Important Notes

- **Never commit** `.env` file to git (contains sensitive keys)
- **Cloud URL** should always start with `https://` and end with `.supabase.co`
- **Local development** still connects to cloud - no local database needed
- **Production** uses the same cloud database

## Database Location

Your database is hosted on Supabase cloud infrastructure:
- **Host**: `db.lsnflwkkppvdokhuunbh.supabase.co`
- **Port**: 5432 (PostgreSQL)
- **Access**: Via Supabase API (not direct PostgreSQL connection from frontend)

The frontend uses the Supabase REST API, which handles all database operations securely.
