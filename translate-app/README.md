# Translate App

Front-end translation app built with **Vite + React**, using the **Sarvam.ai** translation API. Supports 22+ Indian languages and English.

## Setup

1. **Get a Sarvam.ai API key**  
   Sign up at [dashboard.sarvam.ai](https://dashboard.sarvam.ai/) and create an API key.

2. **Install dependencies**
   ```bash
   cd translate-app
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your API key:
   ```
   VITE_SARVAM_API_KEY=your_actual_api_key
   ```

4. **Run the app**
   ```bash
   npm run dev
   ```
   Open the URL shown in the terminal (e.g. http://localhost:5173).

## Usage

- Enter or paste text (max 2000 characters).
- Choose **From** (source) and **To** (target) languages. Use **Auto-detect** for source when you’re not sure.
- Click **Translate** to see the result below.

## Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. Click **Add New…** → **Project** and import your `mern_projects` repo (or the repo that contains `translate-app`).
3. Configure the project:
   - **Root Directory:** Click **Edit**, select `translate-app`, then **Continue**.
   - **Framework Preset:** Vite (should be auto-detected).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** `dist` (default).
4. **Environment variable:** In **Environment Variables**, add:
   - **Name:** `VITE_SARVAM_API_KEY`
   - **Value:** your Sarvam.ai API key  
   Add it for Production (and optionally Preview/Development).
5. Click **Deploy**. When the build finishes, open the generated URL.

Your app will be live at `https://your-project.vercel.app`. New pushes to the connected branch will trigger automatic redeploys.

## Security note

The API key is used in the browser via `VITE_SARVAM_API_KEY`. For production, prefer a small backend that holds the key and proxies requests to Sarvam.ai so the key is never exposed in client-side code.

## Tech

- [Vite](https://vitejs.dev/) + [React](https://react.dev/)
- [Sarvam.ai Translation API](https://docs.sarvam.ai/api-reference-docs/text/translate-text)
