# Live Stock

Stock tracking app with Zerodha Kite Connect integration for Indian and US markets. Features live quotes, AI analysis (Groq), and optional auto-trading.

## Requirements

- **Node.js** >= 18
- **npm** (comes with Node)

## Setup on a New Machine

### 1. Clone the Repository

```bash
git clone <your-repo-url> live-stock
cd live-stock
```

### 2. Install Dependencies

```bash
npm install
cd client && npm install && cd ..
```

### 3. Environment Variables

Copy the example env file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your values. Minimum required:

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | API key from [Groq Console](https://console.groq.com) for AI analysis |
| `PORT` | No | Server port (default: 3001) |
| `KITE_API_KEY` | For Kite | Zerodha app API key from [kite.trade](https://kite.trade/) |
| `KITE_API_SECRET` | For Kite | Zerodha app secret |
| `KITE_ACCESS_TOKEN` | For Kite | Daily token (see below) |
| `AUTO_TRADE_QUANTITY` | No | Shares per stock (default: 1) |
| `AUTO_TRADE_DRY_RUN` | No | `true` = no real orders, `false` = place real orders |
| `AUTO_TRADE_CRON` | No | `true` = enable daily cron at 9:20 AM IST (Mon–Fri) |

### 4. Zerodha Kite Connect (Optional)

If you want to place orders via Zerodha:

1. Register an app at [kite.trade](https://kite.trade/) and get API key & secret.
2. Add `KITE_API_KEY` and `KITE_API_SECRET` to `.env`.
3. Generate a daily access token:
   ```bash
   # Open this URL in browser, login, then copy request_token from redirect URL:
   # https://kite.zerodha.com/connect/login?api_key=YOUR_API_KEY&v=3
   npm run kite-login <request_token>
   ```
4. Add the printed `KITE_ACCESS_TOKEN` to `.env`. Regenerate daily (token expires at market close).

### 5. Run Development Servers

```bash
npm run dev
```

- **Backend:** http://localhost:3001  
- **Frontend:** http://localhost:5177  

Open the frontend URL in your browser.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + frontend (concurrently) |
| `npm run server` | Backend only (port 3001) |
| `npm run client` | Frontend only (port 5177) |
| `npm run build` | Build client for production |
| `npm run start` | Build + run production server |
| `npm run kite-login <token>` | Generate Zerodha access token |

---

## Access from Another Device

The server binds to `0.0.0.0` by default. To use the app from another device on the same network:

1. Find your machine's IP (e.g. `10.69.115.227`).
2. Open `http://<your-ip>:5177` in the browser on the other device.
3. If API calls fail, set in `.env`:
   ```bash
   VITE_API_HOST=<your-ip>
   ```
   Then restart the dev server.

---

## Project Structure

```
live-stock/
├── server/
│   ├── index.js       # Express API, Kite routes, cron
│   ├── autoTrade.js   # Auto-trade logic
│   └── kite-login.js  # Access token generator
├── client/
│   ├── src/
│   │   ├── main.tsx   # React entry point
│   │   ├── App.tsx    # Main app + UI components
│   │   ├── App.css    # All styles
│   │   └── index.css  # Global styles
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
├── .env               # Your secrets (create from .env.example)
├── .env.example
└── package.json
```

---

## UI Components & Tech Stack

### Frontend Stack

| Tech | Version | Purpose |
|------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 5.9.x | Type safety |
| Vite | 7.x | Build tool & dev server |

### Component Structure

The UI is built in a single-file architecture. All components live in `client/src/App.tsx`:

| Component | Description |
|-----------|-------------|
| `App` | Root component: state, API calls, layout |
| `StockItem` | Expandable stock row with fundamentals, chart, pros/cons tabs |
| `StockListSection` | Renders list of `StockItem` with filters |

### Key UI Elements

- **Header** – Title, Buy button, My Orders, market/segment/limit pickers, refresh, sort
- **Stock list** – Expandable rows with checkbox for buy selection
- **Stock detail** – Tabs: Fundamentals, Chart (7D/1M/1Y/3Y/5Y), Pros & Cons (AI)
- **Modals** – Trade confirm, My Orders (Kite orders + History), Settings (Kite API keys)
- **Settings** – API Key, Secret Key, Request Token (edit/save per field), access token generation

### Styling

- **App.css** – All component styles (no CSS-in-JS or component library)
- **index.css** – Global reset, body font (DM Sans), base colors
- Layout: max-width 600px, sticky header, safe-area insets for notched devices

### Adding or Modifying UI

1. Edit `client/src/App.tsx` for components and logic.
2. Edit `client/src/App.css` for styles.
3. Use Cursor to add features or refactor; the single-file structure keeps context in one place.

---

## Using Cursor

Open the `live-stock` folder in Cursor. You can:

- Run `npm run dev` from the integrated terminal.
- Use Cursor’s AI to edit code, add features, or debug.
- Keep `.env` out of version control (it’s in `.gitignore`).
