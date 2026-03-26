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

  const BATCH_SIZE = market === 'in' ? 15 : 8;
  const DELAY_MS = market === 'in' ? 100 : 250;
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

async function fetchSymbolData(symbol, market) {
  const yfSymbol = toYahooSymbol(symbol, market);
  const [quote, history] = await Promise.all([
    fetchQuote(yfSymbol),
    fetchHistorical(yfSymbol),
  ]);
  if (!quote) return null;
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
    const gainers = (gainersRes?.quotes || []).map((q, i) => ({
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
      rank: i + 1,
    })).filter((s) => s.symbol && s.price != null);
    const losers = (losersRes?.quotes || []).map((q, i) => ({
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
      rank: i + 1,
    })).filter((s) => s.symbol && s.price != null);
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
  const prompt = `You are an Indian stock market analyst. Analyze this stock for today (March 9, 2026):

Stock: ${stock.name} (${stock.symbol})
Segment: ${stock.segment}
Current Price: ₹${stock.price}
Today's Change: ${stock.changePercent}%
${stock.weekChange != null ? `Week Change: ${stock.weekChange.toFixed(2)}%` : ''}

Provide a brief analysis (2-3 sentences max for context), then list exactly:
- 3 PROS (short bullet points, specific to this stock)
- 3 CONS (short bullet points, specific to this stock)

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
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('Groq error:', err.message);
  }
  return { pros: ['Analysis unavailable'], cons: ['Check server logs'] };
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

const PORTFOLIO_ANALYSIS_PROMPT = `You are an experienced equity analyst and portfolio strategist at Morgan Stanley. I am sharing my Zerodha portfolio holdings. Please perform a detailed analysis of my holdings, including sector allocation, stock concentration, risk exposure, and historical performance trends. Compare my portfolio composition with standard benchmarks such as Nifty 50 and Sensex. Identify strengths, weaknesses, and diversification gaps. Then, provide actionable insights on how much additional capital should be invested for long‑term wealth creation (10–15 years horizon), considering risk tolerance, compounding potential, and market cycles. Present your analysis in a structured format with clear recommendations, including suggested allocation percentages across equity, debt, and other asset classes.`;

async function getPortfolioAnalysis(holdings) {
  if (!groq) {
    return { analysis: 'AI analysis requires GROQ_API_KEY in .env', error: true };
  }
  const portfolioStr = holdings.length === 0
    ? 'Portfolio is empty.'
    : holdings.map((h) => {
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

My portfolio holdings:
${portfolioStr}

Summary: Invested ₹${invested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, Current Value ₹${currentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}, P&L ₹${totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}.

Formatting rules: Use ## for main sections, ### for sub-sections. Keep headings concise. Use bullet points for lists. Keep paragraphs short (2–3 sentences max). Use tables for allocation percentages. Be concise and scannable.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    });
    const analysis = completion.choices[0]?.message?.content || 'Analysis unavailable.';
    return { analysis };
  } catch (err) {
    console.error('[Portfolio analysis]', err.message);
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
