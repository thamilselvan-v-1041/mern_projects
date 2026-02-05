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

## Security note

The API key is used in the browser via `VITE_SARVAM_API_KEY`. For production, prefer a small backend that holds the key and proxies requests to Sarvam.ai so the key is never exposed in client-side code.

## Tech

- [Vite](https://vitejs.dev/) + [React](https://react.dev/)
- [Sarvam.ai Translation API](https://docs.sarvam.ai/api-reference-docs/text/translate-text)
