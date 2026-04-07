import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs';

function getNetworkIP() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets || {})) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch {
    // uv_interface_addresses can fail in sandboxed environments
  }
  return '127.0.0.1';
}
import cron from 'node-cron';
import YahooFinance from 'yahoo-finance2';
import Groq from 'groq-sdk';
import { runAutoTrade, getTop3FromTop50Losers } from './autoTrade.js';
import { KiteConnect } from 'kiteconnect';

/** Get Kite credentials from request only (headers or body). Never uses process.env — ensures portfolio/orders are only visible to the tab that sent credentials. No server-side persistence. */
function getKiteFromRequest(req) {
  const apiKey = req.headers['x-kite-api-key'] || req.body?.apiKey || '';
  const apiSecret = req.headers['x-kite-api-secret'] || req.body?.apiSecret || '';
  const accessToken = req.headers['x-kite-access-token'] || req.body?.accessToken || '';
  return { apiKey: String(apiKey || '').trim(), apiSecret: String(apiSecret || '').trim(), accessToken: String(accessToken || '').trim() };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** GICS sectors for US tickers in US_STOCKS (see scripts/generate-us-sector-map.mjs). Avoids Yahoo quoteSummary crumb failures. */
const US_STATIC_SECTOR_BY_SYMBOL = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'usSectorMap.generated.json'), 'utf8'),
);

// Browser-like headers so Yahoo accepts requests (blocks bot User-Agents when opened in browser works)
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
const yahooFinance = new YahooFinance(YAHOO_FETCH_OPTIONS);
const app = express();
app.use(cors());
app.use(express.json());

// Serve built client (CSS, JS, assets) when dist exists
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const MARKETS = { in: 'India', us: 'United States' };
const ALLOWED_MARKETS = ['in', 'us'];

// US market: popular S&P 500 / large cap symbols (no exchange suffix)
const US_STOCKS = {
  large: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'BRK-B', 'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'PEP', 'KO', 'COST', 'AVGO', 'LLY', 'MCD', 'CSCO', 'ACN', 'ABT', 'TMO', 'DHR', 'NEE', 'NKE', 'BMY', 'PM', 'UNP', 'RTX', 'HON', 'UPS', 'LOW', 'AMGN', 'INTC', 'IBM', 'QCOM', 'CAT', 'GE', 'AMD', 'INTU', 'AMAT', 'SBUX', 'GILD', 'ADP', 'MDLZ', 'VZ', 'LMT', 'REGN', 'BKNG', 'TXN', 'C', 'DE', 'PLD', 'ADI', 'ISRG', 'SYK', 'CMCSA', 'BLK', 'GS', 'AXP', 'MMC', 'CB', 'SO', 'DUK', 'MO', 'BDX', 'BSX', 'CL', 'EOG', 'EQIX', 'ITW', 'SLB', 'APD', 'SHW', 'APTV', 'PGR', 'KLAC', 'USB', 'CI', 'MDT', 'ZTS', 'FCX', 'CME', 'PANW', 'WM', 'ETN', 'ORLY', 'AON', 'NOC', 'SNPS', 'PSA', 'MAR', 'COF', 'NXPI', 'AIG', 'ADSK', 'EMR', 'PCAR', 'CMG', 'MNST', 'CCI', 'AJG', 'IQV', 'HCA', 'PSX', 'TRP', 'O', 'A', 'APH', 'SPG', 'HLT', 'ROST', 'VRSK', 'FAST', 'YUM', 'PAYX', 'EXC', 'AFL', 'DXCM', 'IDXX', 'MET', 'HUM', 'MCO', 'CTAS', 'WELL', 'GIS', 'KMB', 'ED', 'AZO', 'ALL', 'MSI', 'ROK', 'STZ', 'TDG', 'DLTR', 'CTVA', 'PRU', 'APD', 'OTIS', 'ECL', 'AEP', 'AMP', 'WBA', 'AWK', 'BIIB', 'TT', 'EBAY', 'ANSS', 'DOV', 'ROST', 'EXR', 'CHD', 'KEYS', 'TDY', 'FTV', 'CTLT', 'HIG', 'ZBH', 'EXPE', 'PAYC', 'TSCO', 'WY', 'DAL', 'CNC', 'VMC', 'IR', 'EIX', 'HPE', 'MTB', 'NDAQ', 'PCG', 'ARE', 'WST', 'AVB', 'LYB', 'DPZ', 'EFX', 'ETR', 'FE', 'HBAN', 'PKI', 'RF', 'STE', 'TECH', 'VTR', 'AEE', 'ATO', 'BXP', 'CAG', 'CPT', 'D', 'DRI', 'ESS', 'FITB', 'HAS', 'HOLX', 'IP', 'IPGP', 'JKHY', 'KEY', 'LDOS', 'MKTX', 'NI', 'PBCT', 'PEAK', 'PNR', 'REG', 'RJF', 'SWK', 'UDR', 'WRK', 'ZBRA'],
  mid: ['F', 'GM', 'SOFI', 'PLTR', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'COIN', 'MARA', 'RIOT', 'HOOD', 'AFRM', 'UPST', 'OPEN', 'Z', 'RDFN', 'SNOW', 'DDOG', 'NET', 'CRWD', 'ZS', 'MDB', 'OKTA', 'TWLO', 'DOCU', 'SQ', 'PYPL', 'SHOP', 'UBER', 'LYFT', 'ABNB', 'EXPE', 'BKNG', 'DASH', 'W', 'ETSY', 'ROKU', 'SPOT', 'PINS', 'SNAP', 'MELI', 'SE', 'GRAB', 'CPNG', 'BABA', 'JD', 'PDD', 'BIDU', 'NFLX', 'DIS', 'CMCSA', 'T', 'VZ', 'TMUS', 'CHTR', 'LUMN', 'DISH', 'SIRI', 'LBRDK', 'LSXMK', 'FWONA', 'LYV', 'MTN', 'FIVE', 'ULTA', 'LULU', 'RH', 'WSM', 'BBY', 'DG', 'DLTR', 'ROST', 'TJX', 'BURL', 'ANF', 'AEO', 'GPS', 'M', 'KSS', 'JWN', 'DDS', 'FL', 'BOOT', 'SCVL', 'BKE', 'PLCE', 'ZUMZ', 'EXPR', 'CONN', 'BBBY', 'GME', 'AMC', 'CWH', 'HIBB', 'BGFV', 'ASO', 'DKS', 'ACAD', 'ALKS', 'BIIB', 'EXEL', 'INCY', 'JAZZ', 'MRNA', 'NBIX', 'SGEN', 'SRPT', 'TECH', 'VRTX', 'XBI', 'IBB', 'ARKK', 'QQQ', 'SPY', 'IWM', 'DIA', 'VTI', 'VOO', 'VEA', 'VWO', 'EFA', 'EEM', 'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'HYG', 'LQD', 'BND', 'AGG', 'TIP', 'SHY', 'IEF'],
  small: ['BB', 'NOK', 'PLUG', 'FCEL', 'BLDP', 'BE', 'QS', 'MVST', 'RIDE', 'GOEV', 'FSR', 'NKLA', 'WKHS', 'EVGO', 'CHPT', 'BLNK', 'CLSK', 'BTBT', 'HUT', 'HIVE', 'BITF', 'CIFR', 'ARBK', 'CORZ', 'IREN', 'SDIG', 'WULF', 'BTCM', 'SOS', 'EBON', 'CAN', 'RBL', 'CVNA', 'RKT', 'UWMC', 'LC', 'COMP', 'SKLZ', 'ELF', 'PR', 'FIX', 'SMCI', 'DOC', 'AMED', 'ENSG', 'CHE', 'PINC', 'SGRY', 'CNO', 'FNF', 'CNA', 'AIZ', 'WRB', 'RLI', 'CINF', 'AFG', 'KMPR', 'THG', 'PRA', 'EIG', 'RGA', 'BRO', 'CHWY', 'CARG', 'LAD', 'AN', 'PAG', 'SAH', 'KMX', 'ABG', 'BOOT', 'PATH', 'ESTC', 'SPLK', 'CFLT', 'BILL', 'AVLR', 'FIVN', 'RNG', 'BAND', 'EGHT', 'RPD', 'NEWR', 'APPN', 'PCTY', 'SMAR', 'VEEV', 'HLNE', 'FICO', 'FLT', 'GPN', 'WEX', 'S', 'U', 'GDDY', 'WIX', 'HUBS', 'ZM', 'TRUE', 'VLDR', 'LAZR', 'AEYE', 'OUST', 'INVZ', 'AEVA', 'MVIS', 'LIDR', 'ACHC', 'AMN', 'CYH', 'HQY', 'OMCL', 'PDCO', 'PODD', 'TNDM', 'INMD', 'SRDX', 'ATRC', 'ITGR', 'ALNY', 'BMRN', 'RARE', 'RGNX', 'BLUE', 'CRSP', 'EDIT', 'NTLA', 'BEAM', 'VERV', 'PRME', 'RXRX', 'SDGR', 'REPL', 'CDNA', 'NTRA', 'TWST', 'GH', 'DOCS', 'MSTR', 'RBC', 'SNV', 'PB', 'CFG', 'FHN', 'BOH', 'BKU', 'UCBI', 'WSFS', 'IBOC', 'FFIN', 'HOMB', 'ONB', 'TCBI', 'CATY', 'BANF', 'SBCF', 'EWBC', 'FRME', 'FULT', 'FNB', 'PNFP', 'ASB', 'HWC', 'WAL', 'COLB', 'RMBS', 'CRUS', 'SYNA', 'SMTC', 'SLAB', 'POWI', 'DIOD', 'ALGM', 'ON', 'WOLF', 'AXTI', 'SIMO', 'MKSI', 'COHU', 'AMKR', 'FORM', 'UCTT', 'IMOS', 'SWKS', 'QRVO', 'MRVL', 'TER', 'MCHP', 'MPWR', 'OLED', 'LPL', 'AUO', 'VECO', 'ENTG', 'CMP', 'CEG', 'GFI', 'KGC', 'AEM', 'CDE', 'HL', 'MUX', 'BTG', 'OR', 'PAAS', 'SSRM', 'SAND', 'GOLD', 'FNV', 'WPM', 'RGLD', 'AG', 'IAG', 'EGO', 'EXK', 'MAG', 'TAHO', 'SVM', 'AGI', 'AUY', 'HMY', 'NGD', 'SCCO', 'TECK', 'ATI', 'CMC', 'RS', 'STLD', 'NUE', 'CLF', 'X', 'AA', 'KALU', 'CENX', 'REX', 'GGB', 'SID', 'TX', 'MT'],
  flexi: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'CVX', 'MRK', 'ABBV', 'PEP', 'KO', 'COST', 'AVGO', 'LLY', 'MCD', 'CSCO', 'ACN', 'ABT', 'TMO', 'DHR', 'NEE', 'NKE', 'BMY', 'PM', 'UNP', 'RTX', 'HON', 'UPS', 'LOW', 'AMGN', 'INTC', 'IBM', 'QCOM', 'CAT', 'GE', 'AMD', 'INTU', 'AMAT', 'SBUX', 'GILD', 'ADP', 'MDLZ', 'VZ', 'LMT', 'REGN', 'BKNG', 'TXN', 'C', 'DE', 'PLD', 'ADI', 'ISRG', 'SYK', 'CMCSA', 'BLK', 'GS', 'AXP', 'MMC', 'CB', 'SO', 'DUK', 'MO', 'BDX', 'BSX', 'CL', 'EOG', 'EQIX', 'ITW', 'SLB', 'APD', 'SHW', 'APTV', 'PGR', 'KLAC', 'USB', 'CI', 'MDT', 'ZTS', 'FCX', 'CME', 'PANW', 'WM', 'ETN', 'ORLY', 'AON', 'NOC', 'SNPS', 'PSA', 'MAR', 'COF', 'NXPI', 'AIG', 'ADSK', 'EMR', 'PCAR', 'CMG', 'MNST', 'CCI', 'AJG', 'IQV', 'HCA', 'PSX', 'TRP', 'O', 'A', 'APH', 'SPG', 'HLT', 'ROST', 'VRSK', 'FAST', 'YUM', 'PAYX', 'EXC', 'AFL', 'DXCM', 'IDXX', 'MET', 'HUM', 'MCO', 'CTAS', 'WELL', 'GIS', 'KMB', 'ED', 'AZO', 'ALL', 'MSI', 'ROK', 'STZ', 'TDG', 'DLTR', 'CTVA', 'PRU', 'OTIS', 'ECL', 'AEP', 'AMP', 'WBA', 'AWK', 'BIIB', 'TT', 'EBAY', 'ANSS', 'DOV', 'EXR', 'CHD', 'KEYS', 'TDY', 'FTV', 'CTLT', 'HIG', 'ZBH', 'EXPE', 'PAYC', 'TSCO', 'WY', 'DAL', 'CNC', 'VMC', 'IR', 'EIX', 'HPE', 'MTB', 'NDAQ', 'PCG', 'ARE', 'WST', 'AVB', 'LYB', 'DPZ', 'EFX', 'ETR', 'FE', 'HBAN', 'PKI', 'RF', 'STE', 'VTR', 'AEE', 'ATO', 'BXP', 'CAG', 'CPT', 'D', 'DRI', 'ESS', 'FITB', 'HAS', 'HOLX', 'IP', 'IPGP', 'JKHY', 'KEY', 'LDOS', 'MKTX', 'NI', 'PBCT', 'PEAK', 'PNR', 'REG', 'RJF', 'SWK', 'UDR', 'WRK', 'ZBRA'],
};

// NSE index names for each segment (API: equity-stockIndices)
const NSE_INDEX_MAP = {
  large: 'NIFTY 100',
  mid: 'NIFTY MIDCAP 150',
  small: 'NIFTY SMALLCAP 250',
  flexi: 'NIFTY 200', // flexi = mix of large + mid
};

// Fallback when NSE API fails (must have at least 50 per segment to support Top 50/100/150)
const FALLBACK_STOCKS = {
  large: ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'KOTAKBANK.NS', 'BHARTIARTL.NS', 'LT.NS', 'AXISBANK.NS', 'MARUTI.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'HDFCLIFE.NS', 'TATAMOTOR.NS', 'HCLTECH.NS', 'WIPRO.NS', 'TITAN.NS', 'TATACONSUM.NS', 'NESTLEIND.NS', 'BAJAJFINSV.NS', 'SUNPHARMA.NS', 'ULTRACEMCO.NS', 'M&M.NS', 'POWERGRID.NS', 'ONGC.NS', 'NTPC.NS', 'INDUSINDBK.NS', 'BRITANNIA.NS', 'TECHM.NS', 'DIVISLAB.NS', 'ADANIPORTS.NS', 'CIPLA.NS', 'DRREDDY.NS', 'APOLLOHOSP.NS', 'COALINDIA.NS', 'GRASIM.NS', 'EICHERMOT.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS', 'TATACOMM.NS', 'HEROMOTOCO.NS', 'BPCL.NS', 'HINDALCO.NS', 'ADANIENT.NS', 'SHRIRAMFIN.NS', 'SBILIFE.NS', 'DMART.NS'],
  mid: ['PIDILITIND.NS', 'BAJFINANCE.NS', 'INDUSINDBK.NS', 'AXISBANK.NS', 'MARUTI.NS', 'ASIANPAINT.NS', 'BRITANNIA.NS', 'TITAN.NS', 'TATACONSUM.NS', 'NESTLEIND.NS', 'PERSISTENT.NS', 'COFORGE.NS', 'BSE.NS', 'HEROMOTOCO.NS', 'FEDERALBNK.NS', 'SUZLON.NS', 'INDIGOTOWERS.NS', 'PBFINETECH.NS', 'ASHOKLEY.NS', 'CUMMINSIND.NS', 'ABB.NS', 'SIEMENS.NS', 'LALPATHLAB.NS', 'APOLLOTYRE.NS', 'BALKRISIND.NS', 'DIVISLAB.NS', 'AUBANK.NS', 'CANFINHOME.NS', 'ASTRAL.NS', 'DIXON.NS', 'POLYCAB.NS', 'TRENT.NS', 'VOLTAS.NS', 'TATAELXSI.NS', 'MPHASIS.NS', 'TECHM.NS', 'ZYDUSLIFE.NS', 'TORNTPHARM.NS', 'LAURUSLABS.NS', 'ALKEM.NS', 'GLENMARK.NS', 'AUROPHARMA.NS', 'BIOCON.NS', 'LUPIN.NS', 'DRREDDY.NS', 'CIPLA.NS', 'SUNPHARMA.NS', 'ABBOTINDIA.NS', 'SANOFI.NS', 'PFIZER.NS', 'GLAXO.NS'],
  small: ['CDSL.NS', 'PERSISTENT.NS', 'COFORGE.NS', 'KPITTECH.NS', 'LAURUSLABS.NS', 'TATAELXSI.NS', 'CANFINHOME.NS', 'AUBANK.NS', 'ZYDUSLIFE.NS', 'TORNTPHARM.NS', 'ASTRAL.NS', 'DIXON.NS', 'POLYCAB.NS', 'TRENT.NS', 'VOLTAS.NS', 'MPHASIS.NS', 'ALKEM.NS', 'GLENMARK.NS', 'AUROPHARMA.NS', 'BIOCON.NS', 'LUPIN.NS', 'ABBOTINDIA.NS', 'SANOFI.NS', 'PFIZER.NS', 'GLAXO.NS', 'CROMPTON.NS', 'HAVELLS.NS', 'VGUARD.NS', 'CUB.NS', 'RBLBANK.NS', 'BANDHANBNK.NS', 'IDFC.NS', 'IDFCFIRSTB.NS', 'PNB.NS', 'BANKBARODA.NS', 'UNIONBANK.NS', 'CANBK.NS', 'INDIACEM.NS', 'ACC.NS', 'AMBUJACEM.NS', 'GRANULES.NS', 'SUVEN.NS', 'NAVINFLUOR.NS', 'AEGISLOG.NS', 'ATUL.NS', 'BASF.NS', 'SRF.NS', 'AARTIIND.NS', 'VINATIORGA.NS', 'FINEORG.NS', 'DEEPAKNTR.NS'],
  flexi: ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS', 'BHARTIARTL.NS', 'LT.NS', 'SBIN.NS', 'TATAMOTOR.NS', 'HINDUNILVR.NS', 'ITC.NS', 'KOTAKBANK.NS', 'AXISBANK.NS', 'MARUTI.NS', 'BAJFINANCE.NS', 'ASIANPAINT.NS', 'HDFCLIFE.NS', 'HCLTECH.NS', 'WIPRO.NS', 'TITAN.NS', 'TATACONSUM.NS', 'NESTLEIND.NS', 'BAJAJFINSV.NS', 'SUNPHARMA.NS', 'ULTRACEMCO.NS', 'M&M.NS', 'POWERGRID.NS', 'ONGC.NS', 'NTPC.NS', 'INDUSINDBK.NS', 'BRITANNIA.NS', 'TECHM.NS', 'DIVISLAB.NS', 'ADANIPORTS.NS', 'CIPLA.NS', 'DRREDDY.NS', 'APOLLOHOSP.NS', 'COALINDIA.NS', 'GRASIM.NS', 'EICHERMOT.NS', 'JSWSTEEL.NS', 'TATASTEEL.NS', 'TATACOMM.NS', 'HEROMOTOCO.NS', 'BPCL.NS', 'HINDALCO.NS', 'ADANIENT.NS', 'SHRIRAMFIN.NS', 'SBILIFE.NS', 'PIDILITIND.NS', 'PERSISTENT.NS', 'COFORGE.NS'],
};

const SEGMENT_NAMES = { large: 'Large Cap', mid: 'Mid Cap', small: 'Small Cap', flexi: 'Flexi Cap' };

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
};

/** Get NSE session cookie (shared across all index fetches) */
async function getNSESessionCookie() {
  const sessionRes = await fetch('https://www.nseindia.com', {
    headers: NSE_HEADERS,
    redirect: 'manual',
  });
  const cookies = sessionRes.headers.get('set-cookie') || '';
  return cookies.split(',').map((c) => c.split(';')[0].trim()).join('; ');
}

/** Fetch index constituents from NSE API (requires cookie from getNSESessionCookie) */
async function fetchNSEIndexConstituents(indexName, cookieHeader) {
  const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(indexName)}`;
  const res = await fetch(url, {
    headers: { ...NSE_HEADERS, Cookie: cookieHeader },
  });
  if (!res.ok) throw new Error(`NSE ${res.status}`);
  const json = await res.json();
  const data = json?.data || [];
  return data
    .filter((d) => d.symbol && d.symbol !== indexName && !d.symbol.startsWith('NIFTY'))
    .map((d) => (d.symbol.endsWith('.NS') ? d.symbol : `${d.symbol}.NS`));
}

/** Get stock lists for US market (predefined symbols) */
function getStockListsForUS() {
  return US_STOCKS;
}

/** Get full stock lists per segment via NSE API; fallback to FALLBACK_STOCKS on failure */
async function getStockListsBySegment() {
  const lists = { large: [], mid: [], small: [], flexi: [] };
  try {
    const cookie = await getNSESessionCookie();
    const [large, mid, small, flexi] = await Promise.all([
      fetchNSEIndexConstituents(NSE_INDEX_MAP.large, cookie),
      fetchNSEIndexConstituents(NSE_INDEX_MAP.mid, cookie),
      fetchNSEIndexConstituents(NSE_INDEX_MAP.small, cookie),
      fetchNSEIndexConstituents(NSE_INDEX_MAP.flexi, cookie),
    ]);
    lists.large = large;
    lists.mid = mid;
    lists.small = small;
    lists.flexi = flexi;
  } catch (err) {
    console.warn('NSE API failed, using fallback lists:', err.message);
    return FALLBACK_STOCKS;
  }
  return lists;
}

async function fetchHistorical(symbol, days = 21) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const result = await yahooFinance.chart(symbol, {
      period1: start.toISOString().slice(0, 10),
      period2: end.toISOString().slice(0, 10),
    });
    const quotes = result?.quotes || [];
    return quotes.map((q) => ({ date: q.date, close: q.close }));
  } catch (err) {
    console.warn(`Historical failed for ${symbol}:`, err.message);
    return [];
  }
}

const DEFAULT_LIMIT = 50;
const ALLOWED_LIMITS = [50, 100, 150];
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min cache
const stocksCacheByLimit = {};
const stocksCacheTimeByLimit = {};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toYahooSymbol(symbol, market) {
  if (market === 'us') return symbol;
  return symbol.endsWith('.NS') || symbol.endsWith('.BO') ? symbol : `${symbol}.NS`;
}

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

const YAHOO_CHART_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

/** Direct fetch to v8 chart endpoint - no cookies/crumb needed, works when yahoo-finance2 fails. */
async function fetchQuoteViaChart(symbol) {
  for (const host of YAHOO_CHART_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    try {
      const res = await fetch(url, { headers: YAHOO_HEADERS });
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const meta = result.meta || {};
      const price = meta.regularMarketPrice ?? meta.previousClose;
      if (price == null) continue;
      const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
      const change = (price - prev) || 0;
      const changePercent = prev ? (change / prev) * 100 : 0;
      let fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh;
      let fiftyTwoWeekLow = meta.fiftyTwoWeekLow;
      if (fiftyTwoWeekHigh == null || fiftyTwoWeekLow == null) {
        try {
          const url1y = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
          const res1y = await fetch(url1y, { headers: YAHOO_HEADERS });
          if (res1y.ok) {
            const data1y = await res1y.json();
            const r1y = data1y?.chart?.result?.[0];
            const m1y = r1y?.meta || {};
            if (fiftyTwoWeekHigh == null && m1y.fiftyTwoWeekHigh != null) fiftyTwoWeekHigh = m1y.fiftyTwoWeekHigh;
            if (fiftyTwoWeekLow == null && m1y.fiftyTwoWeekLow != null) fiftyTwoWeekLow = m1y.fiftyTwoWeekLow;
            if ((fiftyTwoWeekHigh == null || fiftyTwoWeekLow == null) && r1y?.indicators?.quote?.[0]) {
              const q = r1y.indicators.quote[0];
              const highs = (q.high || []).filter((v) => v != null && !isNaN(v));
              const lows = (q.low || []).filter((v) => v != null && !isNaN(v));
              if (fiftyTwoWeekHigh == null && highs.length) fiftyTwoWeekHigh = Math.max(...highs);
              if (fiftyTwoWeekLow == null && lows.length) fiftyTwoWeekLow = Math.min(...lows);
            }
          }
        } catch {
          /* ignore */
        }
      }
      return {
        symbol: meta.symbol || symbol,
        shortName: meta.shortName || meta.longName || symbol,
        longName: meta.longName || meta.shortName || symbol,
        regularMarketPrice: price,
        preMarketPrice: meta.preMarketPrice,
        regularMarketChange: change,
        regularMarketChangePercent: changePercent,
        regularMarketVolume: meta.regularMarketVolume,
        marketCap: meta.marketCap,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/** Goodreturns blocks direct server fetch (Cloudflare). Jina reader returns markdown we can parse. */
const GOODRETURNS_CHENNAI_URL = 'https://www.goodreturns.in/gold-rates/chennai.html';
const GOODRETURNS_FETCH_MS = 25_000;
const GOODRETURNS_CACHE_MS = 30 * 60 * 1000;
/** Don’t cache failures for 30m — allows retry after Jina 451 / network blips. */
const GOODRETURNS_ERROR_CACHE_MS = 60 * 1000;
let goodreturnsChennaiCache = { at: 0, data: null };

/** Jina often prefixes the body with Title: / URL Source: / Markdown Content: */
function stripJinaReaderPreamble(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let t = raw.replace(/\r/g, '');
  const mc = t.match(/^[\s\S]*?Markdown Content:\s*\n/i);
  if (mc) t = t.slice(mc.index + mc[0].length);
  return t;
}

function parseTitleLineFromJina(raw) {
  const m = String(raw || '').match(/^Title:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

/**
 * Per-gram price and optional day change (+₹381 / -₹50) after the label block on chennai.html (Jina markdown).
 * Also matches HTML-flattened text where newlines are missing (single-line).
 */
function parseGoldLaneInr(t, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let re = new RegExp(`${esc}\\s*\\n+\\s*₹\\s*([\\d,]+)`, 'i');
  let m = t.match(re);
  if (!m) {
    re = new RegExp(`${esc}\\s+₹\\s*([\\d,]+)`, 'i');
    m = t.match(re);
  }
  if (!m) return { inrPerGram: null, changeInr: null };
  const inrPerGram = parseInt(String(m[1]).replace(/,/g, ''), 10);
  const after = t.slice((m.index ?? 0) + m[0].length);
  let ch = after.match(/\n\s*\n\s*([+−-])\s*₹\s*([\d,]+)/);
  if (!ch) ch = after.match(/\s+([+−-])\s*₹\s*([\d,]+)/);
  let changeInr = null;
  if (ch) {
    const sign = ch[1] === '-' || ch[1] === '−' ? -1 : 1;
    const v = parseInt(String(ch[2]).replace(/,/g, ''), 10);
    if (Number.isFinite(v)) changeInr = sign * v;
  }
  return {
    inrPerGram: Number.isFinite(inrPerGram) ? inrPerGram : null,
    changeInr,
  };
}

/**
 * Markdown block: ## Gold Rate in Chennai for Last 10 Days (1 gram) … pipe table.
 * Rows: | Mar 25, 2026 | ₹14,837 (+381) | ₹13,600 (+350) |
 */
function parseLastTenDaysOneGramTable(t) {
  const marker = '## Gold Rate in Chennai for Last 10 Days (1 gram)';
  const idx = t.indexOf(marker);
  if (idx === -1) return [];
  const rest = t.slice(idx + marker.length);
  const lines = rest.split('\n');
  const out = [];
  let state = 'seek_header';
  for (const raw of lines) {
    const line = raw.trim();
    if (state === 'seek_header') {
      if (/^\|\s*Date\s*\|/i.test(line)) state = 'seek_sep';
      continue;
    }
    if (state === 'seek_sep') {
      if (/^\|\s*[-—\s:|]+\|/.test(line)) state = 'rows';
      continue;
    }
    if (state === 'rows') {
      if (!line.startsWith('|')) break;
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 4) continue;
      const dateLabel = parts[1];
      const rate24k = parts[2];
      const rate22k = parts[3];
      if (/^date$/i.test(dateLabel)) continue;
      if (/^[-—]+$/.test(dateLabel.replace(/\s/g, ''))) continue;
      if (!dateLabel || !rate24k || !rate22k) continue;
      out.push({ dateLabel, rate24k, rate22k });
    }
  }
  return out;
}

/** Strip HTML to plain text with line breaks so markdown-style parsers can run. */
function htmlToPlainTextForGoodreturns(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|tr|h[1-6]|li|table|thead|tbody|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

function parseLastTenDaysFromHtml(html) {
  const out = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const row = m[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
    );
    if (cells.length < 3) continue;
    const [dateLabel, rate24k, rate22k] = cells;
    if (/^date$/i.test(dateLabel)) continue;
    if (!/^\w{3}\s+\d+|\d{1,2}\s+\w+\s+\d{4}/i.test(dateLabel)) continue;
    if (!rate24k.includes('₹') || !rate22k.includes('₹')) continue;
    out.push({ dateLabel, rate24k, rate22k });
  }
  return out;
}

/** Fallback when lane labels don’t match (flattened HTML). */
function parseRatesFromFlatText(t) {
  const para = t.match(
    /₹\s*([\d,]+)\s*per gram for 24 karat[\s\S]{0,120}?₹\s*([\d,]+)\s*per gram for 22 karat[\s\S]{0,120}?₹\s*([\d,]+)\s*per gram for 18 karat/i
  );
  if (!para) return null;
  return {
    gold24kPerGram: parseInt(para[1].replace(/,/g, ''), 10),
    gold22kPerGram: parseInt(para[2].replace(/,/g, ''), 10),
    gold18kPerGram: parseInt(para[3].replace(/,/g, ''), 10),
  };
}

function parseGoodreturnsJinaMarkdown(markdown, htmlRaw = null) {
  if (!markdown || typeof markdown !== 'string') return null;
  const t = stripJinaReaderPreamble(markdown);
  const lane24 = parseGoldLaneInr(t, '24K Gold/g');
  const lane22 = parseGoldLaneInr(t, '22K Gold/g');
  const lane18 = parseGoldLaneInr(t, '18K Gold/g');
  let gold24kPerGram = lane24.inrPerGram;
  let gold22kPerGram = lane22.inrPerGram;
  let gold18kPerGram = lane18.inrPerGram;
  let change24kInr = lane24.changeInr;
  let change22kInr = lane22.changeInr;
  let change18kInr = lane18.changeInr;
  if (gold24kPerGram == null || gold22kPerGram == null || gold18kPerGram == null) {
    const para = t.match(
      /\*\*₹([\d,]+)\*\* per gram for 24 karat[\s\S]*?\*\*₹([\d,]+)\*\* per gram for 22 karat[\s\S]*?\*\*₹([\d,]+)\*\* per gram for 18 karat/i
    );
    if (para) {
      if (gold24kPerGram == null) gold24kPerGram = parseInt(para[1].replace(/,/g, ''), 10);
      if (gold22kPerGram == null) gold22kPerGram = parseInt(para[2].replace(/,/g, ''), 10);
      if (gold18kPerGram == null) gold18kPerGram = parseInt(para[3].replace(/,/g, ''), 10);
    }
  }
  if (gold24kPerGram == null || gold22kPerGram == null || gold18kPerGram == null) {
    const loose = parseRatesFromFlatText(t);
    if (loose) {
      if (gold24kPerGram == null) gold24kPerGram = loose.gold24kPerGram;
      if (gold22kPerGram == null) gold22kPerGram = loose.gold22kPerGram;
      if (gold18kPerGram == null) gold18kPerGram = loose.gold18kPerGram;
    }
  }
  const dm = t.match(/###\s*(\d{1,2}\s+\w+\s+\d{4})/);
  const headlineDate = dm ? dm[1].trim() : null;
  let lastTenDaysOneGram = parseLastTenDaysOneGramTable(t);
  if (lastTenDaysOneGram.length === 0 && htmlRaw) {
    lastTenDaysOneGram = parseLastTenDaysFromHtml(htmlRaw);
  }
  if (gold24kPerGram == null && gold22kPerGram == null && gold18kPerGram == null) return null;
  return {
    gold24kPerGram,
    gold22kPerGram,
    gold18kPerGram,
    change24kInr,
    change22kInr,
    change18kInr,
    headlineDate,
    pageTitle: parseTitleLineFromJina(markdown),
    lastTenDaysOneGram,
  };
}

async function fetchGoodreturnsChennaiFromNetwork() {
  if (process.env.GOODRETURNS_DISABLE === '1' || process.env.GOODRETURNS_DISABLE === 'true') {
    return { ok: false, error: 'disabled', sourceUrl: GOODRETURNS_CHENNAI_URL };
  }
  const jinaBase = (process.env.GOODRETURNS_JINA_PREFIX || 'https://r.jina.ai/').replace(/\/?$/, '/');
  const jinaUrl = `${jinaBase}${GOODRETURNS_CHENNAI_URL}`;
  const jinaHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/plain,text/markdown,*/*',
  };
  const jinaKey = process.env.JINA_API_KEY || process.env.GOODRETURNS_JINA_API_KEY;
  if (jinaKey && String(jinaKey).trim()) {
    jinaHeaders.Authorization = `Bearer ${String(jinaKey).trim()}`;
  }

  let jinaNote = '';
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), GOODRETURNS_FETCH_MS);
    const res = await fetch(jinaUrl, { signal: ac.signal, headers: jinaHeaders });
    clearTimeout(to);
    const text = await res.text();
    let jinaBlocked = false;
    try {
      if (text.trim().startsWith('{')) {
        const j = JSON.parse(text);
        if (j && (j.code === 451 || j.name === 'SecurityCompromiseError')) {
          jinaBlocked = true;
        }
      }
    } catch {
      /* not JSON */
    }
    if (res.ok && !jinaBlocked) {
      const parsed = parseGoodreturnsJinaMarkdown(text);
      if (parsed) {
        return {
          ok: true,
          sourceUrl: GOODRETURNS_CHENNAI_URL,
          ...parsed,
          fetchedAt: new Date().toISOString(),
        };
      }
      jinaNote = 'Jina response parse failed';
    } else {
      jinaNote =
        res.status === 451 || jinaBlocked ? 'Jina blocked (HTTP 451)' : `Jina HTTP ${res.status}`;
      if (!res.ok) console.warn('[goodreturns]', jinaNote);
    }
  } catch (e) {
    jinaNote = `Jina: ${e.message}` || 'Jina failed';
    console.warn('[goodreturns]', e.message);
  }

  /* Direct fetch: Goodreturns sometimes serves HTML to our server when Jina is blocked. */
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), GOODRETURNS_FETCH_MS);
    const res = await fetch(GOODRETURNS_CHENNAI_URL, {
      signal: ac.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(to);
    if (!res.ok) {
      return {
        ok: false,
        error: jinaNote ? `${jinaNote}; direct HTTP ${res.status}` : `HTTP ${res.status}`,
        sourceUrl: GOODRETURNS_CHENNAI_URL,
      };
    }
    const html = await res.text();
    const plain = htmlToPlainTextForGoodreturns(html);
    const parsed = parseGoodreturnsJinaMarkdown(plain, html);
    if (!parsed) {
      return {
        ok: false,
        error: jinaNote ? `${jinaNote}; direct parse failed` : 'parse_failed',
        sourceUrl: GOODRETURNS_CHENNAI_URL,
      };
    }
    return {
      ok: true,
      sourceUrl: GOODRETURNS_CHENNAI_URL,
      ...parsed,
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.warn('[goodreturns direct]', e.message);
    return {
      ok: false,
      error: jinaNote ? `${jinaNote}; direct: ${e.message}` : e.message || 'fetch_failed',
      sourceUrl: GOODRETURNS_CHENNAI_URL,
    };
  }
}

async function getGoodreturnsChennaiCached() {
  const now = Date.now();
  const c = goodreturnsChennaiCache;
  if (c.data?.ok && now - c.at < GOODRETURNS_CACHE_MS) {
    return c.data;
  }
  if (c.data && !c.data.ok && now - c.at < GOODRETURNS_ERROR_CACHE_MS) {
    return c.data;
  }
  const data = await fetchGoodreturnsChennaiFromNetwork();
  goodreturnsChennaiCache = { at: now, data };
  return data;
}

/** Fetch quote; try v8 chart first (no cookies), then yahoo-finance2. */
async function fetchQuote(symbol) {
  const fromChart = await fetchQuoteViaChart(symbol);
  if (fromChart && (fromChart.regularMarketPrice != null || fromChart.preMarketPrice != null)) return fromChart;
  try {
    const quote = await yahooFinance.quote(symbol);
    if (quote && (quote.regularMarketPrice != null || quote.preMarketPrice != null)) return quote;
  } catch (err) {
    console.warn(`Quote failed for ${symbol}:`, err.message);
  }
  try {
    const summary = await yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail'] });
    const price = summary?.price || {};
    const sd = summary?.summaryDetail || {};
    if (price.regularMarketPrice == null && price.preMarketPrice == null) return null;
    return {
      symbol: price.symbol || symbol,
      shortName: price.shortName,
      longName: price.longName,
      regularMarketPrice: price.regularMarketPrice,
      preMarketPrice: price.preMarketPrice,
      regularMarketChange: price.regularMarketChange ?? 0,
      regularMarketChangePercent: price.regularMarketChangePercent ?? 0,
      regularMarketVolume: price.regularMarketVolume ?? sd.volume,
      marketCap: sd.marketCap ?? price.marketCap,
      fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh ?? price.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: sd.fiftyTwoWeekLow ?? price.fiftyTwoWeekLow,
    };
  } catch (err) {
    console.warn(`QuoteSummary fallback failed for ${symbol}:`, err.message);
    return null;
  }
}

/** Fetch symbols in batches with delay to avoid rate limits. Returns Map<symbol, stockData>. */
async function fetchSymbolsBatched(symbols, market, batchSize = 8, delayMs = 250) {
  const results = new Map();
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((s) => fetchSymbolData(s, market)));
    batchResults.forEach((data, idx) => {
      if (data) results.set(batch[idx], data);
    });
    if (i + batchSize < symbols.length) await sleep(delayMs);
  }
  return results;
}

/** Build segment -> symbols mapping. Each cap shows up to maxSymbols.
 *  Large, mid, small: exclude symbols already in earlier caps.
 *  Flexi: full list (up to maxSymbols) - can overlap with others since it's a diversified mix. */
async function processAllSegmentsDeduplicated(lists, limit, market) {
  const maxSymbols = ALLOWED_LIMITS.includes(limit) ? limit : DEFAULT_LIMIT;
  const segmentToSymbols = {};
  const seenAcrossCaps = new Set();
  const SEGMENTS_EXCLUSIVE = ['large', 'mid', 'small'];

  for (const seg of SEGMENTS_EXCLUSIVE) {
    const rawList = lists[seg] || [];
    const symbols = [];
    for (const sym of rawList) {
      if (symbols.length >= maxSymbols) break;
      if (!seenAcrossCaps.has(sym)) {
        symbols.push(sym);
        seenAcrossCaps.add(sym);
      }
    }
    segmentToSymbols[seg] = symbols;
  }

  // Flexi: take full list up to maxSymbols (no exclusion - flexi overlaps with large/mid)
  const flexiList = (lists.flexi || []).slice(0, maxSymbols);
  segmentToSymbols.flexi = flexiList;
  flexiList.forEach((sym) => seenAcrossCaps.add(sym));

  const uniqueSymbols = [...seenAcrossCaps];
  if (!uniqueSymbols.length) {
    return Object.fromEntries(SEGMENTS.map((s) => [s, { topGainers: [], topLosers: [] }]));
  }

  const BATCH_SIZE = market === 'in' ? 12 : 8;
  const DELAY_MS = market === 'in' ? 180 : 250;
  const fetched = await fetchSymbolsBatched(uniqueSymbols, market, BATCH_SIZE, DELAY_MS);

  const segmentData = {};
  for (const seg of SEGMENTS) {
    const symbols = segmentToSymbols[seg] || [];
    const valid = symbols
      .map((sym) => fetched.get(sym))
      .filter(Boolean)
      .map((s) => ({ ...s, segment: seg, segmentName: SEGMENT_NAMES[seg] }));
    const byGain = [...valid].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
    const byLoss = [...valid].sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
    const topN = Math.min(maxSymbols, valid.length);
    segmentData[seg] = {
      topGainers: byGain.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 })),
      topLosers: byLoss.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 })),
    };
  }
  return segmentData;
}

/** NSE symbols commonly classified as PSUs / CPSEs (plain symbol, no .NS). Regex + name/industry fill gaps. */
const IN_PSU_SYMBOLS = new Set([
  'BANKBARODA',
  'BANKINDIA',
  'BEL',
  'BEML',
  'BHEL',
  'BPCL',
  'CANBK',
  'CENTRALBK',
  'COALINDIA',
  'CONCOR',
  'ENGINERSIN',
  'FACT',
  'GAIL',
  'HAL',
  'HINDCOPPER',
  'HUDCO',
  'IOC',
  'IOB',
  'IRCON',
  'IRCTC',
  'IRFC',
  'ITI',
  'LICI',
  'MAHABANK',
  'MMTC',
  'MOIL',
  'NALCO',
  'NBCC',
  'NFL',
  'NHPC',
  'NLCINDIA',
  'NMDC',
  'NTPC',
  'OIL',
  'ONGC',
  'PFC',
  'PNB',
  'POWERGRID',
  'RECLTD',
  'RITES',
  'RVNL',
  'SAIL',
  'SBIN',
  'SCI',
  'SJVN',
  'UCOBANK',
  'UNIONBANK',
  'INDIANB',
  'NATIONALUM',
  'KIOCL',
]);

/**
 * Heuristic PSU flag for India listings (name / industry text + symbol set).
 * @param {string} symbolPlain Uppercase NSE symbol without exchange suffix
 */
function inferIsPSU(symbolPlain, name, sectorRaw, industryRaw) {
  const sym = String(symbolPlain || '')
    .replace(/\.(NS|BO)$/i, '')
    .trim()
    .toUpperCase();
  if (sym && IN_PSU_SYMBOLS.has(sym)) return true;
  const t = `${name || ''} ${sectorRaw || ''} ${industryRaw || ''}`.toLowerCase();
  if (!t.replace(/\s/g, '').length) return false;
  return /\b(psu|public sector undertaking|public sector|government company|govt\.?\s*company|state-owned|government of india|ministry of|department of|central public sector|cpse|navratna|maharatna|miniratna|bharat petroleum|indian oil|oil and natural|coal india|steel authority|national thermal|power finance|container corporation|indian railway|railway catering)\b/i.test(
    t,
  );
}

/**
 * Normalize raw sector/industry into a small set of major groups for UI filters.
 * Major groups:
 * - Financials (Banking, Finance)
 * - Consumption (FMCG, Consumer Goods, Consumer Discretionary)
 * - Industrials (Industrial, Metal, Diversified)
 * - Energy & Utilities (Energy, Utilities)
 * - Tech & Communication (IT, Telecom & Media)
 * - Healthcare (Health Care)
 * - Services (Services)
 */
function normalizeSectorForDisplay(sectorRaw, industryRaw) {
  const sector = (sectorRaw || '').trim();
  const industry = (industryRaw || '').trim();
  if (!sector && !industry) return null;
  const combined = `${sector} ${industry}`.toLowerCase();

  // 1) Financials = Banking + Finance
  if (
    /\bbanks?\b|banking|financial|finance|capital markets|asset management|insurance|nbfc|broker|lending|credit|fintech/.test(combined)
  ) {
    return 'Financials';
  }

  // 2) Consumption = FMCG + Consumer Goods + Consumer Discretionary
  if (
    /consumer defensive|consumer cyclical|consumer discretionary|fmcg|fast moving consumer goods|packaged food|tobacco|household|personal care|retail|apparel|leisure|restaurant|hotel|travel|auto/.test(combined)
  ) {
    return 'Consumption';
  }

  // 3) Tech & Communication = IT + Telecom & Media
  if (
    /technology|information technology|it services|software|semiconductor|internet|communication services|telecom|media|entertainment|broadcast|digital/.test(combined)
  ) {
    return 'Tech & Communication';
  }

  // 4) Energy & Utilities = Energy + Utilities
  if (
    /energy|oil|gas|petroleum|refining|power generation|utilities|electric|water|renewable/.test(combined)
  ) {
    return 'Energy & Utilities';
  }

  // 5) Healthcare = Health Care
  if (
    /healthcare|health care|pharma|pharmaceutical|drug|hospital|biotech|life sciences|medical/.test(combined)
  ) {
    return 'Healthcare';
  }

  // 6) Industrials = Industrial + Metal + Diversified
  if (
    /industrials|industrial|manufacturing|engineering|aerospace|defense|construction|transport|logistics|basic materials|metal|mining|aluminium|copper|zinc|iron|steel|diversified|conglomerate|real estate|reit/.test(combined)
  ) {
    return 'Industrials';
  }

  // 7) Services = Services
  if (/services|business services|professional services/.test(combined)) {
    return 'Services';
  }

  // Default unknown categories to Services to keep filter buckets compact.
  return 'Services';
}

/**
 * NSE India quote-equity returns industryInfo without Yahoo’s crumb (Yahoo quoteSummary often fails server-side).
 * @param {string} symbol Plain NSE symbol (no .NS)
 */
async function fetchSectorFromNse(symbol) {
  const sym = String(symbol || '')
    .replace(/\.(NS|BO)$/i, '')
    .trim()
    .toUpperCase();
  if (!sym) return null;
  const url = `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ii = data?.industryInfo;
    if (!ii || typeof ii !== 'object') return null;
    const sectorRaw = [ii.macro, ii.sector].find((x) => typeof x === 'string' && x.trim())?.trim() || '';
    const industryRaw = [ii.industry, ii.basicIndustry].find((x) => typeof x === 'string' && x.trim())?.trim() || '';
    const sector = normalizeSectorForDisplay(sectorRaw, industryRaw);
    return { sector, sectorRaw, industryRaw };
  } catch {
    return null;
  }
}

/** US / fallback: Yahoo quoteSummary via yahoo-finance2 (may fail without browser cookies). */
async function fetchSectorFromYahoo(yfSymbol) {
  try {
    const r = await yahooFinance.quoteSummary(yfSymbol, { modules: ['summaryProfile', 'assetProfile'] });
    const sp = r?.summaryProfile || {};
    const ap = r?.assetProfile || {};
    const sectorRaw =
      (typeof sp.sector === 'string' && sp.sector.trim() ? sp.sector.trim() : '') ||
      (typeof ap.sector === 'string' && ap.sector.trim() ? ap.sector.trim() : '');
    const industryRaw =
      (typeof sp.industry === 'string' && sp.industry.trim() ? sp.industry.trim() : '') ||
      (typeof ap.industry === 'string' && ap.industry.trim() ? ap.industry.trim() : '');
    const sector = normalizeSectorForDisplay(sectorRaw, industryRaw);
    return { sector, sectorRaw, industryRaw };
  } catch {
    return null;
  }
}

async function fetchSectorForStock(symbol, market, yfSymbol) {
  if (market === 'in') {
    const nse = await fetchSectorFromNse(symbol);
    if (nse) return nse;
  }
  if (market === 'us') {
    const sym = String(symbol || '')
      .replace(/\.(NS|BO)$/i, '')
      .trim()
      .toUpperCase();
    const raw = US_STATIC_SECTOR_BY_SYMBOL[sym];
    if (raw) {
      const sector = normalizeSectorForDisplay(raw, '');
      if (sector) return { sector, sectorRaw: raw, industryRaw: '' };
    }
  }
  const y = await fetchSectorFromYahoo(yfSymbol);
  if (y) return y;
  return { sector: null, sectorRaw: '', industryRaw: '' };
}

async function fetchSymbolData(symbol, market) {
  const yfSymbol = toYahooSymbol(symbol, market);
  const [quote, history] = await Promise.all([fetchQuote(yfSymbol), fetchHistorical(yfSymbol)]);
  if (!quote) return null;
  /** India: NSE quote-equity (reliable). US: Yahoo quoteSummary (best-effort). */
  const sectorInfo = await fetchSectorForStock(symbol, market, yfSymbol);
  const sector = sectorInfo?.sector ?? null;
  const plainSym = String(symbol || '')
    .replace(/\.(NS|BO)$/i, '')
    .trim()
    .toUpperCase();
  const displayName = quote.shortName || quote.longName || symbol;
  const isPSU =
    market === 'in' &&
    inferIsPSU(plainSym, displayName, sectorInfo?.sectorRaw || '', sectorInfo?.industryRaw || '');
  const weeklyChange = history.length >= 5
    ? ((history[history.length - 1]?.close - history[0]?.close) / (history[0]?.close || 1)) * 100
    : null;
  const monthChange = history.length >= 10
    ? ((history[history.length - 1]?.close - history[0]?.close) / (history[0]?.close || 1)) * 100
    : null;
  const displaySymbol = market === 'us' ? (quote.symbol || symbol) : (quote.symbol?.replace(/\.(NS|BO)$/, '') || symbol.replace(/\.(NS|BO)$/, ''));
  const price = quote.regularMarketPrice ?? quote.preMarketPrice;
  return {
    symbol: displaySymbol,
    market,
    name: quote.shortName || quote.longName || symbol,
    price,
    change: quote.regularMarketChange ?? 0,
    changePercent: quote.regularMarketChangePercent ?? quote.regularMarketChange ?? 0,
    volume: quote.regularMarketVolume,
    marketCap: quote.marketCap,
    weekChange: weeklyChange,
    monthChange,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    history: history.slice(-14).map((q) => ({ date: q.date, close: q.close })),
    ...(sector ? { sector } : {}),
    ...(isPSU ? { isPSU: true } : {}),
  };
}

const SEGMENTS = ['large', 'mid', 'small', 'flexi'];

/** Use Yahoo screener (2 API calls vs 60+) - more reliable when quote() fails. */
async function getStocksViaScreener(market, count = 50) {
  const region = market === 'us' ? 'US' : 'IN';
  const lang = market === 'us' ? 'en-US' : 'en-IN';
  try {
    const [gainersRes, losersRes] = await Promise.all([
      yahooFinance.screener({ scrIds: 'day_gainers', region, lang, count }),
      yahooFinance.screener({ scrIds: 'day_losers', region, lang, count }),
    ]);
    const mapScreenerQuote = (q, rank) => {
      const sym = String(q.symbol || '')
        .replace(/\.(NS|BO)$/i, '')
        .trim()
        .toUpperCase();
      const fromStatic =
        market === 'us' && sym && US_STATIC_SECTOR_BY_SYMBOL[sym]
          ? normalizeSectorForDisplay(US_STATIC_SECTOR_BY_SYMBOL[sym], '')
          : null;
      const sectorRawS = q.sector ? String(q.sector).trim() : '';
      const industryRawS = q.industry ? String(q.industry).trim() : '';
      const sectorNorm =
        normalizeSectorForDisplay(sectorRawS, industryRawS) || fromStatic;
      const qName = q.shortName || q.longName || q.symbol || '';
      const isPSU =
        market === 'in' && inferIsPSU(sym, qName, sectorRawS, industryRawS);
      return {
        symbol: q.symbol || '',
        market,
        name: q.shortName || q.longName || q.symbol || '',
        price: q.regularMarketPrice ?? q.preMarketPrice,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        weekChange: null,
        monthChange: null,
        history: [],
        segment: 'flexi',
        segmentName: 'Flexi Cap',
        rank,
        ...(sectorNorm ? { sector: sectorNorm } : {}),
        ...(isPSU ? { isPSU: true } : {}),
      };
    };
    const gainers = (gainersRes?.quotes || []).map((q, i) => mapScreenerQuote(q, i + 1)).filter((s) => s.symbol && s.price != null);
    const losers = (losersRes?.quotes || []).map((q, i) => mapScreenerQuote(q, i + 1)).filter((s) => s.symbol && s.price != null);
    const segmentData = {};
    for (const seg of SEGMENTS) {
      segmentData[seg] = {
        topGainers: gainers.slice(0, count).map((s, i) => ({ ...s, segment: seg, segmentName: SEGMENT_NAMES[seg], rank: i + 1 })),
        topLosers: losers.slice(0, count).map((s, i) => ({ ...s, segment: seg, segmentName: SEGMENT_NAMES[seg], rank: i + 1 })),
      };
    }
    return segmentData;
  } catch (err) {
    console.warn('[Screener]', err.message);
    return null;
  }
}

async function getTopStocksBySegment(limit = DEFAULT_LIMIT, segmentFilter = null, market = 'in') {
  const cacheKey = `${market}:${limit}:${segmentFilter || 'all'}`;
  const cached = stocksCacheByLimit[cacheKey];
  if (cached && Date.now() - (stocksCacheTimeByLimit[cacheKey] || 0) < CACHE_TTL_MS) {
    return cached;
  }

  // 1. Individual quotes via v8 chart (no cookies) + NSE/Yahoo fallback - most reliable
  const lists = market === 'us' ? getStockListsForUS() : await getStockListsBySegment();
  const listsToUse = segmentFilter && SEGMENTS.includes(segmentFilter)
    ? { [segmentFilter]: lists[segmentFilter] || [] }
    : lists;
  let segmentData = await processAllSegmentsDeduplicated(listsToUse, limit, market);

  const hasData = SEGMENTS.some((seg) =>
    (segmentData[seg]?.topGainers?.length || 0) + (segmentData[seg]?.topLosers?.length || 0) > 0
  );

  // 2. Try Yahoo screener only if individual fetches returned nothing
  if (!hasData) {
    const screenerData = await getStocksViaScreener(market, Math.min(limit, 50));
    if (screenerData) segmentData = screenerData;
  }

  SEGMENTS.forEach((seg) => {
    if (!segmentData[seg]) {
      segmentData[seg] = { topGainers: [], topLosers: [] };
    }
  });
  stocksCacheByLimit[cacheKey] = segmentData;
  stocksCacheTimeByLimit[cacheKey] = Date.now();
  return segmentData;
}

async function getAIProsCons(stock) {
  if (!groq) {
    return {
      pros: ['AI analysis requires GROQ_API_KEY in .env'],
      cons: ['Add GROQ_API_KEY to enable AI-powered pros and cons'],
    };
  }
  const prompt = `You are an Indian stock market analyst. Analyze this stock for today's market session:

Stock: ${stock.name} (${stock.symbol})
Segment: ${stock.segment}
Current Price: ₹${stock.price}
Today's Change: ${stock.changePercent}%
${stock.weekChange != null ? `Week Change: ${stock.weekChange.toFixed(2)}%` : ''}

Provide a brief analysis (1-2 short sentences max), then list exactly:
- 3 PROS (very short bullet points, specific to this stock)
- 3 CONS (very short bullet points, specific to this stock)

Each bullet must be <= 7 words.
Avoid filler words and long explanations.

Format your response as JSON only:
{"pros": ["pro1", "pro2", "pro3"], "cons": ["con1", "con2", "con3"]}`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    const text = completion.choices[0]?.message?.content || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const tighten = (arr) =>
        (Array.isArray(arr) ? arr : [])
          .map((x) => String(x || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .map((line) => line.split(' ').slice(0, 7).join(' '))
          .slice(0, 3);
      const pros = tighten(parsed.pros);
      const cons = tighten(parsed.cons);
      while (pros.length < 3) pros.push('Limited positive visibility');
      while (cons.length < 3) cons.push('Limited negative visibility');
      return { pros, cons };
    }
  } catch (err) {
    console.error('Groq error:', err.message);
  }
  return { pros: ['Analysis unavailable'], cons: ['Check server logs'] };
}

function isGroqRateLimitError(err) {
  const msg = String(err?.message || '');
  return /rate limit/i.test(msg) || /429/.test(msg) || err?.status === 429 || err?.code === 'rate_limit_exceeded';
}

function inferOwnershipLabel(description, sector, industry, companyName) {
  const t = `${description || ''} ${sector || ''} ${industry || ''} ${companyName || ''}`.toLowerCase();
  if (
    /\b(psu|public sector undertaking|government company|govt\.?\s*company|state-owned|government of india|ministry of|department of|central public sector|coal india|oil and natural|bharat petroleum|indian oil|ongc|ntpc|power grid|sail\b|bhel\b|bel\b|hal\b|nhpc\b|sjvn\b|irctc\b|concor\b)/i.test(
      t,
    )
  ) {
    return 'Government-linked / PSU (or strong public-sector context)';
  }
  if (/\bprivate\b/.test(t) && /\b(limited|ltd|inc|corp)\b/i.test(String(companyName || ''))) {
    return 'Typically private-sector listed company';
  }
  if (!t.replace(/\s/g, '').length) return 'Use shareholding / annual report for ownership detail';
  return 'Listed company — confirm ownership via latest shareholding / annual report';
}

function clipProfileText(s, maxLen = 1800) {
  if (!s || typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1).trim()}…`;
}

function sanitizeWebsiteUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(t)) return `https://${t}`;
  return '';
}

function pickLeadershipFromOfficers(officers) {
  if (!Array.isArray(officers) || officers.length === 0) return '';
  const titleOf = (o) => String(o?.title || '').trim();
  const nameOf = (o) => String(o?.name || '').trim();
  const patterns = [
    /chief executive|chief exec\.?|^ceo\b/i,
    /managing director|^md\b/i,
    /chairman\s+(and|&)?\s*managing|chairman\s*&\s*managing/i,
    /chairman(?!ship)/i,
    /whole[- ]?time\s*director/i,
    /president\b/i,
    /director\s*\(?\s*operations/i,
  ];
  for (const re of patterns) {
    const row = officers.find((o) => re.test(titleOf(o)) && nameOf(o));
    if (row) return `${nameOf(row)} — ${titleOf(row)}`;
  }
  const first = officers.find((o) => nameOf(o));
  if (first) return `${nameOf(first)} — ${titleOf(first) || 'Leadership'}`;
  return '';
}

function buildDescriptionFallback({ longName, shortName, sector, industry, exchangeName, symbol }) {
  const name = (longName || shortName || symbol || 'This company').trim();
  const sec = sector && sector !== '—' ? sector.trim() : '';
  const ind = industry && industry !== '—' ? industry.trim() : '';
  const bits = [sec, ind].filter(Boolean);
  const seg = bits.length ? bits.join(' · ') : '';
  const ex = exchangeName ? `Listed on ${exchangeName}` : 'Listed equity';
  if (seg) {
    return `${name} — ${seg}. Full business summary is not available from the quote feed; check the company website or annual report.`;
  }
  return `${name} — ${ex}. Business summary not available from the data feed; use filings or the company site for background.`;
}

async function fetchStockProfileForInfo(yfSymbol) {
  try {
    const r = await yahooFinance.quoteSummary(yfSymbol, { modules: ['summaryProfile', 'assetProfile', 'price'] });
    const sp = r?.summaryProfile || {};
    const ap = r?.assetProfile || {};
    const pr = r?.price || {};
    const longName = String(pr.longName || '').trim();
    const shortName = String(pr.shortName || '').trim();
    const exchangeName = String(pr.exchangeName || pr.exchange || '').trim();
    const descRaw = sp.longBusinessSummary || ap.longBusinessSummary || '';
    let desc = typeof descRaw === 'string' ? descRaw.replace(/\s+/g, ' ').trim() : '';
    const sectorY = String(sp.sector || ap.sector || '').trim();
    const industryY = String(sp.industry || ap.industry || '').trim();
    if (!desc) {
      desc = buildDescriptionFallback({
        longName,
        shortName,
        sector: sectorY,
        industry: industryY,
        exchangeName,
        symbol: yfSymbol,
      });
    }
    desc = clipProfileText(desc, 2000);
    const officers = Array.isArray(ap.companyOfficers) ? ap.companyOfficers : [];
    const ceo = pickLeadershipFromOfficers(officers);
    const website = sanitizeWebsiteUrl(sp.website || ap.website || '');
    return {
      description: desc,
      sector: sectorY,
      industry: industryY,
      ceo,
      website,
      longName,
      shortName,
      exchangeName,
    };
  } catch (err) {
    console.warn('[stock-info] quoteSummary failed:', err.message);
    return null;
  }
}

function computeThreeYearMetrics(history) {
  const h = (history || []).filter((x) => x && Number(x.close) > 0);
  if (h.length < 10) return null;
  const first = Number(h[0].close);
  const last = Number(h[h.length - 1].close);
  const totalReturnPct = first > 0 ? ((last - first) / first) * 100 : null;
  let peak = first;
  let maxDrawdownPct = 0;
  for (const q of h) {
    const c = Number(q.close);
    if (c > peak) peak = c;
    const dd = peak > 0 ? ((peak - c) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }
  const years = 3;
  const cagr = first > 0 && last > 0 ? (Math.pow(last / first, 1 / years) - 1) * 100 : null;
  return {
    totalReturnPct,
    maxDrawdownPct,
    cagr,
    dataPoints: h.length,
    startClose: first,
    endClose: last,
  };
}

function parseFundNumLoose(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function buildInvestmentPerspective(fundamentals, metrics) {
  const lines = [];
  const pe = parseFundNumLoose(fundamentals?.pe);
  const fpe = parseFundNumLoose(fundamentals?.forwardPE);
  const divy = parseFundNumLoose(fundamentals?.dividendYield);
  if (metrics && metrics.totalReturnPct != null) {
    lines.push(
      `Roughly 3-year price return ≈ ${metrics.totalReturnPct.toFixed(1)}% (start-to-end). Estimated 3Y CAGR ≈ ${
        metrics.cagr != null ? `${metrics.cagr.toFixed(1)}%` : 'n/a'
      }.`,
    );
    lines.push(
      `Within that window, max drawdown from a prior peak ≈ ${metrics.maxDrawdownPct.toFixed(1)}% (depth of largest dip from highs).`,
    );
  } else {
    lines.push('Not enough 3-year price history to quantify return and drawdown — try again later or verify the symbol.');
  }
  if (pe != null) {
    if (pe < 0 || pe > 200) {
      lines.push(`Trailing P/E is unusual (${pe.toFixed(1)}); check earnings quality and one-offs.`);
    } else if (pe > 40) {
      lines.push(`Trailing P/E is elevated (~${pe.toFixed(1)}); valuation assumes strong growth — more sensitive to earnings misses.`);
    } else if (pe < 12) {
      lines.push(`Trailing P/E is relatively low (~${pe.toFixed(1)}); may reflect value or weak growth — compare with peers.`);
    } else {
      lines.push(`Trailing P/E near ${pe.toFixed(1)} — compare with sector peers and growth.`);
    }
  }
  if (fpe != null && fpe > 0 && pe != null && pe > 0 && fpe < pe * 0.9) {
    lines.push(`Forward P/E (${fpe.toFixed(1)}) is below trailing — consensus may expect higher forward earnings.`);
  }
  if (divy != null && divy > 2.5) {
    lines.push(`Indicative dividend yield ~${divy.toFixed(1)}% — verify payout ratio and sustainability.`);
  }
  lines.push('Educational summary only — not investment advice. Use your own judgment and horizon.');
  return lines;
}

/** Best-stock algorithm: rank top 150 losers by composite score.
 *  Uses: dip, 52W proximity (near low = more upside), liquidity, momentum, size, and related params. */
function computeBestRanks(segmentData) {
  const allLosers = [];
  for (const [segment, data] of Object.entries(segmentData || {})) {
    for (const s of data.topLosers || []) {
      allLosers.push({ ...s, segment });
    }
  }
  const byChange = [...allLosers].sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
  const top150 = byChange.slice(0, 150);
  const volumeLog = (v) => Math.log10(Math.max(v || 1, 1));
  const capLog = (v) => Math.log10(Math.max(v || 1, 1));
  const scored = top150.map((s) => {
    const dip = -(s.changePercent ?? 0);
    const vol = volumeLog(s.volume) * 0.3;
    const week = (s.weekChange ?? 0) < 0 ? 0.5 : 0;
    const month = (s.monthChange ?? 0) < 0 ? 0.3 : 0;
    const cap = capLog(s.marketCap) * 0.2;

    // 52W proximity: (high - price) / (high - low) = upside potential in range. Higher = nearer to 52W low = better.
    let fiftyTwoWScore = 0;
    const price = s.price ?? 0;
    const high = s.fiftyTwoWeekHigh;
    const low = s.fiftyTwoWeekLow;
    if (high != null && low != null && high > low && price > 0) {
      const upsideInRange = (high - price) / (high - low);
      fiftyTwoWScore = Math.max(0, Math.min(1, upsideInRange)) * 2;
    }

    // Additional: volume-to-cap turnover (liquidity)
    const mcap = s.marketCap ?? 1;
    const turnover = (s.volume ?? 0) / mcap;
    const turnoverScore = Math.min(1, Math.log10(Math.max(turnover * 1e6, 1)) / 8) * 0.3;

    const bestScore = dip * 2 + vol + week + month + cap + fiftyTwoWScore + turnoverScore;
    return { ...s, _bestScore: bestScore };
  });
  scored.sort((a, b) => (b._bestScore ?? 0) - (a._bestScore ?? 0));
  const symbolToBestRank = {};
  scored.forEach((s, i) => {
    symbolToBestRank[s.symbol] = i + 1;
  });
  return symbolToBestRank;
}

const STOCKS_API_TIMEOUT_MS = 60000; // 60s max for full fetch

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms)),
  ]).catch((err) => {
    if (fallback !== undefined) return fallback;
    throw err;
  });
}

app.get('/api/stocks', async (req, res) => {
  const emptyFallback = () =>
    SEGMENTS.map((seg) => ({
      segment: seg,
      segmentName: SEGMENT_NAMES[seg],
      topGainers: [],
      topLosers: [],
    }));

  try {
    const raw = parseInt(req.query.limit, 10);
    const limit = ALLOWED_LIMITS.includes(raw) ? raw : 150;
    const segment = req.query.segment || null;
    const market = ALLOWED_MARKETS.includes(req.query.market) ? req.query.market : 'in';
    if (req.query.refresh === '1') {
      const cacheKey = `${market}:${limit}:${segment || 'all'}`;
      delete stocksCacheByLimit[cacheKey];
    }

    const segmentData = await withTimeout(
      getTopStocksBySegment(limit, segment || null, market),
      STOCKS_API_TIMEOUT_MS,
      Object.fromEntries(SEGMENTS.map((s) => [s, { topGainers: [], topLosers: [] }]))
    );

    const bestRankMap = market === 'in' ? computeBestRanks(segmentData) : {};
    const addBestRank = (s) => {
      const rank = bestRankMap[s.symbol];
      return rank != null ? { ...s, bestRank: rank } : s;
    };
    const formatted = Object.entries(segmentData).map(([key, data]) => ({
      segment: key,
      segmentName: SEGMENT_NAMES[key],
      topGainers: (data.topGainers || []).map((s) => addBestRank({ ...s, segment: key, segmentName: SEGMENT_NAMES[key] })),
      topLosers: (data.topLosers || []).map((s) => addBestRank({ ...s, segment: key, segmentName: SEGMENT_NAMES[key] })),
    }));
    res.json({ segments: formatted, date: new Date().toISOString(), market });
  } catch (err) {
    console.error('[api/stocks]', err.message);
    res.json({ segments: emptyFallback(), date: new Date().toISOString(), market: req.query.market || 'in', error: err.message });
  }
});

const CHART_PERIODS = { '7d': 7, '1m': 30, '1y': 365, '3y': 1095, '5y': 1825 };

app.get('/api/chart/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    const period = req.query.period || '1m';
    const market = req.query.market || 'in';
    const days = CHART_PERIODS[period] ?? 30;
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });
    const yfSymbol = toYahooSymbol(symbol, market);
    const history = await fetchHistorical(yfSymbol, days);
    res.json({ symbol, period, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Chennai gold rates from Goodreturns (via Jina reader). No Yahoo/COMEX data. */
app.get('/api/gold/chennai', async (req, res) => {
  try {
    const goodreturns = await getGoodreturnsChennaiCached();
    res.json({ goodreturns });
  } catch (err) {
    console.error('[api/gold/chennai]', err);
    res.status(500).json({ error: err.message });
  }
});

/** Yahoo symbols: Nifty 50, S&P BSE Sensex */
const INDIA_INDEX_YAHOO = { nifty: '^NSEI', sensex: '^BSESN' };

function mapIndexQuote(q) {
  if (!q) return null;
  const price = q.regularMarketPrice ?? q.preMarketPrice;
  const change = q.regularMarketChange ?? 0;
  const changePercent = q.regularMarketChangePercent ?? 0;
  return {
    price: price != null ? Number(price) : null,
    change: Number(change),
    changePercent: Number(changePercent),
  };
}

app.get('/api/indices/in', async (req, res) => {
  try {
    const [niftyQ, sensexQ] = await Promise.all([
      fetchQuote(INDIA_INDEX_YAHOO.nifty),
      fetchQuote(INDIA_INDEX_YAHOO.sensex),
    ]);
    res.json({
      nifty: mapIndexQuote(niftyQ),
      sensex: mapIndexQuote(sensexQ),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[api/indices/in]', err);
    res.status(500).json({ error: err.message || 'indices_failed' });
  }
});

const SCREENER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Parse number from Screener format (e.g. "18,87,915" or "47.5" or "0.39") */
function parseScreenerNum(s) {
  if (!s || typeof s !== 'string') return null;
  const cleaned = s.replace(/,/g, '').replace(/₹\s*/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Get fundamentals from Screener.in (India only) - parses company page HTML. */
async function getFundamentalsViaScreener(symbol, fmt, fmtPct, fmtIndian) {
  const screenerSymbol = symbol.replace(/\.(NS|BO)$/, '');
  if (!screenerSymbol) return null;
  try {
    const url = `https://www.screener.in/company/${encodeURIComponent(screenerSymbol)}/`;
    const res = await fetch(url, { headers: SCREENER_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    const ratios = {};
    const liRegex = /<li[^>]*>[\s\S]*?<span class="name">\s*([^<]+)\s*<\/span>[\s\S]*?<span class="nowrap value"[^>]*>([\s\S]*?)<\/span>(?=\s*<\/li>)/g;
    let m;
    while ((m = liRegex.exec(html)) !== null) {
      const name = m[1].trim();
      const rawVal = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      ratios[name] = rawVal;
    }
    if (Object.keys(ratios).length === 0) return null;
    const get = (k) => ratios[k] ?? null;
    const peNum = parseScreenerNum(get('Stock P/E'));
    const divYield = parseScreenerNum(get('Dividend Yield'));
    const priceNum = parseScreenerNum(get('Current Price'));
    let epsNum = null;
    let epsQuarterlyNum = null;
    const epsRows = html.match(/<tr[^>]*>\s*<td[^>]*class="text"[^>]*>\s*EPS in Rs\s*<\/td>([\s\S]*?)<\/tr>/g) || [];
    if (epsRows.length >= 2) {
      const annualCells = epsRows[1].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      const annualVals = annualCells.slice(1).map((c) => parseScreenerNum(c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())).filter((n) => n != null);
      epsNum = annualVals.length > 0 ? annualVals[annualVals.length - 1] : null;
    }
    if (epsRows.length >= 1) {
      const qCells = epsRows[0].match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
      const qVals = qCells.slice(1).map((c) => parseScreenerNum(c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())).filter((n) => n != null);
      epsQuarterlyNum = qVals.length > 0 ? qVals[qVals.length - 1] : null;
    }
    const forwardPENum = priceNum != null && epsQuarterlyNum != null && epsQuarterlyNum > 0
      ? priceNum / (epsQuarterlyNum * 4)
      : null;
    const highLow = get('High / Low') || '';
    const parts = highLow.split(/\s*\/\s*/);
    const highStr = parts[0] ? parts[0].replace(/,/g, '') : '';
    const lowStr = parts[1] ? parts[1].replace(/,/g, '') : '';
    const fiftyTwoWeekHigh = highStr ? parseFloat(highStr.replace(/[^\d.]/g, '')) : null;
    const fiftyTwoWeekLow = lowStr ? parseFloat(lowStr.replace(/[^\d.]/g, '')) : null;
    const marketCapStr = get('Market Cap') || '';
    const marketCapNum = parseScreenerNum(marketCapStr.replace(/Cr\.?$/i, '').trim());
    const marketCapFormatted = marketCapNum != null ? fmtIndian(marketCapNum * 1e7) : '—';
    return {
      symbol: screenerSymbol,
      price: get('Current Price') ? get('Current Price').replace(/\s+/g, ' ').trim() : '—',
      marketCap: marketCapFormatted,
      volume: '—',
      avgVolume: '—',
      pe: peNum != null ? fmt(peNum) : '—',
      forwardPE: forwardPENum != null ? fmt(forwardPENum) : '—',
      peg: '—',
      eps: epsNum != null ? fmt(epsNum) : '—',
      dividendYield: divYield != null ? fmtPct(divYield / 100) : '—',
      fiftyTwoWeekHigh: fiftyTwoWeekHigh != null ? fmt(fiftyTwoWeekHigh) : '—',
      fiftyTwoWeekLow: fiftyTwoWeekLow != null ? fmt(fiftyTwoWeekLow) : '—',
      open: '—',
      dayHigh: '—',
      dayLow: '—',
    };
  } catch (err) {
    console.warn('[Fundamentals] Screener.in failed:', err.message);
    return null;
  }
}

/** Get fundamentals from Alpha Vantage OVERVIEW (full data) - requires ALPHA_VANTAGE_API_KEY. */
async function getFundamentalsViaAlphaVantage(symbol, market) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey || !apiKey.trim()) return null;
  const avSymbol = symbol.replace(/\.(NS|BO)$/, '') + (market === 'in' ? '.NS' : '');
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(avSymbol)}&apikey=${apiKey}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.Note || data['Error Message']) return null;
    const fmt = (v) => (v == null || v === undefined || v === 'None' || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v));
    const fmtPct = (v) => {
      if (v == null || v === undefined || v === 'None' || v === '') return '—';
      const n = parseFloat(v);
      return isNaN(n) ? '—' : `${n.toFixed(2)}%`;
    };
    const fmtIndian = (v) => {
      if (v == null || v === undefined || v === 'None' || v === '') return '—';
      const n = parseFloat(v);
      if (isNaN(n)) return String(v);
      const abs = Math.abs(n);
      if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} Lakh Cr`;
      if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
      if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
      return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };
    return {
      symbol: data.Symbol || symbol,
      price: '—',
      marketCap: fmtIndian(data.MarketCapitalization),
      volume: '—',
      avgVolume: '—',
      pe: fmt(data.PERatio),
      forwardPE: fmt(data.ForwardPE),
      peg: fmt(data.PEGRatio),
      eps: fmt(data.EPS),
      dividendYield: fmtPct(data.DividendYield != null && data.DividendYield !== '' ? parseFloat(data.DividendYield) : null),
      fiftyTwoWeekHigh: fmt(data['52WeekHigh']),
      fiftyTwoWeekLow: fmt(data['52WeekLow']),
      open: '—',
      dayHigh: '—',
      dayLow: '—',
    };
  } catch (err) {
    console.warn('[Fundamentals] Alpha Vantage failed:', err.message);
    return null;
  }
}

/** Get fundamentals from v8 chart meta (no cookies) - works reliably. Yahoo quoteSummary requires cookies and often fails. */
async function getFundamentalsViaChart(symbol) {
  for (const host of YAHOO_CHART_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
      const res = await fetch(url, { headers: YAHOO_HEADERS });
      if (!res.ok) continue;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) continue;
      const fmt = (v) => (v == null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v));
      const fmtIndian = (v) => {
        if (v == null || v === undefined) return '—';
        if (typeof v !== 'number') return String(v);
        const n = Math.abs(v);
        if (n >= 1e12) return `${(v / 1e12).toFixed(2)} Lakh Cr`;
        if (n >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
        if (n >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
        return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      };
      return {
        symbol: meta.symbol || symbol,
        price: fmt(meta.regularMarketPrice),
        marketCap: '—',
        volume: fmtIndian(meta.regularMarketVolume),
        avgVolume: '—',
        pe: '—',
        forwardPE: '—',
        peg: '—',
        eps: '—',
        dividendYield: '—',
        fiftyTwoWeekHigh: fmt(meta.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: fmt(meta.fiftyTwoWeekLow),
        open: fmt(meta.chartPreviousClose),
        dayHigh: fmt(meta.regularMarketDayHigh),
        dayLow: fmt(meta.regularMarketDayLow),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function formatProfitAmountForMarket(v, market) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (market === 'us') {
    const a = Math.abs(n);
    if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(2)} Lakh Cr`;
  if (a >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function pickNetIncomeFromFtsRow(row) {
  if (!row || typeof row !== 'object') return null;
  const keys = [
    'netIncome',
    'netIncomeCommonStockholders',
    'netIncomeFromContinuingOperationNetMinorityInterest',
    'netIncomeContinuousOperations',
  ];
  for (const k of keys) {
    const v = row[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function pickRevenueFromFtsRow(row) {
  if (!row || typeof row !== 'object') return null;
  for (const k of ['totalRevenue', 'operatingRevenue']) {
    const v = row[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function fundamentalsDateKeyISO(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function formatQuarterLabelFromISO(isoDate) {
  const [y, m, day] = String(isoDate || '').split('-').map(Number);
  if (!y || !m) return String(isoDate || '—');
  const d = new Date(Date.UTC(y, m - 1, day || 1));
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

async function buildQuarterlyProfitPayload(yfSymbol, market, displaySymbol) {
  const period1wide = new Date();
  period1wide.setFullYear(period1wide.getFullYear() - 15);

  const [ftsQuarterly, ftsAnnual, qsSummary] = await Promise.all([
    yahooFinance.fundamentalsTimeSeries(yfSymbol, {
      period1: period1wide,
      period2: new Date(),
      type: 'quarterly',
      module: 'financials',
    }).catch(() => []),
    yahooFinance.fundamentalsTimeSeries(yfSymbol, {
      period1: period1wide,
      period2: new Date(),
      type: 'annual',
      module: 'financials',
    }).catch(() => []),
    yahooFinance.quoteSummary(yfSymbol, { modules: ['incomeStatementHistoryQuarterly'] }).catch(() => ({})),
  ]);

  const byDate = new Map();
  for (const row of ftsQuarterly || []) {
    const k = fundamentalsDateKeyISO(row.date);
    if (!k) continue;
    const ni = pickNetIncomeFromFtsRow(row);
    const tr = pickRevenueFromFtsRow(row);
    byDate.set(k, { periodEnd: k, netIncome: ni, totalRevenue: tr });
  }

  const qHist = qsSummary?.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
  for (const row of qHist) {
    const k = fundamentalsDateKeyISO(row.endDate);
    if (!k) continue;
    if (!byDate.has(k)) {
      const ni = row.netIncome != null && Number.isFinite(Number(row.netIncome)) ? Number(row.netIncome) : null;
      const tr =
        row.totalRevenue != null && Number.isFinite(Number(row.totalRevenue)) ? Number(row.totalRevenue) : null;
      byDate.set(k, { periodEnd: k, netIncome: ni, totalRevenue: tr });
    }
  }

  const quarters = [...byDate.values()]
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
    .slice(0, 15)
    .map((q) => ({
      periodEnd: q.periodEnd,
      label: formatQuarterLabelFromISO(q.periodEnd),
      netIncome: q.netIncome,
      totalRevenue: q.totalRevenue,
      netIncomeDisplay: formatProfitAmountForMarket(q.netIncome, market),
      totalRevenueDisplay: formatProfitAmountForMarket(q.totalRevenue, market),
    }));

  const annual = (ftsAnnual || [])
    .map((row) => ({
      fiscalYearEnd: fundamentalsDateKeyISO(row.date),
      netIncome: pickNetIncomeFromFtsRow(row),
    }))
    .filter((x) => x.fiscalYearEnd && x.netIncome != null)
    .sort((a, b) => b.fiscalYearEnd.localeCompare(a.fiscalYearEnd))
    .slice(0, 5)
    .map((x) => ({
      fiscalYearEnd: x.fiscalYearEnd,
      label: formatQuarterLabelFromISO(x.fiscalYearEnd),
      netIncome: x.netIncome,
      netIncomeDisplay: formatProfitAmountForMarket(x.netIncome, market),
    }));

  return {
    symbol: displaySymbol,
    market,
    quarters,
    annual,
    disclaimer:
      'Net profit (net income) and revenue from Yahoo Finance, in the company’s reporting currency. Recent Yahoo feeds often include a limited number of quarters; fiscal-year totals below cover up to the last five reported years.',
  };
}

app.get('/api/quarterly-profit/:symbol', async (req, res) => {
  try {
    let symbol = (req.params.symbol || '').trim().toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });
    symbol = symbol.replace(/\.(NS|BO)$/i, '');
    const market = ALLOWED_MARKETS.includes(req.query.market) ? req.query.market : 'in';
    const yfSymbol = toYahooSymbol(symbol, market);
    const payload = await buildQuarterlyProfitPayload(yfSymbol, market, symbol);
    res.json(payload);
  } catch (err) {
    console.warn('[quarterly-profit]', err.message);
    res.status(500).json({ error: err.message || 'quarterly_profit_failed' });
  }
});

app.get('/api/fundamentals/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    const market = req.query.market || 'in';
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });
    const yfSymbol = toYahooSymbol(symbol, market);
    const fmt = (v) => (v == null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : String(v));
    const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
    const fmtIndian = (v) => {
      if (v == null || v === undefined) return '—';
      if (typeof v !== 'number') return String(v);
      const n = Math.abs(v);
      if (n >= 1e12) return `${(v / 1e12).toFixed(2)} Lakh Cr`;
      if (n >= 1e7) return `${(v / 1e7).toFixed(2)} Cr`;
      if (n >= 1e5) return `${(v / 1e5).toFixed(2)} L`;
      return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    };
    // 1. For India: try Screener.in first (full fundamentals, no API key)
    // 2. Try Alpha Vantage when API key is set (US stocks or fallback)
    let result = market === 'in' ? await getFundamentalsViaScreener(yfSymbol, fmt, fmtPct, fmtIndian) : null;
    if (!result) result = await getFundamentalsViaAlphaVantage(yfSymbol, market);
    // 2. Get chart data (volume, day range, price) - merge or use as fallback
    const chartData = await getFundamentalsViaChart(yfSymbol);
    if (chartData) {
      result = result || {};
      const useChart = (v) => (v == null || v === '—' || v === '');
      result.volume = useChart(result.volume) ? chartData.volume : result.volume;
      result.avgVolume = useChart(result.avgVolume) ? chartData.volume : result.avgVolume;
      result.dayHigh = useChart(result.dayHigh) ? chartData.dayHigh : result.dayHigh;
      result.dayLow = useChart(result.dayLow) ? chartData.dayLow : result.dayLow;
      result.open = useChart(result.open) ? chartData.open : result.open;
      result.fiftyTwoWeekHigh = useChart(result.fiftyTwoWeekHigh) ? chartData.fiftyTwoWeekHigh : result.fiftyTwoWeekHigh;
      result.fiftyTwoWeekLow = useChart(result.fiftyTwoWeekLow) ? chartData.fiftyTwoWeekLow : result.fiftyTwoWeekLow;
      result.price = useChart(result.price) ? chartData.price : result.price;
      result.symbol = result.symbol || chartData.symbol || symbol;
    }
    if (!result) result = chartData;
    if (!result) return res.status(500).json({ error: 'Could not fetch fundamentals' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/** Lightweight live quote for UI search cards / buy flow. */
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol || '').toUpperCase();
    const market = req.query.market || 'in';
    if (!symbol) return res.status(400).json({ error: 'Symbol required' });
    const yfSymbol = toYahooSymbol(symbol, market);
    const q = await fetchQuote(yfSymbol);
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    const price = q.regularMarketPrice ?? q.preMarketPrice ?? null;
    const changePercent = q.regularMarketChangePercent ?? q.regularMarketChange ?? null;
    const plainSym = String(q.symbol || symbol)
      .replace(/\.(NS|BO)$/i, '')
      .trim()
      .toUpperCase();
    const qName = q.shortName || q.longName || symbol;
    const isPSU = market === 'in' && inferIsPSU(plainSym, qName, '', '');
    return res.json({
      symbol: (q.symbol || symbol).replace(/\.(NS|BO)$/i, ''),
      name: q.shortName || q.longName || symbol,
      market,
      price,
      change: q.regularMarketChange ?? 0,
      changePercent,
      volume: q.regularMarketVolume ?? null,
      marketCap: q.marketCap ?? null,
      ...(isPSU ? { isPSU: true } : {}),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'quote_failed' });
  }
});

/** Search stocks by text (fallback for UI when not found in local list). */
app.get('/api/search/stocks', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ q, results: [] });
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0`;
    const r = await fetch(url, { headers: YAHOO_HEADERS });
    if (!r.ok) return res.status(r.status).json({ error: `search_${r.status}` });
    const data = await r.json();
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    const results = quotes
      .filter((x) => x?.symbol && (x?.quoteType === 'EQUITY' || x?.quoteType === 'ETF'))
      .map((x) => {
        const symbol = String(x.symbol || '').trim();
        const exchange = String(x.exchDisp || x.exchange || '').toUpperCase();
        const market = /\.NS$|\.BO$/i.test(symbol) || /NSE|BSE/.test(exchange) ? 'in' : 'us';
        return {
          symbol,
          name: String(x.shortname || x.longname || symbol),
          market,
          exchange,
        };
      })
      // India market search should only include NSE (not BSE) instruments.
      .filter((x) => x.market !== 'in' || /\.NS$/i.test(x.symbol) || /\bNSE\b/.test(String(x.exchange || '')))
      .slice(0, 20);
    res.json({ q, results });
  } catch (err) {
    res.status(500).json({ error: err.message || 'search_failed' });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { stock } = req.body;
    if (!stock) return res.status(400).json({ error: 'Stock object required' });
    const analysis = await getAIProsCons(stock);
    res.json(analysis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const DDG_FETCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function stripHtmlEntitiesLoose(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectDdgRelatedTopics(topics, out, depth = 0) {
  if (!Array.isArray(topics) || depth > 5 || out.length > 24) return;
  for (const t of topics) {
    if (t && typeof t === 'object' && t.Text) out.push(String(t.Text));
    if (t && typeof t === 'object' && Array.isArray(t.Topics)) collectDdgRelatedTopics(t.Topics, out, depth + 1);
  }
}

/**
 * DuckDuckGo web context — no API key (Instant Answer JSON + HTML result snippets).
 * Tavily is not required: DDG is free and public; quality varies vs paid search APIs.
 */
async function fetchDuckDuckGoContextForCompany(query) {
  const q = String(query).slice(0, 400);
  const parts = [];

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { 'User-Agent': DDG_FETCH_UA } });
    if (res.ok) {
      const j = await res.json();
      if (j.AbstractText) parts.push(`Summary: ${stripHtmlEntitiesLoose(j.AbstractText)}`);
      if (j.Answer) parts.push(`Answer: ${stripHtmlEntitiesLoose(String(j.Answer))}`);
      if (j.Definition) parts.push(`Definition: ${stripHtmlEntitiesLoose(String(j.Definition))}`);
      const rel = [];
      collectDdgRelatedTopics(j.RelatedTopics, rel);
      rel.slice(0, 12).forEach((line) => parts.push(line));
    }
  } catch (e) {
    console.warn('[ddg-instant]', e.message);
  }

  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': DDG_FETCH_UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      body: new URLSearchParams({ q: q }).toString(),
    });
    if (res.ok) {
      const html = await res.text();
      const seen = new Set();
      const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let sm;
      while ((sm = snippetRe.exec(html)) !== null) {
        const s = stripHtmlEntitiesLoose(sm[1]);
        if (s.length > 35 && !seen.has(s)) {
          seen.add(s);
          parts.push(`Search snippet: ${s}`);
          if (seen.size >= 8) break;
        }
      }
      const titleRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let tm;
      let n = 0;
      while ((tm = titleRe.exec(html)) !== null && n < 6) {
        const href = tm[1];
        const title = stripHtmlEntitiesLoose(tm[2]);
        if (href && !href.includes('duckduckgo.com') && title.length > 5) {
          parts.push(`Result: ${title}\n${href}`);
          n++;
        }
      }
    }
  } catch (e) {
    console.warn('[ddg-html]', e.message);
  }

  const text = parts.join('\n\n').slice(0, 12000);
  return { used: text.length > 0, text };
}

async function enrichCompanyProfileWithGroq({
  stock,
  market,
  companyName,
  yahooSnapshot,
  profile,
  fundamentals,
  webContext,
  webUsed,
}) {
  if (!groq) return null;
  const sys = `You are a concise equity research assistant. Output a single JSON object only (no markdown fences).
Required keys:
- isPSU: boolean|null — true if the company is a PSU / central or state public sector undertaking / material government-controlled listed entity (India), or a clearly government-linked US listing; false if clearly private-sector; null if unclear from data.
- psuRationale: string — one short sentence explaining isPSU.
- sector: string — best sector label; use empty string "" to keep the provider default unchanged.
- industry: string — best industry; "" to keep provider default.
- ownership: string — who owns: government, promoters, public float, MNC parent, etc.
- website: string — official company website URL only, or "" if unknown.
- ceo: string — chair / MD / CEO line, or "".
- otherDetails: string — markdown bullet list (headquarters, listing, subsidiaries, business lines, notable facts). Max 8 bullets; each line starts with "- ".
- summaryMarkdown: string — 2 short paragraphs for investors (plain text, no headings).

If webContext says there is no web search, rely on providerData and fundamentals; state uncertainty. Do not invent precise financial figures; say "not verified" when needed.`;

  const compactFundamentals = {
    pe: fundamentals?.pe ?? null,
    forwardPE: fundamentals?.forwardPE ?? null,
    marketCap: fundamentals?.marketCap ?? null,
    eps: fundamentals?.eps ?? null,
    dividendYield: fundamentals?.dividendYield ?? null,
    sector: fundamentals?.sector ?? null,
    industry: fundamentals?.industry ?? null,
  };
  const userPayload = {
    companyName,
    market,
    listHintSymbol: stock.symbol,
    listHintIsPSU: stock.isPSU === true,
    providerYahoo: yahooSnapshot,
    mergedProfileBeforeAI: profile,
    fundamentalsSnapshot: compactFundamentals,
    webSearchUsed: webUsed,
    webContext: webContext ? webContext.slice(0, 3000) : '(no web search text returned — DuckDuckGo may have no instant answer or HTML parse failed)',
  };

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.25,
      max_tokens: 520,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content || '{}';
    if (!raw.trim()) return null;
    return { ...JSON.parse(raw), _webUsed: webUsed };
  } catch (e) {
    console.warn('[enrichCompanyProfile]', e.message);
    return null;
  }
}

function applyGroqEnrichmentToProfile(profile, enriched) {
  if (!enriched || typeof enriched !== 'object') return;
  if (String(enriched.sector || '').trim()) profile.sector = enriched.sector.trim();
  if (String(enriched.industry || '').trim()) profile.industry = enriched.industry.trim();
  if (String(enriched.ownership || '').trim()) profile.ownershipLabel = enriched.ownership.trim();
  if (String(enriched.website || '').trim()) {
    const w = sanitizeWebsiteUrl(enriched.website);
    if (w) profile.website = w;
  }
  if (String(enriched.ceo || '').trim()) profile.ceo = enriched.ceo.trim();
  profile.psuStatus = enriched.isPSU === true ? 'Yes' : enriched.isPSU === false ? 'No' : 'Unclear';
  const pr = String(enriched.psuRationale || '').trim();
  if (pr) profile.psuNote = pr;
  const sm = String(enriched.summaryMarkdown || '').trim();
  if (sm) profile.enrichmentSummary = sm;
  const od = String(enriched.otherDetails || '').trim();
  if (od) profile.enrichmentDetailsMarkdown = od;
  profile.enrichmentSource = enriched._webUsed ? 'web+duckduckgo+groq' : 'groq';
}

/** Company profile, CEO, ownership hint, 3Y price stats + rule-based investment context (uses fundamentals when sent). */
app.post('/api/stock-info', async (req, res) => {
  try {
    const stock = req.body?.stock;
    const fundamentals = req.body?.fundamentals || {};
    if (!stock || !stock.symbol) return res.status(400).json({ error: 'stock with symbol required' });
    const market = stock.market || 'in';
    const yfSymbol = toYahooSymbol(String(stock.symbol).toUpperCase(), market);
    const plainSym = String(stock.symbol).replace(/\.(NS|BO)$/i, '').trim();
    const [profileRaw, history, sectorInfo] = await Promise.all([
      fetchStockProfileForInfo(yfSymbol),
      fetchHistorical(yfSymbol, 1095),
      fetchSectorForStock(plainSym, market, yfSymbol),
    ]);
    const metrics = computeThreeYearMetrics(history);
    const fundSector = typeof fundamentals.sector === 'string' ? fundamentals.sector.trim() : '';
    const fundIndustry = typeof fundamentals.industry === 'string' ? fundamentals.industry.trim() : '';
    const listSector = typeof stock.sector === 'string' ? stock.sector.trim() : '';

    const ySector = (profileRaw?.sector || '').trim();
    const yIndustry = (profileRaw?.industry || '').trim();

    const sectorResolved =
      (ySector && ySector !== '—' ? ySector : '') ||
      sectorInfo?.sector ||
      fundSector ||
      listSector ||
      '';

    const industryResolved =
      (yIndustry && yIndustry !== '—' ? yIndustry : '') ||
      (sectorInfo?.industryRaw || '').trim() ||
      fundIndustry ||
      '';

    const companyName = String(stock.name || profileRaw?.longName || profileRaw?.shortName || plainSym).trim();
    const descBase =
      profileRaw?.description ||
      buildDescriptionFallback({
        longName: profileRaw?.longName || companyName,
        shortName: profileRaw?.shortName || '',
        sector: sectorResolved || ySector,
        industry: industryResolved || yIndustry,
        exchangeName: profileRaw?.exchangeName || '',
        symbol: plainSym,
      });

    const profile = {
      description: clipProfileText(descBase, 2000),
      sector: sectorResolved || 'Not in data feed',
      industry: industryResolved || 'Not in data feed',
      ceo: (profileRaw?.ceo || '').trim() || 'Not disclosed in provider data',
      website: profileRaw?.website || '',
      ownershipLabel: inferOwnershipLabel(
        profileRaw?.description || '',
        sectorResolved || fundSector || listSector,
        industryResolved || fundIndustry,
        companyName,
      ),
    };

    if (groq) {
      const searchQuery = `${companyName} ${plainSym} ${
        market === 'in' ? 'NSE BSE India' : 'NYSE NASDAQ US'
      } stock company sector industry PSU public sector government ownership official website CEO managing director`;
      const { used: webUsed, text: webText } = await fetchDuckDuckGoContextForCompany(searchQuery);
      const yahooSnapshot = profileRaw
        ? {
            longName: profileRaw.longName,
            shortName: profileRaw.shortName,
            sector: profileRaw.sector,
            industry: profileRaw.industry,
            descriptionExcerpt: (profileRaw.description || '').slice(0, 800),
            website: profileRaw.website,
          }
        : null;
      const enriched = await enrichCompanyProfileWithGroq({
        stock,
        market,
        companyName,
        yahooSnapshot,
        profile: { ...profile },
        fundamentals,
        webContext: webText,
        webUsed,
      });
      applyGroqEnrichmentToProfile(profile, enriched);
    }

    const perspective = buildInvestmentPerspective(fundamentals, metrics);
    res.json({
      symbol: yfSymbol,
      profile,
      threeYear: metrics,
      perspective,
    });
  } catch (err) {
    console.error('[stock-info]', err);
    res.status(500).json({ error: err.message || 'stock_info_failed' });
  }
});

/**
 * Replace the "### Positive signs for buy" block so the label matches data (LLMs often mark "Yes" for every name).
 */
function replacePositiveSignsSection(markdown, verdictLine) {
  if (typeof markdown !== 'string') return markdown;
  const re = /###\s*Positive signs for buy\s*\r?\n[\s\S]*?(?=\r?\n###\s|\r?\n##\s|$)/i;
  if (!re.test(markdown)) {
    const tail = markdown.trimEnd();
    return `${tail}\n\n### Positive signs for buy\n\n- ${verdictLine}\n`;
  }
  return markdown.replace(re, `### Positive signs for buy\n\n- ${verdictLine}\n`);
}

/**
 * Rule-based verdict from P/E, 3Y price stats, and profit trends (same JSON as the report prompt).
 * "Yes" only when growth + reasonable valuation + 3Y context align; otherwise Mixed or No.
 */
function computePositiveSignsForBuyLine({ screener, fundBlock, qpBlock, infoBlock }) {
  const fund = fundBlock && typeof fundBlock === 'object' ? fundBlock : {};
  const qp = qpBlock && typeof qpBlock === 'object' ? qpBlock : {};
  const info = infoBlock && typeof infoBlock === 'object' ? infoBlock : {};

  const pe = parseFundNumLoose(fund.pe);
  const annual = Array.isArray(qp.annual) ? qp.annual : [];
  const quarters = Array.isArray(qp.quarters) ? qp.quarters : [];
  const threeY = info.threeYear || null;

  let score = 0;
  let growthSignal = false;

  if (annual.length >= 2) {
    const [a0, a1] = annual;
    if (a0.netIncome != null && a1.netIncome != null && Math.abs(a1.netIncome) > 1e-6) {
      const gr = (a0.netIncome - a1.netIncome) / Math.abs(a1.netIncome);
      if (gr > 0.08) {
        growthSignal = true;
        score += 2;
      } else if (gr < -0.12) {
        score -= 2;
      }
    }
  }

  if (!growthSignal && quarters.length >= 2) {
    const [q0, q1] = quarters;
    if (q0.netIncome != null && q1.netIncome != null && Math.abs(q1.netIncome) > 1e-6) {
      const gr = (q0.netIncome - q1.netIncome) / Math.abs(q1.netIncome);
      if (gr > 0.08) {
        growthSignal = true;
        score += 1;
      }
    }
  }

  if (quarters.length >= 1) {
    const q0 = quarters[0];
    if (q0.netIncome != null && q0.netIncome < 0) score -= 2;
  }

  if (threeY) {
    const tr = threeY.totalReturnPct;
    const cagr = threeY.cagr;
    if (tr != null) {
      if (tr >= 20) score += 1;
      else if (tr < -40) score -= 2;
      else if (tr < -25) score -= 1;
    }
    if (cagr != null) {
      if (cagr >= 12) score += 1;
      else if (cagr < -10) score -= 2;
    }
  } else {
    score -= 1;
  }

  if (pe != null) {
    if (pe < 0 || pe > 200) score -= 2;
    else if (pe > 90) score -= 1;
    else if (pe >= 6 && pe <= 40) score += 1;
  }

  const ch = screener?.changePercent;
  const wk = screener?.weekChange;
  if (typeof ch === 'number' && ch <= -15) score -= 1;
  if (typeof wk === 'number' && wk <= -25) score -= 1;

  const hasProfit = annual.length > 0 || quarters.length > 0;
  if (!hasProfit && !threeY) {
    return 'Mixed — wait for confirmation';
  }

  const lossMakingTrailing =
    quarters.length >= 1 &&
    quarters[0].netIncome != null &&
    quarters[0].netIncome < 0;

  const hardNo =
    (pe != null && pe < 0) ||
    (lossMakingTrailing && score <= -1) ||
    (threeY?.totalReturnPct != null && threeY.totalReturnPct < -50);

  if (hardNo || score <= -3) return 'No — positive signs not sufficient';

  const hardYes =
    score >= 4 &&
    growthSignal &&
    threeY &&
    threeY.totalReturnPct != null &&
    threeY.totalReturnPct > -15 &&
    pe != null &&
    pe > 0 &&
    pe <= 90;

  if (hardYes) return 'Yes — positive signs visible';

  return 'Mixed — wait for confirmation';
}

function trimForPrompt(obj, maxChars = 1200) {
  if (obj == null) return obj;
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  if (s.length <= maxChars) return obj;
  if (typeof obj === 'string') return `${s.slice(0, maxChars - 1)}…`;
  return `${s.slice(0, maxChars - 1)}…`;
}

function buildLocalFinancialsReport({ screener, fundBlock, qpBlock, infoBlock, verdictLine, note }) {
  const pointsPos = [];
  const pointsNeg = [];
  const annual = Array.isArray(qpBlock?.annual) ? qpBlock.annual : [];
  const quarters = Array.isArray(qpBlock?.quarters) ? qpBlock.quarters : [];
  const three = infoBlock?.threeYear || null;
  const pe = parseFundNumLoose(fundBlock?.pe);
  const fpe = parseFundNumLoose(fundBlock?.forwardPE);

  if (three?.totalReturnPct != null) {
    pointsPos.push(`3Y total return is ${three.totalReturnPct.toFixed(1)}%.`);
  } else {
    pointsNeg.push('3Y return data is not available in the current feed.');
  }

  if (annual.length >= 2 && annual[0]?.netIncome != null && annual[1]?.netIncome != null) {
    const y0 = annual[0].netIncome;
    const y1 = annual[1].netIncome;
    if (Math.abs(y1) > 1e-6) {
      const yoy = ((y0 - y1) / Math.abs(y1)) * 100;
      if (yoy >= 0) pointsPos.push(`Latest annual net profit is up about ${yoy.toFixed(1)}% YoY.`);
      else pointsNeg.push(`Latest annual net profit is down about ${Math.abs(yoy).toFixed(1)}% YoY.`);
    }
  } else {
    pointsNeg.push('Annual net-profit history is limited.');
  }

  if (quarters[0]?.netIncome != null) {
    if (quarters[0].netIncome >= 0) pointsPos.push('Latest quarter remains profitable.');
    else pointsNeg.push('Latest quarter net profit is negative.');
  }

  if (pe != null) {
    if (pe > 0 && pe <= 40) pointsPos.push(`Trailing P/E (${pe.toFixed(1)}) is in a moderate range.`);
    else if (pe < 0 || pe > 90) pointsNeg.push(`Trailing P/E (${pe.toFixed(1)}) looks stretched/unusual.`);
  } else {
    pointsNeg.push('P/E is unavailable from the snapshot feed.');
  }

  if (fpe != null && pe != null && fpe > 0 && pe > 0) {
    if (fpe < pe) pointsPos.push('Forward P/E is below trailing P/E (implied earnings improvement).');
    else pointsNeg.push('Forward P/E is not below trailing P/E (limited near-term valuation comfort).');
  }

  if (typeof screener?.changePercent === 'number') {
    if (screener.changePercent <= -8) pointsPos.push(`Price is down ${Math.abs(screener.changePercent).toFixed(1)}% today (deep dip context).`);
    if (screener.changePercent <= -18) pointsNeg.push('Current fall is very steep; risk of catching a weak trend.');
  }

  const positives = pointsPos.slice(0, 3);
  const negatives = pointsNeg.slice(0, 3);
  while (positives.length < 3) positives.push('Current dataset gives mixed but usable signals.');
  while (negatives.length < 3) negatives.push('Some signals are inconclusive with current feed depth.');

  const qLabel = quarters[0]?.label || 'latest quarter';
  const aLabel = annual[0]?.label || 'latest fiscal year';
  const p1 = `3Y context: ${
    three?.totalReturnPct != null ? `${three.totalReturnPct.toFixed(1)}% total return` : 'return not available'
  }${
    three?.cagr != null ? ` and ${three.cagr.toFixed(1)}% CAGR` : ''
  }. Latest profitability reads from ${qLabel} and ${aLabel}.`;
  const p2 = `Valuation and tape context: trailing P/E is ${
    pe != null ? pe.toFixed(1) : 'n/a'
  }, forward P/E is ${fpe != null ? fpe.toFixed(1) : 'n/a'}, and day move is ${
    typeof screener?.changePercent === 'number' ? `${screener.changePercent.toFixed(2)}%` : 'n/a'
  }. Use sector peers and upcoming results for confirmation.`;

  const noteLine = note ? `\n> ${note}\n` : '';
  return `### Key points
- ${positives[0]}
- ${positives[1]}
- ${positives[2]}
- ${negatives[0]}
- ${negatives[1]}
- ${negatives[2]}

### Positive signs for buy
- ${verdictLine}

### Analysis
${p1}

${p2}${noteLine}`;
}

/**
 * Groq: merged fundamentals + quarterly profit + profile/3Y + screener metrics → markdown report with tables + buy/hold/avoid.
 */
app.post('/api/stock-financials-report', async (req, res) => {
  try {
    const { stock, fundamentals, quarterlyProfit, stockInfo } = req.body || {};
    if (!stock?.symbol) return res.status(400).json({ error: 'stock with symbol required' });
    if (!groq) {
      return res.json({
        markdown:
          '**AI report unavailable.** Set `GROQ_API_KEY` in the server `.env` to enable buy/hold/avoid analysis with tables.',
        error: true,
      });
    }

    const screener = {
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      changePercent: stock.changePercent,
      change: stock.change,
      volume: stock.volume,
      marketCap: stock.marketCap,
      segment: stock.segment,
      segmentName: stock.segmentName,
      rank: stock.rank,
      bestRank: stock.bestRank,
      sector: stock.sector,
      isPSU: stock.isPSU === true,
      weekChange: stock.weekChange,
      monthChange: stock.monthChange,
    };

    const fundBlock = fundamentals && typeof fundamentals === 'object' ? fundamentals : {};
    const qpBlock = quarterlyProfit && typeof quarterlyProfit === 'object' ? quarterlyProfit : { quarters: [], annual: [] };
    const infoBlock = stockInfo && typeof stockInfo === 'object' ? stockInfo : {};

    const compactFund = {
      pe: fundBlock.pe ?? null,
      forwardPE: fundBlock.forwardPE ?? null,
      marketCap: fundBlock.marketCap ?? null,
      eps: fundBlock.eps ?? null,
      dividendYield: fundBlock.dividendYield ?? null,
      fiftyTwoWeekHigh: fundBlock.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: fundBlock.fiftyTwoWeekLow ?? null,
      sector: fundBlock.sector ?? null,
      industry: fundBlock.industry ?? null,
    };
    const compactProfit = {
      quarters: (qpBlock.quarters || []).slice(0, 6).map((q) => ({
        periodEnd: q.periodEnd,
        label: q.label,
        netIncome: q.netIncome,
        totalRevenue: q.totalRevenue,
      })),
      annual: (qpBlock.annual || []).slice(0, 5).map((a) => ({
        fiscalYearEnd: a.fiscalYearEnd,
        label: a.label,
        netIncome: a.netIncome,
      })),
    };
    const compactInfo = {
      profile: {
        sector: infoBlock?.profile?.sector || null,
        industry: infoBlock?.profile?.industry || null,
        ownershipLabel: infoBlock?.profile?.ownershipLabel || null,
      },
      threeYear: infoBlock?.threeYear || null,
      perspective: Array.isArray(infoBlock?.perspective) ? infoBlock.perspective.slice(0, 3) : [],
    };

    const prompt = `You are a concise equity research assistant (India/US listings). You must respond in **GitHub-flavored Markdown** only.

## Output rules (STRICT)
Return only these 3 sections in this exact order:

### Key points
- Exactly 3 positive points
- Exactly 3 negative points
- Use bullet points only (no other text in this section)

### Positive signs for buy
- One line only, choose exactly one (the server will align this line with the numeric data after generation):
  - "Yes — positive signs visible"
  - "Mixed — wait for confirmation"
  - "No — positive signs not sufficient"

### Analysis
- 2 to 4 short paragraphs
- Must compare 3-year fundamentals trend with quarterly and annual revenue/net-profit tables
- Include key screener context (price move, volume, valuation cues) in plain language

Do not include Verdict, Risks, Disclaimer, or any extra sections.
Do not include code blocks.

## Data (JSON — use for facts only; if a field is missing say "n/a")

### Screener / listing context
${JSON.stringify(trimForPrompt(screener, 1200), null, 2)}

### Fundamentals (snapshot)
${JSON.stringify(compactFund, null, 2)}

### Quarterly & annual profit (from Yahoo)
${JSON.stringify(compactProfit, null, 2)}

### Company profile & 3-year price stats (when present)
${JSON.stringify(compactInfo, null, 2)}

Formatting: Keep headings exactly as specified above and keep response concise.`;

    const verdictLine = computePositiveSignsForBuyLine({
      screener,
      fundBlock,
      qpBlock,
      infoBlock,
    });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 700,
    });
    const markdown = completion.choices[0]?.message?.content || '_No content returned._';
    const finalMarkdown = replacePositiveSignsSection(markdown, verdictLine);
    res.json({ markdown: finalMarkdown, error: false });
  } catch (err) {
    const msg = String(err?.message || 'report_failed');
    const isRateLimited =
      /rate limit/i.test(msg) ||
      /429/.test(msg) ||
      err?.status === 429 ||
      err?.code === 'rate_limit_exceeded';
    if (isRateLimited) {
      const { stock, fundamentals, quarterlyProfit, stockInfo } = req.body || {};
      const screener = stock && typeof stock === 'object' ? stock : {};
      const fundBlock = fundamentals && typeof fundamentals === 'object' ? fundamentals : {};
      const qpBlock = quarterlyProfit && typeof quarterlyProfit === 'object' ? quarterlyProfit : { quarters: [], annual: [] };
      const infoBlock = stockInfo && typeof stockInfo === 'object' ? stockInfo : {};
      const verdictLine = computePositiveSignsForBuyLine({ screener, fundBlock, qpBlock, infoBlock });
      const markdown = buildLocalFinancialsReport({
        screener,
        fundBlock,
        qpBlock,
        infoBlock,
        verdictLine,
        note: '',
      });
      return res.json({ markdown, error: false, rateLimitedFallback: true });
    }
    console.error('[stock-financials-report]', msg);
    res.status(500).json({ error: msg, markdown: '' });
  }
});

const PORTFOLIO_ANALYSIS_PROMPT = `You are an experienced equity analyst and portfolio strategist at Morgan Stanley. I am sharing my Zerodha portfolio holdings. Please perform a detailed analysis of my holdings, including sector allocation, stock concentration, risk exposure, and historical performance trends. Compare my portfolio composition with standard benchmarks such as Nifty 50 and Sensex. Identify strengths, weaknesses, and diversification gaps. Then, provide actionable insights on how much additional capital should be invested for long‑term wealth creation (10–15 years horizon), considering risk tolerance, compounding potential, and market cycles. Present your analysis in a structured format with clear recommendations, including suggested allocation percentages across equity, debt, and other asset classes.`;

async function getPortfolioAnalysis(holdings) {
  if (!groq) {
    return { analysis: 'AI analysis requires GROQ_API_KEY in .env', error: true };
  }
  const ranked = [...holdings].sort((a, b) => ((b.last_price ?? 0) * (b.quantity ?? 0)) - ((a.last_price ?? 0) * (a.quantity ?? 0)));
  const topHoldings = ranked.slice(0, 20);
  const portfolioStr = topHoldings.length === 0
    ? 'Portfolio is empty.'
    : topHoldings.map((h) => {
        const qty = h.quantity ?? 0;
        const avg = h.average_price ?? 0;
        const last = h.last_price ?? 0;
        const value = qty * last;
        const pnl = h.pnl ?? (qty * (last - avg));
        const pnlPct = avg > 0 ? ((last - avg) / avg) * 100 : null;
        return `- ${h.tradingsymbol} (${h.exchange}): Qty ${qty}, Avg ₹${avg?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, LTP ₹${last?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, Value ₹${value?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${pnlPct != null ? `, P&L ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (₹${pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 })})` : ''}`;
      }).join('\n');
  const invested = holdings.reduce((s, h) => s + (h.quantity ?? 0) * (h.average_price ?? 0), 0);
  const currentValue = holdings.reduce((s, h) => s + (h.quantity ?? 0) * (h.last_price ?? 0), 0);
  const totalPnl = holdings.reduce((s, h) => s + (h.pnl ?? (h.quantity ?? 0) * ((h.last_price ?? 0) - (h.average_price ?? 0))), 0);
  const prompt = `${PORTFOLIO_ANALYSIS_PROMPT}

My portfolio holdings (top 20 by current value):
${portfolioStr}

Summary: Invested ₹${invested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, Current Value ₹${currentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, P&L ₹${totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.

Formatting rules: Use concise markdown, <= 550 words total, short bullets, one compact allocation table only.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 900,
    });
    const analysis = completion.choices[0]?.message?.content || 'Analysis unavailable.';
    return { analysis };
  } catch (err) {
    console.error('[Portfolio analysis]', err.message);
    if (isGroqRateLimitError(err)) {
      const top3 = ranked.slice(0, 3);
      const lines = top3.map((h) => {
        const qty = h.quantity ?? 0;
        const last = h.last_price ?? 0;
        const val = qty * last;
        return `- ${h.tradingsymbol || h.symbol || 'N/A'}: value ₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
      });
      return {
        analysis: `## Portfolio snapshot (local fallback)\n- Holdings count: ${holdings.length}\n- Total invested: ₹${invested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n- Current value: ₹${currentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n- P&L: ₹${totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}\n\n### Top positions\n${lines.join('\n') || '- No holdings'}\n`,
        error: false,
        rateLimitedFallback: true,
      };
    }
    return { analysis: `Analysis failed: ${err.message}`, error: true };
  }
}

app.post('/api/analyze-portfolio', async (req, res) => {
  try {
    const { holdings } = req.body;
    if (!Array.isArray(holdings)) return res.status(400).json({ error: 'holdings array required' });
    const result = await getPortfolioAnalysis(holdings);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// --- Auto-trade: daily buy top 3 from top 50 loss stocks (Zerodha Kite) ---
async function getSegmentDataForAutoTrade() {
  const cacheKey = 'in:50:all';
  delete stocksCacheByLimit[cacheKey];
  return getTopStocksBySegment(50, null, 'in');
}

app.get('/api/auto-trade/preview', async (req, res) => {
  try {
    const segmentData = await getSegmentDataForAutoTrade();
    const top3 = getTop3FromTop50Losers(segmentData);
    res.json({ top3, message: 'Stocks that would be bought (dry run)' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings/kite', (req, res) => {
  const { apiKey, apiSecret, accessToken } = getKiteFromRequest(req);
  res.json({
    hasApiKey: !!apiKey,
    hasSecret: !!apiSecret,
    hasAccessToken: !!accessToken,
    loginUrl: apiKey ? `https://kite.zerodha.com/connect/login?api_key=${apiKey}&v=3` : 'https://developers.kite.trade/login',
  });
});


app.post('/api/settings/kite/generate-token', async (req, res) => {
  const requestToken = req.body?.requestToken || req.body?.request_token;
  if (!requestToken || !String(requestToken).trim()) {
    return res.status(400).json({ error: 'requestToken required' });
  }
  const { apiKey, apiSecret } = getKiteFromRequest(req);
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API Key and Secret Key required (send in body or X-Kite-Api-Key, X-Kite-Api-Secret headers)' });
  }
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    const session = await kite.generateSession(requestToken, apiSecret);
    res.json({ success: true, accessToken: session.access_token });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to generate token' });
  }
});

/** Invalidate access token via Kite API (logout session) - for security */
app.delete('/api/settings/kite/invalidate-token', async (req, res) => {
  const { apiKey, accessToken } = getKiteFromRequest(req);
  if (!apiKey || !accessToken) {
    return res.status(400).json({ error: 'API Key and Access Token required' });
  }
  try {
    const url = `https://api.kite.trade/session/token?api_key=${encodeURIComponent(apiKey)}&access_token=${encodeURIComponent(accessToken)}`;
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { 'X-Kite-Version': '3' },
    });
    const data = await r.json().catch(() => ({}));
    if (data.status === 'success') {
      res.json({ success: true, message: 'Access token invalidated' });
    } else {
      res.status(400).json({ error: data.message || 'Failed to invalidate token' });
    }
  } catch (err) {
    console.error('[invalidate-token]', err);
    res.status(500).json({ error: err.message || 'Failed to invalidate token' });
  }
});

app.get('/api/kite/orders', async (req, res) => {
  const { apiKey, accessToken } = getKiteFromRequest(req);
  if (!apiKey || !accessToken) {
    return res.status(400).json({ error: 'Kite not configured. Set API key and generate access token in Settings.' });
  }
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const raw = await kite.getOrders();
    const orders = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
    res.setHeader('Content-Type', 'application/json');
    res.json({ orders });
  } catch (err) {
    console.error('[Kite orders]', err);
    const msg = err?.message || err?.data?.message || 'Failed to fetch orders';
    res.status(400).json({ error: msg });
  }
});

app.get('/api/kite/holdings', async (req, res) => {
  const { apiKey, accessToken } = getKiteFromRequest(req);
  if (!apiKey || !accessToken) {
    return res.status(400).json({ error: 'Kite not configured. Set API key and generate access token in Settings.' });
  }
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const raw = await kite.getHoldings();
    const rawList = Array.isArray(raw) ? raw : (raw?.data && Array.isArray(raw.data) ? raw.data : []);
    const holdings = rawList.map((h) => {
      const qty = h.quantity ?? 0;
      const avg = h.average_price ?? 0;
      const last = h.last_price ?? 0;
      const close = h.close_price ?? last;
      let pnl = h.pnl;
      if (pnl == null && qty > 0 && avg > 0) {
        pnl = qty * (last - avg);
      }
      let dayChangePct = h.day_change_percentage;
      if (dayChangePct == null && close > 0) {
        dayChangePct = ((last - close) / close) * 100;
      }
      // When day change is 0 (e.g. market closed), show overall return % from avg price
      if ((dayChangePct == null || Math.abs(dayChangePct) < 0.001) && avg > 0) {
        dayChangePct = ((last - avg) / avg) * 100;
      }
      return { ...h, pnl, day_change_percentage: dayChangePct };
    });
    res.setHeader('Content-Type', 'application/json');
    res.json({ holdings });
  } catch (err) {
    console.error('[Kite holdings]', err);
    const msg = err?.message || err?.data?.message || 'Failed to fetch portfolio';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/auto-trade/run', async (req, res) => {
  try {
    const creds = getKiteFromRequest(req);
    if (!creds.apiKey || !creds.apiSecret) {
      return res.status(400).json({ success: false, error: 'API Key and Secret Key required. Enter them in Settings and sign in to generate an access token.' });
    }
    if (!creds.accessToken) {
      return res.status(400).json({ success: false, error: 'Access token required. Sign in with Kite in Settings to generate an access token.' });
    }
    const dryRun = req.query.dryRun !== 'false';
    const customStocks = req.body?.stocks;
    const quantityPerStock = req.body?.quantityPerStock != null ? Math.max(1, Math.floor(Number(req.body.quantityPerStock))) : undefined;
    const result = await runAutoTrade(getSegmentDataForAutoTrade, { dryRun, customStocks, quantityPerStock, credentials: creds });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Daily cron: 9:20 AM IST (local) or Vercel Cron (calls /api/cron/auto-trade)
if (process.env.AUTO_TRADE_CRON === 'true' && !process.env.VERCEL) {
  cron.schedule('20 9 * * 1-5', async () => {
    console.log('[AutoTrade] Cron triggered at 9:20 AM IST');
    await runAutoTrade(getSegmentDataForAutoTrade, {
      dryRun: process.env.AUTO_TRADE_DRY_RUN !== 'false',
    });
  }, { timezone: 'Asia/Kolkata' });
  console.log('[AutoTrade] Daily cron enabled (9:20 AM IST, Mon-Fri)');
}

// Vercel Cron endpoint: GET /api/cron/auto-trade (verify CRON_SECRET header)
app.get('/api/cron/auto-trade', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '') || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    setKiteEnvFromRequest(req);
    const result = await runAutoTrade(getSegmentDataForAutoTrade, {
      dryRun: process.env.AUTO_TRADE_DRY_RUN !== 'false',
    });
    res.json(result);
  } catch (err) {
    console.error('[AutoTrade] Cron error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback - serve index.html for frontend routes (when built, local only)
if (fs.existsSync(clientDist) && !process.env.VERCEL) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export { app };

// Only listen when running locally (not on Vercel serverless)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  const HOST = process.env.HOST || '0.0.0.0';
  const networkIP = getNetworkIP();
  app.listen(PORT, HOST, () => {
    console.log(`Live Stock running on http://${networkIP}:${PORT}`);
  });
}
