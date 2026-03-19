# Live Stock — Full Project Rebuild Prompt

Use this prompt in a **new Cursor workspace** (or different account) to recreate the entire **live-stock** project from scratch. Paste the entire content below into Cursor and ask it to generate the complete codebase.

---

## PROMPT (Copy everything below this line)

---

You are a senior full-stack developer. Create the complete **Live Stock** application from scratch in a new folder called `live-stock`. Generate ALL source code—no placeholders, no pseudo-code, no "implement later." Every file must be executable and complete.

---

## PROJECT OVERVIEW

**Live Stock** is a stock tracking web app for Indian (NSE) and US markets with Zerodha Kite Connect integration. It includes:

- Live stock quotes (India via NSE API + Yahoo Finance fallback; US via Yahoo Finance)
- Expandable stock rows with Fundamentals, Chart (7D/1M/1Y/3Y/5Y), and AI Pros & Cons
- Buy flow: select stocks, confirm, place orders via Zerodha Kite
- My Zerodha modal: Orders, Portfolio, Analyse (AI portfolio analysis), Settings
- Settings: Kite API Key, Secret, Request Token → Generate Access Token (in-memory only, no persistence)
- Auto-trade: optional daily cron to buy top 3 from top 50 losers
- Vercel deployment support (single deployment, API + frontend)

---

## TECH STACK

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| Backend | Node.js, Express 4 |
| Styling | Plain CSS (App.css, index.css), no CSS-in-JS |
| Data | Yahoo Finance 2, NSE API (India), Groq (AI), Zerodha Kite Connect |
| Build | Vite (client), concurrently (dev) |

---

## FOLDER STRUCTURE (Create exactly this)

```
live-stock/
├── package.json
├── .env.example
├── .gitignore
├── .vercelignore
├── vercel.json
├── api/
│   ├── index.js              # Vercel serverless entry
│   └── [...path].js          # Vercel catch-all for /api/*
├── server/
│   ├── index.js              # Main Express app, all API routes
│   ├── autoTrade.js          # Auto-trade logic (placeKiteOrders, runAutoTrade, getTop3FromTop50Losers)
│   └── kite-login.js         # CLI: node kite-login.js <request_token>
├── client/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx           # Single-file: all components, state, API calls
│   │   ├── App.css           # All component styles
│   │   ├── index.css         # Global reset, body font
│   │   └── vite-env.d.ts
```

---

## DEPENDENCIES

**Root package.json:**
- `cors`, `dotenv`, `express`, `groq-sdk`, `kiteconnect`, `multer`, `node-cron`, `xlsx`, `yahoo-finance2`
- dev: `concurrently`, `vite`

**Client package.json:**
- `react`, `react-dom`, `react-markdown`, `xlsx`
- dev: `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `concurrently`, `typescript`, `vite`

---

## BACKEND API ENDPOINTS (Implement all)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stocks` | Query: `market`, `limit`, `segment`, `refresh`. Returns `{ segments, date, market }`. India: NSE API + Yahoo fallback. US: predefined symbol lists. |
| GET | `/api/chart/:symbol` | Query: `period` (7d/1m/1y/3y/5y), `market`. Returns `{ symbol, period, history }`. |
| GET | `/api/fundamentals/:symbol` | Query: `market`. India: Screener.in + Alpha Vantage fallback. US: Yahoo quoteSummary. |
| POST | `/api/analyze` | Body: `{ symbol, name }`. Groq AI pros/cons. Returns `{ pros, cons }`. |
| POST | `/api/analyze-portfolio` | Body: `{ holdings }`. Groq AI portfolio analysis. |
| GET | `/api/settings/kite` | Returns `{ hasApiKey, hasSecret, hasAccessToken, loginUrl }`. Creds from headers/body. |
| POST | `/api/settings/kite/generate-token` | Body: `{ requestToken, apiKey, apiSecret }` or headers. Returns `{ success, accessToken }`. |
| DELETE | `/api/settings/kite/invalidate-token` | Headers/body: apiKey, accessToken. Invalidates Kite session. |
| GET | `/api/kite/orders` | Headers: X-Kite-Api-Key, X-Kite-Access-Token. Returns `{ orders }`. |
| GET | `/api/kite/holdings` | Same headers. Returns `{ holdings }`. |
| POST | `/api/auto-trade/run` | Body: `{ stocks, dryRun, quantityPerStock, apiKey, apiSecret, accessToken }`. Places orders. |
| GET | `/api/auto-trade/preview` | Returns `{ top3 }` from top 50 losers. |
| GET | `/api/cron/auto-trade` | Cron endpoint. Query: `secret` (CRON_SECRET). Runs auto-trade. |

**Kite credentials:** Always from request (headers `X-Kite-Api-Key`, `X-Kite-Api-Secret`, `X-Kite-Access-Token` or body). Never use `process.env` for request-scoped auth.

---

## FRONTEND REQUIREMENTS

### State (in-memory, React useState)
- `market`, `segmentFilter`, `displayLimit`, `sortOrder`, `loading`, `error`, `refreshing`
- `segmentsByMarket`, `activeStockId`, `activeTab`, `chartPeriod`
- `fundamentalsCache`, `chartCache`, `analysisCache` (in-memory, keyed by stock id)
- `selectedStockIds`, `tradeConfirmModal`, `confirmCheckedSymbols`, `buyQuantityBySymbol`, `tradeResult`
- `historyModalOpen`, `ordersModalTab` ('orders'|'portfolio'|'analyse'|'settings')
- `kiteForm`: `{ apiKey, secret, accessToken, requestToken }`
- `kiteOrders`, `kiteHoldings`, `kiteOrdersError`, `kiteHoldingsError`, `kiteOrdersLoading`, `kiteHoldingsLoading`
- `analyseSource` ('kite'|'xlsx'), `xlsxHoldings`, `xlsxFileName`, `portfolioAnalysis`, `portfolioAnalysisError`
- `failedOrdersFromTrade` (persist failed orders from buy flow)

### Key UI Components (all in App.tsx)
1. **Header:** Title "Live Stock", Buy button, My Orders button, market select (India/US), segment select (All/Large/Mid/Small/Flexi), limit select (50/100/150), sort (desc/asc/best/bestprice), refresh button
2. **Stock list:** Expandable rows. Each row: rank, name, symbol, price, change%. Checkbox for buy selection when market=India.
3. **StockItem (expanded):** Tabs: Fundamentals (markdown), Chart (SVG line, period selector 7D/1M/1Y/3Y/5Y), Pros & Cons (AI, markdown)
4. **Trade confirm modal:** List stocks to buy, quantity input each, Buy button. Calls `/api/auto-trade/run`. Show success/error. Persist failed orders.
5. **History modal (My Zerodha):** Tabs: My Zerodha (orders list), Portfolio (holdings), Analyse (Kite or XLSX upload, AI analysis), Settings
6. **Settings tab:** API Key, Secret Key inputs. When both set: "Sign in with Zerodha" button (opens popup to kite.zerodha.com). Request Token input + Generate button. Access Token input + Invalidate button. Clear credentials. **Auto-capture request_token from URL:** On load, if `?request_token=xxx` in URL: (a) if `window.opener` (popup), postMessage to opener and close; (b) else store in sessionStorage, replaceState. Message listener: on `kite-request-token`, call generate-token API. Stored token: when Settings opens with creds, auto-generate.
7. **Orders tab:** List Kite orders. Show failed orders from trade. Retry button. All transaction types (BUY, SELL, etc.).
8. **Portfolio tab:** Kite holdings list.
9. **Analyse tab:** Source: Kite Portfolio or Upload XLSX. Parse XLSX (Zerodha format: Symbol, Quantity, Avg Price, etc.). Run AI analysis. Show markdown.

### API Base
- `const API = import.meta.env.VITE_API_URL || '/api'`
- Vite proxy: `/api` → `http://127.0.0.1:3001`

### Kite Headers Helper
```ts
function kiteHeaders(creds) {
  const h = {};
  if (creds.apiKey) h['X-Kite-Api-Key'] = creds.apiKey;
  if (creds.secret) h['X-Kite-Api-Secret'] = creds.secret;
  if (creds.accessToken) h['X-Kite-Access-Token'] = creds.accessToken;
  return h;
}
```

---

## BACKEND IMPLEMENTATION DETAILS

### Stocks API
- **India:** Fetch NSE session cookie, call `equity-stockIndices` for NIFTY 100, MIDCAP 150, SMALLCAP 250, NIFTY 200. Fallback: predefined FALLBACK_STOCKS if NSE fails.
- **US:** Predefined symbol arrays (large, mid, small, flexi).
- For each symbol: fetch quote (Yahoo v8 chart API first, then yahoo-finance2). Compute topGainers/topLosers per segment.
- Cache: 2 min TTL, keyed by market:limit:segment.
- **Best rank:** For India, compute "best buy" rank from volatility/dip score among top stocks.

### Chart API
- Yahoo Finance `chart()` or direct v8 chart fetch. Periods: 7d, 1m, 1y, 3y, 5y.

### Fundamentals API
- **India:** Screener.in HTML parse for ratios. Fallback: Alpha Vantage if ALPHA_VANTAGE_API_KEY set.
- **US:** Yahoo quoteSummary.

### Analyze API
- Groq SDK. Prompt for pros/cons of a stock. Return `{ pros: string[], cons: string[] }`.

### Kite
- Use `kiteconnect` package. `generateSession(requestToken, apiSecret)`, `placeOrder`, `getOrders`, `getHoldings`.
- Invalidate: `DELETE https://api.kite.trade/session/token?api_key=...&access_token=...`

### Auto-trade
- `getTop3FromTop50Losers(segmentData)`: merge all segments' topLosers, sort by changePercent ascending, take top 3.
- `placeKiteOrders(stocks, { dryRun, quantityPerStock, credentials })`: loop stocks, place MARKET BUY NSE CNC.
- Cron: 9:20 AM IST Mon–Fri (Vercel: `50 3 * * 1-5`).

---

## ENVIRONMENT VARIABLES (.env.example)

```
GROQ_API_KEY=your_groq_api_key_here
ALPHA_VANTAGE_API_KEY=  # optional
PORT=3001
KITE_API_KEY=
KITE_API_SECRET=
KITE_ACCESS_TOKEN=
AUTO_TRADE_QUANTITY=1
AUTO_TRADE_DRY_RUN=true
AUTO_TRADE_CRON=true
CRON_SECRET=  # for /api/cron/auto-trade
VITE_API_HOST=127.0.0.1
VITE_API_PORT=3001
```

---

## VERCEL CONFIG (vercel.json)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "client/dist",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ],
  "crons": [{ "path": "/api/cron/auto-trade", "schedule": "50 3 * * 1-5" }]
}
```

---

## SCRIPTS (package.json)

- `dev`: concurrently server + client
- `server`: node server/index.js
- `client`: cd client && vite --port 5177
- `build`: cd client && vite build
- `start`: build && node server/index.js
- `kite-login`: node server/kite-login.js (args: request_token)
- `postinstall`: cd client && npm install

---

## STYLING REQUIREMENTS

- **index.css:** Reset, body font DM Sans, min-height 100vh, #root min-height 100vh
- **App.css:** All component styles. Sticky header, max-width 600px, safe-area insets. Stock rows, modals, tabs, buttons, inputs, charts (SVG), loading spinners. Green/red for up/down. Responsive.

---

## CRITICAL BEHAVIORS

1. **No persistence of Kite credentials** — only in React state. User re-enters each session.
2. **Request token auto-capture** — popup flow: Sign in opens popup → redirect to app URL with request_token → postMessage to opener → opener calls generate-token.
3. **Same-tab redirect** — store request_token in sessionStorage, when Settings opens with creds, auto-generate.
4. **Failed orders** — when buy fails, add to `failedOrdersFromTrade`, show in Orders tab.
5. **XLSX parse** — Zerodha holdings format. Detect columns: tradingsymbol/symbol, quantity, average price, etc. Use xlsx package.
6. **Caching** — fundamentals, chart, analysis in React state (keyed by stock id). No localStorage for fundamentals (per README).

---

## OUTPUT REQUIREMENTS

Generate every file in full. No `// TODO`, no `...`, no truncated code. The project must:
- Run with `npm run dev` (backend :3001, frontend :5177)
- Build with `npm run build`
- Deploy to Vercel (single deployment)
- Support India and US markets
- Support Kite login, orders, holdings, buy flow, settings
- Support portfolio analysis (Kite or XLSX)
- Support auto-trade cron

Generate the complete codebase now.

---

## APPENDIX A: Symbol Lists (Use Exactly)

**NSE_INDEX_MAP:** `{ large: 'NIFTY 100', mid: 'NIFTY MIDCAP 150', small: 'NIFTY SMALLCAP 250', flexi: 'NIFTY 200' }`

**SEGMENTS:** `['large', 'mid', 'small', 'flexi']`

**US_STOCKS** (India symbols use `.NS` suffix; US use plain symbol):
- large: AAPL, MSFT, GOOGL, AMZN, NVDA, META, BRK-B, JPM, V, JNJ, WMT, PG, MA, HD, CVX, MRK, ABBV, PEP, KO, COST, AVGO, LLY, MCD, CSCO, ACN, ABT, TMO, DHR, NEE, NKE, BMY, PM, UNP, RTX, HON, UPS, LOW, AMGN, INTC, IBM, QCOM, CAT, GE, AMD, INTU, AMAT, SBUX, GILD, ADP, MDLZ, VZ, LMT, REGN, BKNG, TXN, C, DE, PLD, ADI, ISRG, SYK, CMCSA, BLK, GS, AXP, MMC, CB, SO, DUK, MO, BDX, BSX, CL, EOG, EQIX, ITW, SLB, APD, SHW, APTV, PGR, KLAC, USB, CI, MDT, ZTS, FCX, CME, PANW, WM, ETN, ORLY, AON, NOC, SNPS, PSA, MAR, COF, NXPI, AIG, ADSK, EMR, PCAR, CMG, MNST, CCI, AJG, IQV, HCA, PSX, TRP, O, A, APH, SPG, HLT, ROST, VRSK, FAST, YUM, PAYX, EXC, AFL, DXCM, IDXX, MET, HUM, MCO, CTAS, WELL, GIS, KMB, ED, AZO, ALL, MSI, ROK, STZ, TDG, DLTR, CTVA, PRU, OTIS, ECL, AEP, AMP, WBA, AWK, BIIB, TT, EBAY, ANSS, DOV, EXR, CHD, KEYS, TDY, FTV, CTLT, HIG, ZBH, EXPE, PAYC, TSCO, WY, DAL, CNC, VMC, IR, EIX, HPE, MTB, NDAQ, PCG, ARE, WST, AVB, LYB, DPZ, EFX, ETR, FE, HBAN, PKI, RF, STE, TECH, VTR, AEE, ATO, BXP, CAG, CPT, D, DRI, ESS, FITB, HAS, HOLX, IP, IPGP, JKHY, KEY, LDOS, MKTX, NI, PBCT, PEAK, PNR, REG, RJF, SWK, UDR, WRK, ZBRA
- mid: F, GM, SOFI, PLTR, RIVN, LCID, NIO, XPEV, LI, COIN, MARA, RIOT, HOOD, AFRM, UPST, OPEN, Z, RDFN, SNOW, DDOG, NET, CRWD, ZS, MDB, OKTA, TWLO, DOCU, SQ, PYPL, SHOP, UBER, LYFT, ABNB, EXPE, BKNG, DASH, W, ETSY, ROKU, SPOT, PINS, SNAP, MELI, SE, GRAB, CPNG, BABA, JD, PDD, BIDU, NFLX, DIS, CMCSA, T, VZ, TMUS, CHTR, LUMN, DISH, SIRI, LBRDK, LSXMK, FWONA, LYV, MTN, FIVE, ULTA, LULU, RH, WSM, BBY, DG, DLTR, ROST, TJX, BURL, ANF, AEO, GPS, M, KSS, JWN, DDS, FL, BOOT, SCVL, BKE, PLCE, ZUMZ, EXPR, CONN, BBBY, GME, AMC, CWH, HIBB, BGFV, ASO, DKS, ACAD, ALKS, BIIB, EXEL, INCY, JAZZ, MRNA, NBIX, SGEN, SRPT, TECH, VRTX, XBI, IBB, ARKK, QQQ, SPY, IWM, DIA, VTI, VOO, VEA, VWO, EFA, EEM, GLD, SLV, USO, UNG, TLT, HYG, LQD, BND, AGG, TIP, SHY, IEF
- small, flexi: (use similar S&P/mid/small cap symbols; flexi overlaps with large)

**FALLBACK_STOCKS** (India .NS when NSE API fails):
- large: RELIANCE.NS, TCS.NS, HDFCBANK.NS, INFY.NS, ICICIBANK.NS, HINDUNILVR.NS, ITC.NS, SBIN.NS, KOTAKBANK.NS, BHARTIARTL.NS, LT.NS, AXISBANK.NS, MARUTI.NS, BAJFINANCE.NS, ASIANPAINT.NS, HDFCLIFE.NS, TATAMOTOR.NS, HCLTECH.NS, WIPRO.NS, TITAN.NS, TATACONSUM.NS, NESTLEIND.NS, BAJAJFINSV.NS, SUNPHARMA.NS, ULTRACEMCO.NS, M&M.NS, POWERGRID.NS, ONGC.NS, NTPC.NS, INDUSINDBK.NS, BRITANNIA.NS, TECHM.NS, DIVISLAB.NS, ADANIPORTS.NS, CIPLA.NS, DRREDDY.NS, APOLLOHOSP.NS, COALINDIA.NS, GRASIM.NS, EICHERMOT.NS, JSWSTEEL.NS, TATASTEEL.NS, TATACOMM.NS, HEROMOTOCO.NS, BPCL.NS, HINDALCO.NS, ADANIENT.NS, SHRIRAMFIN.NS, SBILIFE.NS, DMART.NS (50 symbols)
- mid, small, flexi: (use similar NSE symbols; 50 each)

---

## APPENDIX B: Best-Rank Algorithm

For India market only. Rank top 150 losers by composite score.
```js
// 1. Merge all segments' topLosers, sort by changePercent ascending, take top 150
// 2. For each stock compute: bestScore = dip*2 + vol + week + month + cap + fiftyTwoWScore + turnoverScore
//    - dip = -(changePercent)
//    - vol = log10(max(volume,1)) * 0.3
//    - week = 0.5 if weekChange < 0 else 0
//    - month = 0.3 if monthChange < 0 else 0
//    - cap = log10(max(marketCap,1)) * 0.2
//    - fiftyTwoWScore = clamp((high-price)/(high-low), 0, 1) * 2  (when high>low, price>0)
//    - turnoverScore = min(1, log10(max(volume/marketCap*1e6, 1))/8) * 0.3
// 3. Sort by bestScore descending, assign rank 1..N. Return Map<symbol, bestRank>
```

---

## APPENDIX C: Screener.in Fundamentals Parsing

**URL:** `https://www.screener.in/company/{symbol}/` (strip .NS from symbol)

**Headers:** `User-Agent: Mozilla/5.0...`, `Accept: text/html`, `Accept-Language: en-US`

**Parse ratios from HTML:**
- Regex: `/<li[^>]*>[\s\S]*?<span class="name">\s*([^<]+)\s*<\/span>[\s\S]*?<span class="nowrap value"[^>]*>([\s\S]*?)<\/span>(?=\s*<\/li>)/g`
- Extract: Stock P/E, Dividend Yield, Current Price, Market Cap, High / Low
- Parse EPS: match `<tr>...EPS in Rs...` rows, extract cells from last column
- parseScreenerNum(s): strip commas, ₹, parseFloat; return null if NaN

---

## APPENDIX D: parsePortfolioXlsx Column Logic

**Find header row:** First row where headers include 'symbol' AND ('quantity' OR 'average price').

**Column detection (case-insensitive, aliases):**
- symbol: tradingsymbol, symbol, instrument, stock, scrip
- quantity: quantity available, quantity, qty, qty., shares
- avg: average price, avg price, avg. price, cost, buy price, avg, purchase price
- ltp: previous closing price, ltp, last price, close, current price, last_price, market price
- pnl: unrealized p&l, pnl, p&l, profit, profit/loss, unrealized pnl
- exchange: exchange, ex
- date: purchase date, buy date, date of purchase, purchase_date, order date, trade date

**Required:** symbol, quantity. Skip rows with empty symbol or quantity<=0.

**Date parsing:** If Excel serial number (e.g. 44927), use `(raw - 25569) * 86400 * 1000` for Date. Else parse string.

**Output:** `{ tradingsymbol, exchange, quantity, average_price, last_price, pnl?, day_change_percentage?, purchase_date? }`

---

## APPENDIX E: Yahoo Headers & Fetch Options

```js
const YAHOO_FETCH_OPTIONS = {
  fetchOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },
  YF_QUERY_HOST: 'query1.finance.yahoo.com',
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
};
```

**NSE_HEADERS:** Same User-Agent, Accept, Accept-Language; add `Referer: https://www.nseindia.com/`

**YAHOO_CHART_HOSTS:** `['query1.finance.yahoo.com', 'query2.finance.yahoo.com']` for direct v8 chart fetch.

---

## APPENDIX F: Vercel API Setup

**api/index.js:**
```js
import { app } from '../server/index.js';
export default app;
```

**api/[...path].js:** Same content. Both export the Express app as default. Vercel rewrites `/api/*` to `/api`; the Express app handles the request.

---

## APPENDIX G: Additional State & Refs

- `ordersRefreshTrigger` (number) — increment to refetch orders
- `kiteFormRef` (useRef) — sync with kiteForm for message listener (access current creds)
- `kiteGenerateLoading`, `kiteInvalidateLoading`, `kiteGenerateResult`, `kiteError`, `kiteInvalidateError`
- `loadingFundamentalsId`, `loadingChartId`, `loadingAnalysisId` — for loading indicators
- `reportFullscreen` — portfolio analysis fullscreen toggle
- `settingsSigninGroupRef`, `settingsAccessTokenRef` — for scroll-into-view when new sections appear

---

## APPENDIX H: Stock Type (TypeScript)

```ts
type Stock = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  segment: string;
  segmentName: string;
  rank: number;
  market?: string;
  weekChange?: number;
  monthChange?: number;
  history?: { date: string; close: number }[];
  volume?: number;
  marketCap?: number;
  bestRank?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
};
```

---

## APPENDIX I: Settings Tab Layout (Auto-Scroll)

When `kiteForm.apiKey && kiteForm.secret` become truthy, scroll "Sign in with Zerodha" section into view. When `requestToken` or `accessToken` has value, scroll Access Token section into view. Use refs + useEffect + scrollIntoView({ behavior: 'smooth', block: 'nearest' }).

---

## APPENDIX J: Groq Prompts

**Analyze (pros/cons):** Model `llama-3.1-8b-instant`. Prompt includes stock name, symbol, segment, price, change%, week change. Ask for JSON: `{"pros": ["p1","p2","p3"], "cons": ["c1","c2","c3"]}`. Parse JSON from response.

**Portfolio analysis:** Model `llama-3.3-70b-versatile`. Prompt: "You are an experienced equity analyst... Analyze my Zerodha portfolio holdings: sector allocation, concentration, risk, benchmarks (Nifty 50, Sensex), diversification gaps, actionable insights, capital allocation for 10–15y horizon." Include holdings as bullet list: `- SYMBOL (EX): Qty X, Avg ₹Y, LTP ₹Z, Value ₹V, P&L ±N%`. Add summary: Invested, Current Value, P&L. Request markdown with ##, ###, bullet points, tables.

---

## APPENDIX K: API Request/Response Details

**POST /api/auto-trade/run:** Body: `{ stocks: [{ symbol, name, price?, changePercent?, quantity? }], quantityPerStock? }`. Creds in body or headers. Query `dryRun=false` for live orders.

**POST /api/analyze:** Body: `{ stock: { symbol, name, segment?, price?, changePercent?, weekChange? } }`

**POST /api/analyze-portfolio:** Body: `{ holdings: [{ tradingsymbol, exchange, quantity, average_price, last_price, pnl? }] }`

**GET /api/cron/auto-trade:** Auth: `Authorization: Bearer {CRON_SECRET}` or `?secret={CRON_SECRET}`. Uses process.env for Kite when running as cron.

---

## APPENDIX L: Server Export & Ignore Files

**server/index.js:** Must `export { app }` at end (or `export default app`). The api/ files import it.

**.gitignore:** `node_modules/`, `client/dist/`, `.env`, `*.log`, `.DS_Store`

**.vercelignore:** `start-server.sh`, `stop-server.sh`, `server/kite-login.js`, `.env`, `.env.*`, `!.env.example`, `*.log`, `.DS_Store`, `.idea/`, `.vscode/`

---

## END OF PROMPT
