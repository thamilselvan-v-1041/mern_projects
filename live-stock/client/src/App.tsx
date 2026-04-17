import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import * as XLSX from 'xlsx';
import StockSearchPanel from './components/StockSearchPanel';
import './App.css';

function goldFiniteNum(n: unknown): n is number {
  if (typeof n === 'number') return Number.isFinite(n);
  if (n == null || n === '') return false;
  const x = Number(n);
  return Number.isFinite(x);
}

function fmtGoldInr(n: unknown): string {
  if (!goldFiniteNum(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Day change from Goodreturns page (+₹381 / −₹50). */
function fmtGoldChangeInr(n: unknown): string | null {
  if (!goldFiniteNum(n)) return null;
  const v = Number(n);
  const sign = v >= 0 ? '+' : '−';
  const abs = Math.abs(v);
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

/** Jina title often ends with " on 25 March 2026" — omit that for the modal line. */
function goodreturnsPageTitleWithoutTrailingDate(title: string | null | undefined): string | null {
  if (!title || typeof title !== 'string') return null;
  const s = title.replace(/\s+on\s+\d{1,2}\s+\w+\s+\d{4}\s*$/i, '').trim();
  return s.length ? s : null;
}

/** Splits `₹14,837 (+381)` — bracket green for +, red for −, gray for 0. */
function GoodreturnsLastTenRateCell({ value }: { value: string }) {
  const s = String(value).trim();
  const m = s.match(/^(.+?)\s*(\((?:\+|−|-)?[\d,]+\))$/);
  if (!m) return <>{s}</>;
  const main = m[1];
  const bracket = m[2];
  const inner = bracket.slice(1, -1).trim();
  let cls = 'gold-rate-bracket-neutral';
  if (inner.startsWith('+')) cls = 'gold-rate-bracket-up';
  else if (inner.startsWith('-') || inner.startsWith('−')) cls = 'gold-rate-bracket-down';
  return (
    <>
      {main}
      {' '}
      <span className={cls}>{bracket}</span>
    </>
  );
}

type HoldingRow = {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl?: number;
  day_change_percentage?: number;
  purchase_date?: string;
};

function parsePortfolioXlsx(file: File): Promise<HoldingRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error('Failed to read file');
        const wb = XLSX.read(data, { type: 'binary' });
        const sheetName = wb.SheetNames.includes('Equity') ? 'Equity' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1, defval: '' }) as (string | number)[][];
        if (!rows.length) throw new Error('File is empty');
        const col = (headers: string[], name: string, aliases: string[]) => {
          const n = name.toLowerCase();
          for (const a of aliases) {
            const i = headers.findIndex((h) => h === a);
            if (i >= 0) return i;
          }
          return headers.findIndex((h) => h.includes(n) || n.includes(h));
        };
        let headerRow = -1;
        let headers: string[] = [];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map((c) => String(c || '').trim());
          const h = row.map((c) => c.toLowerCase());
          if (h.some((hh) => hh.includes('symbol')) && (h.some((hh) => hh.includes('quantity')) || h.some((hh) => hh.includes('average price')))) {
            headerRow = i;
            headers = h;
            break;
          }
        }
        if (headerRow < 0) throw new Error('Could not find header row with Symbol and Quantity. Use Zerodha Kite Console holdings export.');
        const symCol = col(headers, 'symbol', ['tradingsymbol', 'symbol', 'instrument', 'stock', 'scrip']);
        const qtyCol = col(headers, 'quantity', ['quantity available', 'quantity', 'qty', 'qty.', 'shares']);
        const avgCol = col(headers, 'avg', ['average price', 'avg price', 'avg. price', 'cost', 'buy price', 'avg', 'purchase price']);
        const ltpCol = col(headers, 'ltp', ['previous closing price', 'ltp', 'last price', 'close', 'current price', 'last_price', 'market price']);
        const pnlCol = col(headers, 'pnl', ['unrealized p&l', 'pnl', 'p&l', 'profit', 'profit/loss', 'unrealized pnl']);
        const exCol = col(headers, 'exchange', ['exchange', 'ex']);
        const dateCol = col(headers, 'date', ['purchase date', 'buy date', 'date of purchase', 'date', 'purchase_date', 'order date', 'trade date']);
        if (symCol < 0 || qtyCol < 0) throw new Error('Need Symbol and Quantity columns. Use Zerodha Kite Console holdings export.');
        const holdings: HoldingRow[] = [];
        for (let i = headerRow + 1; i < rows.length; i++) {
          const r = rows[i];
          const sym = String(r[symCol] ?? '').trim();
          if (!sym || /^\d+$/.test(sym)) continue;
          const qty = Math.max(0, Number(r[qtyCol]) || 0);
          if (qty <= 0) continue;
          const avg = Number(r[avgCol]) || 0;
          const ltp = Number(r[ltpCol]) || avg;
          const pnl = pnlCol >= 0 ? Number(r[pnlCol]) : undefined;
          const ex = exCol >= 0 ? String(r[exCol] || 'NSE').trim().toUpperCase() : 'NSE';
          let purchaseDate: string | undefined;
          if (dateCol >= 0) {
            const raw = r[dateCol];
            if (raw != null) {
              let d: Date;
              if (typeof raw === 'number' && raw > 1000) {
                d = new Date((raw - 25569) * 86400 * 1000);
              } else {
                d = new Date(String(raw).trim());
              }
              if (!isNaN(d.getTime())) purchaseDate = d.toISOString().slice(0, 10);
            }
          }
          holdings.push({
            tradingsymbol: sym.replace(/\.(NS|BO|NSE|BSE)$/i, ''),
            exchange: ex || 'NSE',
            quantity: qty,
            average_price: avg || ltp,
            last_price: ltp,
            pnl,
            day_change_percentage: avg > 0 ? ((ltp - avg) / avg) * 100 : undefined,
            purchase_date: purchaseDate,
          });
        }
        resolve(holdings);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsBinaryString(file);
  });
}

const API = import.meta.env.VITE_API_URL || '/api';
const FUNDAMENTALS_CACHE_KEY = 'live-stock-fundamentals-cache';

function stripErrorUrl(msg: string): string {
  const stripped = msg
    .replace(/\s*read\s*more.*$/i, '')
    .replace(/\s*https?:\/\/\S+/g, '')
    .trim();
  const firstSentence = stripped.match(/^.*?(?:[!?]|\.(?=\s|$))/);
  return firstSentence ? firstSentence[0].trim() : stripped;
}

function kiteHeaders(creds: { apiKey: string; secret: string; accessToken: string }): Record<string, string> {
  const h: Record<string, string> = {};
  if (creds.apiKey) h['X-Kite-Api-Key'] = creds.apiKey;
  if (creds.secret) h['X-Kite-Api-Secret'] = creds.secret;
  if (creds.accessToken) h['X-Kite-Access-Token'] = creds.accessToken;
  return h;
}

function kiteHoldingKey(h: { tradingsymbol: string; exchange: string }) {
  return `${String(h.exchange || '').trim()}-${String(h.tradingsymbol || '').trim()}`;
}

function parsePriceLike(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').replace(/[^\d.-]/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Try to infer market cap bucket for searched rows. */
function inferCapType(stock: Stock, fundamentals: Record<string, string> | null): string | null {
  let marketCapInCr: number | null = null;

  // Prefer formatted fundamentals units first (most reliable for India display).
  if (fundamentals?.marketCap) {
    const s = String(fundamentals.marketCap);
    const n = toNumberOrNull(s);
    if (n != null) {
      if (/lakh\s*cr/i.test(s)) marketCapInCr = n * 100000;
      else if (/\bcr\b/i.test(s)) marketCapInCr = n;
      else if (/\bl\b/i.test(s)) marketCapInCr = n / 100;
    }
  }

  // Fallback: infer units from raw quote marketCap.
  if (marketCapInCr == null) {
    const fromStock = toNumberOrNull(stock.marketCap);
    if (fromStock != null) {
      // If the number is already "small", treat it as Cr; else assume base currency amount.
      marketCapInCr = fromStock < 100000 ? fromStock : fromStock / 1e7;
    }
  }

  if (marketCapInCr == null) return null;
  if (marketCapInCr >= 20000) return 'Large';
  if (marketCapInCr >= 5000) return 'Mid';
  return 'Small';
}

type ScorecardBand = 'low' | 'avg' | 'fair' | 'high' | 'bad' | 'good';

function scoreBandClass(v: ScorecardBand): string {
  if (v === 'high' || v === 'good') return 'high';
  if (v === 'low' || v === 'bad') return 'low';
  return 'fair';
}

function scorecardFromFundamentals(
  fundamentals: Record<string, string> | null,
  stock?: Stock,
  historyIn?: Array<{ date: string; close: number }> | null
): {
  performance: ScorecardBand;
  valuation: ScorecardBand;
  growth: ScorecardBand;
  profitability: ScorecardBand;
  entryPoint: ScorecardBand;
  redFlags: ScorecardBand;
} {
  const pe = toNumberOrNull(fundamentals?.pe);
  const fpe = toNumberOrNull(fundamentals?.forwardPE);
  const eps = toNumberOrNull(fundamentals?.eps);
  const div = toNumberOrNull(fundamentals?.dividendYield);
  const open = toNumberOrNull(fundamentals?.open);
  const price = toNumberOrNull(fundamentals?.price);
  const dayLow = toNumberOrNull(fundamentals?.dayLow);
  const dayHigh = toNumberOrNull(fundamentals?.dayHigh);
  const low52 = toNumberOrNull(fundamentals?.fiftyTwoWeekLow);
  const high52 = toNumberOrNull(fundamentals?.fiftyTwoWeekHigh);
  const pb = toNumberOrNull(fundamentals?.priceToBook);
  const roe = toNumberOrNull(fundamentals?.returnOnEquity);
  const debtToEquity = toNumberOrNull(fundamentals?.debtToEquity);
  const revenueGrowth = toNumberOrNull(fundamentals?.revenueGrowth);
  const earningsGrowth = toNumberOrNull(fundamentals?.earningsGrowth);
  const operatingMargins = toNumberOrNull(fundamentals?.operatingMargins);
  const profitMargins = toNumberOrNull(fundamentals?.profitMargins);
  const currentRatio = toNumberOrNull(fundamentals?.currentRatio);
  const payoutRatio = toNumberOrNull(fundamentals?.payoutRatio);
  const beta = toNumberOrNull(fundamentals?.beta);
  const history = Array.isArray(historyIn) ? historyIn : [];
  const pos52 = price != null && low52 != null && high52 != null && high52 > low52
    ? (price - low52) / (high52 - low52)
    : null;
  const oneYearReturn = (() => {
    if (history.length >= 200) {
      const first = Number(history[Math.max(0, history.length - 252)]?.close);
      const last = Number(history[history.length - 1]?.close);
      if (Number.isFinite(first) && first > 0 && Number.isFinite(last)) {
        return ((last - first) / first) * 100;
      }
    }
    if (price != null && low52 != null && high52 != null && high52 > low52) {
      return ((price - ((low52 + high52) / 2)) / ((low52 + high52) / 2)) * 100;
    }
    return toNumberOrNull(stock?.changePercent) ?? null;
  })();

  const perf = (() => {
    let score = 0;
    if (oneYearReturn != null) {
      if (oneYearReturn >= 20) score += 2;
      else if (oneYearReturn >= 8) score += 1;
      else if (oneYearReturn <= -10) score -= 2;
      else if (oneYearReturn <= 0) score -= 1;
    }
    if (price != null && open != null && open > 0) {
      const dayMove = ((price - open) / open) * 100;
      if (dayMove >= 1) score += 1;
      else if (dayMove <= -1) score -= 1;
    }
    if (score >= 2) return 'high';
    if (score <= -1) return 'low';
    return 'avg';
  })();

  const valuation = (() => {
    if (pos52 == null && pe == null && fpe == null && pb == null) return 'avg';
    const p = pe ?? fpe;
    let score = 0;
    if (pos52 != null) {
      if (pos52 <= 0.35) score += 2;         // nearer 52W low => better valuation
      else if (pos52 <= 0.65) score += 1;
      else if (pos52 >= 0.85) score -= 2;    // too close to highs => expensive
      else if (pos52 >= 0.7) score -= 1;
    }
    if (p != null) {
      if (p <= 18) score += 1;
      else if (p >= 35) score -= 1;
    }
    if (pb != null) {
      if (pb <= 1.5) score += 1;
      else if (pb >= 4) score -= 1;
    }
    if ((div ?? 0) >= 3) score += 1;
    if (score >= 2) return 'high';
    if (score <= -1) return 'low';
    return 'avg';
  })();

  const growth = (() => {
    if (eps == null && pe == null && fpe == null && revenueGrowth == null && earningsGrowth == null) return 'avg';
    let score = 0;
    if ((eps ?? 0) > 0) score += 1;
    if (pe != null && fpe != null && fpe < pe) score += 1;
    if ((revenueGrowth ?? 0) >= 8) score += 1;
    if ((earningsGrowth ?? 0) >= 10) score += 2;
    else if ((earningsGrowth ?? 0) >= 4) score += 1;
    if ((revenueGrowth ?? 0) < 0) score -= 1;
    if ((earningsGrowth ?? 0) < 0) score -= 2;
    if (score >= 2) return 'high';
    if (score <= 0) return 'low';
    return 'avg';
  })();

  const profitability = (() => {
    let score = 0;
    if ((eps ?? 0) > 0) score += 1;
    if ((roe ?? 0) >= 15) score += 2;
    else if ((roe ?? 0) >= 10) score += 1;
    if ((profitMargins ?? 0) >= 12) score += 1;
    if ((operatingMargins ?? 0) >= 15) score += 1;
    if (pe != null && pe > 0 && pe <= 30) score += 1;
    if (score >= 3) return 'high';
    if (score === 1) return 'fair';
    if (score === 2) return 'fair';
    return 'low';
  })();

  const entryPoint = (() => {
    if (price == null || low52 == null || high52 == null || high52 <= low52) return 'fair';
    const pos = (price - low52) / (high52 - low52); // 0 near 52W low, 1 near 52W high
    const intradayTop = dayHigh != null && dayLow != null && dayHigh > dayLow
      ? (price - dayLow) / (dayHigh - dayLow)
      : 0.5;
    const attractiveValuation = (pe != null && pe <= 18) || (pb != null && pb <= 1.5) || (div ?? 0) >= 3;
    if (pos <= 0.35 && intradayTop <= 0.75 && attractiveValuation) return 'good';
    if (pos >= 0.75 || intradayTop >= 0.9 || ((pe ?? 0) >= 35) || ((pb ?? 0) >= 4)) return 'bad';
    return 'fair';
  })();

  const redFlags = (() => {
    let risk = 0;
    if (pos52 != null && pos52 >= 0.85) risk += 2; // overheated near highs
    else if (pos52 != null && pos52 >= 0.7) risk += 1;
    if (eps != null && eps < 0) risk += 2;
    if ((pe ?? 0) > 45) risk += 2;
    if (fpe != null && pe != null && fpe > pe * 1.2) risk += 1;
    if ((div ?? 0) === 0 && (pe ?? 0) > 30) risk += 1;
    if ((debtToEquity ?? 0) >= 1.5) risk += 2;
    else if ((debtToEquity ?? 0) >= 0.8) risk += 1;
    if ((earningsGrowth ?? 0) < -10) risk += 2;
    else if ((earningsGrowth ?? 0) < 0) risk += 1;
    if ((currentRatio ?? 0) > 0 && (currentRatio ?? 0) < 1) risk += 1;
    if ((beta ?? 0) >= 1.8) risk += 1;
    if ((payoutRatio ?? 0) > 90) risk += 1;
    if (risk >= 3) return 'high';
    if (risk >= 1) return 'fair';
    return 'low';
  })();

  return { performance: perf, valuation, growth, profitability, entryPoint, redFlags };
}

async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    const isHtml = text.trimStart().startsWith('<');
    const hint = isHtml
      ? 'Backend may not be running. If deployed on Vercel, ensure both frontend and API are deployed (single deployment).'
      : `Server returned non-JSON (${res.status}).`;
    throw new Error(res.ok
      ? `Invalid server response. ${hint}`
      : `Server error (${res.status}). Make sure the backend is running.`);
  }
}

const MARKET_OPTIONS = [
  { value: 'in', label: 'India' },
  { value: 'us', label: 'United States' },
] as const;

const SEGMENT_OPTIONS = [
  { value: 'all', label: 'All Cap' },
  { value: 'large', label: 'Large Cap' },
  { value: 'mid', label: 'Mid Cap' },
  { value: 'small', label: 'Small Cap' },
  { value: 'micro', label: 'Micro Cap' },
  { value: 'nano', label: 'Nano Cap' },
  { value: 'flexi', label: 'Flexi Cap' },
] as const;
const CAP_SEGMENT_VALUES = SEGMENT_OPTIONS
  .filter((opt) => opt.value !== 'all')
  .map((opt) => opt.value);
const LOAD_ORDER_SEGMENTS = ['large', 'mid', 'small', 'micro', 'nano', 'flexi'] as const;

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
  /** Yahoo assetProfile sector when available */
  sector?: string;
  /** India: public-sector heuristic from server (sector filter "PSU") */
  isPSU?: boolean;
  weekChange?: number;
  monthChange?: number;
  history?: { date: string; close: number }[];
  volume?: number;
  marketCap?: number;
  bestRank?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
};

type SegmentData = {
  segment: string;
  segmentName: string;
  topGainers: Stock[];
  topLosers: Stock[];
};

type Analysis = {
  pros: string[];
  cons: string[];
};

type TabType = 'fundamentals' | 'chart' | 'proscons' | 'prediction';

type PredictionDay = { day: number; date: string; price: number; changePercent: number; };
type PredictionPeriod = '7d' | '14d' | '1m' | '2m';
type PredictionLevel = 'low' | 'medium' | 'high';
type PredictionLiveNews = {
  company: string[];
  sector: string[];
  macro: string[];
};
type PredictionSentimentSummary = {
  company: 'positive' | 'neutral' | 'negative';
  sector: 'positive' | 'neutral' | 'negative';
  market: 'positive' | 'neutral' | 'negative';
};
type PredictionSentimentReasons = {
  company: string;
  sector: string;
  market: string;
};
type Prediction = {
  currentPrice: number;
  predictedPrices: PredictionDay[];
  trend: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  summary: string;
  keyFactors: string[];
  support: number | null;
  resistance: number | null;
  sentimentSummary?: PredictionSentimentSummary;
  sentimentReasons?: PredictionSentimentReasons;
  liveNews?: PredictionLiveNews;
  disclaimer: string;
  error?: string;
};
const PREDICTION_PERIODS: { value: PredictionPeriod; label: string; days: number }[] = [
  { value: '7d',  label: '7 Days',  days: 7  },
  { value: '14d', label: '14 Days', days: 14 },
  { value: '1m',  label: '1 Month', days: 30 },
  { value: '2m',  label: '2 Months',days: 60 },
];
const PREDICTION_LEVELS: { value: PredictionLevel; label: string; desc: string; icon: string }[] = [
  { value: 'low',    label: 'Low',    desc: 'Quick signal — RSI, ATR, 14d price',                       icon: '⚡' },
  { value: 'medium', label: 'Medium', desc: '',                                                           icon: '⚖️' },
  { value: 'high',   label: 'High',   desc: 'Deep analysis — full data + live macro + analyst targets',  icon: '🔬' },
];

function allowedPredictionLevels(period: PredictionPeriod): PredictionLevel[] {
  if (period === '7d' || period === '14d') return ['low', 'medium', 'high'];
  return ['low'];
}

function normalizePredictionLevelForPeriod(period: PredictionPeriod, level: PredictionLevel): PredictionLevel {
  const allowed = allowedPredictionLevels(period);
  if (allowed.includes(level)) return level;
  if (allowed.includes('low')) return 'low';
  return allowed[0];
}

type QuarterlyProfitRow = {
  periodEnd: string;
  label: string;
  netIncome: number | null;
  totalRevenue: number | null;
  netIncomeDisplay: string;
  totalRevenueDisplay: string;
};

type QuarterlyProfitPayload = {
  symbol: string;
  market: string;
  quarters: QuarterlyProfitRow[];
  annual: {
    fiscalYearEnd: string;
    label: string;
    netIncome: number | null;
    netIncomeDisplay: string;
  }[];
  disclaimer?: string;
  error?: string;
};

type StockInfoResponse = {
  symbol?: string;
  profile: {
    description: string;
    sector: string;
    industry: string;
    ceo: string;
    website: string;
    ownershipLabel: string;
    /** Groq (+ optional DuckDuckGo web search) */
    psuStatus?: string;
    psuNote?: string;
    enrichmentSummary?: string;
    enrichmentDetailsMarkdown?: string;
    enrichmentSource?: string;
  };
  threeYear: {
    totalReturnPct: number | null;
    maxDrawdownPct: number;
    cagr: number | null;
    dataPoints: number;
    startClose: number;
    endClose: number;
  } | null;
  perspective: string[];
};
type ChartPeriod = '7d' | '1m' | '1y' | '3y' | '5y';

const CHART_PERIOD_LABELS: Record<ChartPeriod, string> = {
  '7d': '7D',
  '1m': '1M',
  '1y': '1Y',
  '3y': '3Y',
  '5y': '5Y',
};
const INDEX_SYMBOLS = new Set(['^NSEI', '^BSESN']);

const MAX_CHART_BARS = 120;
const CHART_PERIOD_TRADING_DAYS: Partial<Record<ChartPeriod, number>> = {
  '7d': 7,
  '1m': 21,
  '1y': 252,
};

function sampleForChart<T>(arr: T[], maxBars: number): T[] {
  if (arr.length <= maxBars) return arr;
  const step = (arr.length - 1) / (maxBars - 1);
  const result: T[] = [];
  for (let i = 0; i < maxBars; i++) {
    const idx = Math.round(i * step);
    result.push(arr[idx]);
  }
  return result;
}

function chartDataForPeriodFromThreeYear(
  threeYearHistory: Array<{ date: string; close: number }> | null | undefined,
  period: ChartPeriod
): Array<{ date: string; close: number }> {
  const rows = Array.isArray(threeYearHistory) ? threeYearHistory : [];
  if (!rows.length) return [];
  const days = CHART_PERIOD_TRADING_DAYS[period];
  if (!days) return rows; // 3y / 5y
  return rows.slice(-days);
}

function buildIndexFundamentals(symbol: string, price: number | null | undefined, indicesIn: {
  nifty: { price: number | null; change: number; changePercent: number } | null;
  sensex: { price: number | null; change: number; changePercent: number } | null;
  fetchedAt?: string;
} | null) {
  const isNifty = symbol === '^NSEI';
  const row = isNifty ? indicesIn?.nifty : indicesIn?.sensex;
  const p = Number.isFinite(Number(price)) ? Number(price) : (row?.price ?? null);
  return {
    price: p != null ? Number(p).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—',
    sector: 'Index',
    marketCap: '—',
    volume: '—',
    avgVolume: '—',
    pe: '—',
    forwardPE: '—',
    eps: '—',
    dividendYield: '—',
    open: '—',
    fiftyTwoWeekLow: '—',
    fiftyTwoWeekHigh: '—',
    dayLow: '—',
    dayHigh: '—',
    change: row ? `${row.change >= 0 ? '+' : ''}${row.change.toFixed(2)}` : '—',
    changePercent: row ? `${row.changePercent >= 0 ? '+' : ''}${row.changePercent.toFixed(2)}%` : '—',
  };
}

type BestSaleSignal = {
  isBestSale: boolean;
  score: number;
  reason: string;
};

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Rule-based sell timing signal:
 * - checks 1Y price behavior (near highs, pullback, momentum fade)
 * - checks fundamentals (high P/E, forward P/E weakness, low dividend)
 * Returns a "Best Sale" signal only on strong confluence.
 */
function deriveBestSaleSignal(args: {
  history: Array<{ date?: string; close?: number }> | null | undefined;
  fundamentals?: Record<string, unknown> | null;
  averagePrice?: number;
  lastPrice?: number;
  dayChangePct?: number;
}): BestSaleSignal {
  const history = (args.history || []).filter((x) => toNum(x?.close) != null) as Array<{ close: number }>;
  const closes = history.map((h) => h.close).filter((x) => Number.isFinite(x));
  const latest = toNum(args.lastPrice) ?? (closes.length ? closes[closes.length - 1] : null);
  const avg = toNum(args.averagePrice);
  const dayChg = toNum(args.dayChangePct);
  if (!latest || !closes.length) return { isBestSale: false, score: 0, reason: 'Insufficient live data' };

  const high1y = Math.max(...closes);
  const low1y = Math.min(...closes);
  const idxHigh = closes.lastIndexOf(high1y);
  const recent21 = closes.slice(Math.max(0, closes.length - 21));
  const ago21 = recent21.length >= 2 ? recent21[0] : latest;
  const momentum21 = ago21 > 0 ? ((latest - ago21) / ago21) * 100 : 0;
  const drawdownFromHigh = high1y > 0 ? ((high1y - latest) / high1y) * 100 : 0;
  const gainVsAvg = avg && avg > 0 ? ((latest - avg) / avg) * 100 : 0;
  const inUpperBand = low1y > 0 ? (latest - low1y) / Math.max(1, high1y - low1y) >= 0.72 : false;
  const highWasRecent = idxHigh >= closes.length - 45;

  const f = args.fundamentals || {};
  const pe = toNum(f.pe);
  const forwardPE = toNum(f.forwardPE);
  const divYield = toNum(f.dividendYield);

  let score = 0;
  const reasons: string[] = [];

  if (gainVsAvg >= 20) {
    score += 2;
    reasons.push(`up ${gainVsAvg.toFixed(1)}% vs buy price`);
  } else if (gainVsAvg >= 12) {
    score += 1;
    reasons.push(`up ${gainVsAvg.toFixed(1)}% vs buy price`);
  }
  if (highWasRecent && drawdownFromHigh >= 7) {
    score += 2;
    reasons.push(`${drawdownFromHigh.toFixed(1)}% below recent 1Y high`);
  } else if (drawdownFromHigh >= 4) {
    score += 1;
    reasons.push(`${drawdownFromHigh.toFixed(1)}% below 1Y high`);
  }
  if (momentum21 <= -4) {
    score += 1;
    reasons.push(`1M momentum weak (${momentum21.toFixed(1)}%)`);
  }
  if (dayChg != null && dayChg <= -1.5) {
    score += 1;
    reasons.push(`today down ${dayChg.toFixed(2)}%`);
  }
  if (inUpperBand) {
    score += 1;
    reasons.push('still in upper 1Y price band');
  }
  if (pe != null && pe >= 36) {
    score += 1;
    reasons.push(`high P/E ${pe.toFixed(1)}`);
  }
  if (forwardPE != null && pe != null && forwardPE > pe * 0.98) {
    score += 1;
    reasons.push('forward P/E not improving');
  }
  if (divYield != null && divYield < 0.8) {
    score += 1;
    reasons.push('low dividend support');
  }

  const isBestSale = score >= 5 && gainVsAvg >= 10 && drawdownFromHigh >= 3;
  return {
    isBestSale,
    score,
    reason: reasons.slice(0, 3).join(' | ') || 'No strong sell signals',
  };
}

type FinancialsSectionId =
  | 'analysis'
  | 'companyProfile'
  | 'threeYear'
  | 'quarterlyAnnual'
  | 'fiscalYear';

function FinancialsCollapsible({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`financials-accordion${isOpen ? ' financials-accordion--open' : ''}`}>
      <button
        type="button"
        className="financials-accordion-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="financials-accordion-title">{title}</span>
        <span className={`financials-accordion-chevron${isOpen ? ' financials-accordion-chevron--open' : ''}`} aria-hidden>
          ▸
        </span>
      </button>
      {isOpen ? <div className="financials-accordion-body">{children}</div> : null}
    </div>
  );
}

function profileFieldDisplay(value: string | null | undefined, emptyLabel = 'Not available'): string {
  const t = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t === '—') return emptyLabel;
  return t;
}

function profileDescriptionClamped(text: string, maxLen: number): { display: string; title: string } {
  const full = String(text || '').replace(/\s+/g, ' ').trim();
  if (!full) return { display: 'Not available', title: '' };
  if (full.length <= maxLen) return { display: full, title: full };
  return {
    display: `${full.slice(0, maxLen - 1).trim()}…`,
    title: full,
  };
}

function profileWebsiteLinkLabel(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
    const s = path ? `${host}${path}` : host;
    return s.length > 52 ? `${s.slice(0, 50)}…` : s;
  } catch {
    const s = raw.replace(/^https?:\/\//i, '');
    return s.length > 52 ? `${s.slice(0, 50)}…` : s;
  }
}

function StockFinancialsAccordionsPanel({
  currency,
  financialsOpenId,
  toggleFinancials,
  loadingFinancialsReport,
  financialsReport,
  loadingStockInfo,
  stockInfo,
  loadingQuarterlyProfit,
  quarterlyProfit,
}: {
  currency: string;
  financialsOpenId: FinancialsSectionId | null;
  toggleFinancials: (id: FinancialsSectionId) => void;
  loadingFinancialsReport: boolean;
  financialsReport: string | null;
  loadingStockInfo: boolean;
  stockInfo: StockInfoResponse | null;
  loadingQuarterlyProfit: boolean;
  quarterlyProfit: QuarterlyProfitPayload | null;
}) {
  return (
    <div className="financials-merged-panel">
      <FinancialsCollapsible
        title="Analysis"
        isOpen={financialsOpenId === 'analysis'}
        onToggle={() => toggleFinancials('analysis')}
      >
        {loadingFinancialsReport ? (
          <div className="loading financials-accordion-loading">Generating analysis…</div>
        ) : financialsReport ? (
          <div className="financials-report-md">
            <ReactMarkdown>{financialsReport}</ReactMarkdown>
          </div>
        ) : (
          <p className="stock-info-muted">Report will appear after data loads.</p>
        )}
      </FinancialsCollapsible>

      <FinancialsCollapsible
        title="3 years price fundamentals"
        isOpen={financialsOpenId === 'threeYear'}
        onToggle={() => toggleFinancials('threeYear')}
      >
        {loadingStockInfo && !stockInfo ? (
          <div className="loading financials-accordion-loading">Loading 3-year context…</div>
        ) : stockInfo?.threeYear ? (
          <div className="quarterly-profit-table-wrap three-year-fundamentals-wrap">
            <table className="quarterly-profit-table three-year-fundamentals-table">
              <tbody>
                <tr>
                  <th scope="row">Data points</th>
                  <td>{stockInfo.threeYear.dataPoints} daily closes (~3Y window)</td>
                </tr>
                <tr>
                  <th scope="row">Start → end price</th>
                  <td>
                    {currency}
                    {stockInfo.threeYear.startClose.toLocaleString('en-IN', { maximumFractionDigits: 2 })} → {currency}
                    {stockInfo.threeYear.endClose.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Total return (approx.)</th>
                  <td>{stockInfo.threeYear.totalReturnPct != null ? `${stockInfo.threeYear.totalReturnPct.toFixed(1)}%` : '—'}</td>
                </tr>
                <tr>
                  <th scope="row">Estimated CAGR (3Y)</th>
                  <td>{stockInfo.threeYear.cagr != null ? `${stockInfo.threeYear.cagr.toFixed(1)}%` : '—'}</td>
                </tr>
                <tr>
                  <th scope="row">Max drawdown</th>
                  <td>{stockInfo.threeYear.maxDrawdownPct.toFixed(1)}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : stockInfo ? (
          <p className="stock-info-muted">3-year history not available for this symbol.</p>
        ) : (
          <p className="stock-info-muted">—</p>
        )}
      </FinancialsCollapsible>

      <FinancialsCollapsible
        title="Quarterly & annual profit"
        isOpen={financialsOpenId === 'quarterlyAnnual'}
        onToggle={() => toggleFinancials('quarterlyAnnual')}
      >
        <div className="quarterly-profit-panel quarterly-profit-panel--embedded">
          {loadingQuarterlyProfit ? (
            <div className="loading financials-accordion-loading">Loading quarterly profit…</div>
          ) : quarterlyProfit?.error ? (
            <p className="quarterly-profit-error">{quarterlyProfit.error}</p>
          ) : quarterlyProfit && quarterlyProfit.quarters.length === 0 && quarterlyProfit.annual.length === 0 ? (
            <p className="stock-info-muted">No profit history returned for this symbol.</p>
          ) : quarterlyProfit ? (
            quarterlyProfit.quarters.length > 0 ? (
              <div className="quarterly-profit-table-wrap">
                <table className="quarterly-profit-table">
                  <thead>
                    <tr>
                      <th scope="col">Quarter</th>
                      <th scope="col">Revenue</th>
                      <th scope="col">Net profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarterlyProfit.quarters.map((q) => (
                      <tr key={q.periodEnd}>
                        <td>{q.label}</td>
                        <td>{q.totalRevenueDisplay}</td>
                        <td>{q.netIncomeDisplay}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="stock-info-muted">No quarterly rows in the current data feed.</p>
            )
          ) : (
            <p className="stock-info-muted">No profit data loaded.</p>
          )}
        </div>
      </FinancialsCollapsible>

      <FinancialsCollapsible
        title="Fiscal-year net profit (last 5 years)"
        isOpen={financialsOpenId === 'fiscalYear'}
        onToggle={() => toggleFinancials('fiscalYear')}
      >
        <div className="quarterly-profit-panel quarterly-profit-panel--embedded">
          {loadingQuarterlyProfit ? (
            <div className="loading financials-accordion-loading">Loading fiscal-year profit…</div>
          ) : quarterlyProfit?.error ? (
            <p className="quarterly-profit-error">{quarterlyProfit.error}</p>
          ) : quarterlyProfit && quarterlyProfit.annual.length > 0 ? (
            <div className="quarterly-profit-table-wrap">
              <table className="quarterly-profit-table">
                <thead>
                  <tr>
                    <th scope="col">Year end</th>
                    <th scope="col">Net profit</th>
                  </tr>
                </thead>
                <tbody>
                  {quarterlyProfit.annual.map((a) => (
                    <tr key={a.fiscalYearEnd}>
                      <td>{a.label}</td>
                      <td>{a.netIncomeDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : quarterlyProfit ? (
            <p className="stock-info-muted">No annual net-profit rows in the current data feed.</p>
          ) : (
            <p className="stock-info-muted">No profit data loaded.</p>
          )}
        </div>
      </FinancialsCollapsible>

      <FinancialsCollapsible
        title="Company profile"
        isOpen={financialsOpenId === 'companyProfile'}
        onToggle={() => toggleFinancials('companyProfile')}
      >
        {loadingStockInfo && !stockInfo ? (
          <div className="loading financials-accordion-loading">Loading profile…</div>
        ) : stockInfo ? (
          <div className="quarterly-profit-table-wrap company-profile-wrap">
            {stockInfo.profile.enrichmentSummary ? (
              <div className="company-profile-enrichment-summary">
                <ReactMarkdown>{stockInfo.profile.enrichmentSummary}</ReactMarkdown>
              </div>
            ) : null}
            <table className="quarterly-profit-table company-profile-table">
              <tbody>
                <tr>
                  <th scope="row">Description</th>
                  <td className="profile-description-cell">
                    {(() => {
                      const { display, title } = profileDescriptionClamped(stockInfo.profile.description, 520);
                      return (
                        <span title={title || undefined}>{display}</span>
                      );
                    })()}
                  </td>
                </tr>
                {stockInfo.profile.psuStatus ? (
                  <tr>
                    <th scope="row">PSU / public sector</th>
                    <td title={stockInfo.profile.psuNote || undefined}>
                      {stockInfo.profile.psuStatus}
                      {stockInfo.profile.psuNote ? (
                        <span className="company-profile-psu-note"> — {stockInfo.profile.psuNote}</span>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
                <tr>
                  <th scope="row">CEO / leadership</th>
                  <td>{profileFieldDisplay(stockInfo.profile.ceo)}</td>
                </tr>
                <tr>
                  <th scope="row">Sector</th>
                  <td>{profileFieldDisplay(stockInfo.profile.sector)}</td>
                </tr>
                <tr>
                  <th scope="row">Industry</th>
                  <td>{profileFieldDisplay(stockInfo.profile.industry)}</td>
                </tr>
                <tr>
                  <th scope="row">Ownership</th>
                  <td>{profileFieldDisplay(stockInfo.profile.ownershipLabel)}</td>
                </tr>
                <tr>
                  <th scope="row">Website</th>
                  <td>
                    {stockInfo.profile.website ? (
                      <a
                        className="stock-info-link"
                        href={
                          stockInfo.profile.website.startsWith('http')
                            ? stockInfo.profile.website
                            : `https://${stockInfo.profile.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        title={stockInfo.profile.website}
                      >
                        {profileWebsiteLinkLabel(stockInfo.profile.website)}
                      </a>
                    ) : (
                      <span className="stock-info-muted">Not available</span>
                    )}
                  </td>
                </tr>
                {stockInfo.profile.enrichmentDetailsMarkdown ? (
                  <tr>
                    <th scope="row">Other details</th>
                    <td className="company-profile-enrichment-md">
                      <ReactMarkdown>{stockInfo.profile.enrichmentDetailsMarkdown}</ReactMarkdown>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="stock-info-muted">—</p>
        )}
      </FinancialsCollapsible>
    </div>
  );
}

function StockItem({
  stock,
  expanded,
  activeTab,
  onStockTap,
  onTabClick,
  analysis,
  loadingAnalysis,
  fundamentals,
  loadingFundamentals,
  chartData,
  chartPeriod,
  onChartPeriodChange,
  loadingChart,
  selected,
  onSelectChange,
  showSelect,
  onClearSearchItem,
  highlightedSearchId,
  quarterlyProfit,
  loadingQuarterlyProfit,
  stockInfo,
  loadingStockInfo,
  financialsReport,
  loadingFinancialsReport,
  onRequestFinancialsLoad,
  financialsOpenId,
  onFinancialsOpenChange,
  prediction,
  loadingPrediction,
  predictionPeriod,
  predictionLevel,
  onPredictionPeriodChange,
  onPredictionLevelChange,
  fundamentalsSubTab,
  onFundamentalsSubTabChange,
}: {
  stock: Stock;
  expanded: boolean;
  activeTab: TabType | null;
  onStockTap: () => void;
  onTabClick: (tab: TabType) => void;
  onRequestFinancialsLoad: () => void;
  analysis: Analysis | null;
  loadingAnalysis: boolean;
  fundamentals: Record<string, string> | null;
  loadingFundamentals: boolean;
  prediction: Prediction | null;
  loadingPrediction: boolean;
  predictionPeriod: PredictionPeriod;
  predictionLevel: PredictionLevel;
  onPredictionPeriodChange: (period: PredictionPeriod) => void;
  onPredictionLevelChange: (level: PredictionLevel) => void;
  fundamentalsSubTab: 'details' | 'scorecard';
  onFundamentalsSubTabChange: (tab: 'details' | 'scorecard') => void;
  quarterlyProfit: QuarterlyProfitPayload | null;
  loadingQuarterlyProfit: boolean;
  stockInfo: StockInfoResponse | null;
  loadingStockInfo: boolean;
  financialsReport: string | null;
  loadingFinancialsReport: boolean;
  chartData: { date: string; close: number }[] | null;
  chartPeriod: ChartPeriod;
  onChartPeriodChange: (period: ChartPeriod) => void;
  loadingChart: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
  showSelect?: boolean;
  onClearSearchItem?: () => void;
  highlightedSearchId?: string | null;
  financialsOpenId: FinancialsSectionId | null;
  onFinancialsOpenChange: (id: FinancialsSectionId | null) => void;
}) {
  const isUp = (stock.changePercent ?? 0) >= 0;
  const currency = stock.market === 'us' ? '$' : '₹';
  const history = chartData ?? stock.history ?? [];
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  // ── Prediction drill-down state ────────────────────────────────────────────
  // level: 'months' → 'weeks' → 'days'
  type DrillLevel = 'months' | 'weeks' | 'days';
  const [drillLevel, setDrillLevel]       = useState<DrillLevel>('months');
  const [drillMonthIdx, setDrillMonthIdx] = useState<number | null>(null);
  const [drillWeekIdx, setDrillWeekIdx]   = useState<number | null>(null); // global week index

  // Reset drill when period/level/prediction changes
  const resetDrill = () => { setDrillLevel('months'); setDrillMonthIdx(null); setDrillWeekIdx(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(resetDrill, [predictionPeriod, predictionLevel, prediction?.currentPrice]);

  const toValidDate = (s: string): Date | null => {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  };

  // Build deterministic prediction calendar date from D+N (skip weekends),
  // so grouping logic does not depend on localized display strings.
  const dateFromPredictionDay = (predictionDay: number): Date => {
    const target = Math.max(1, Number(predictionDay) || 1);
    const d = new Date();
    let added = 0;
    let safe = 0;
    while (added < target && safe < 800) {
      safe += 1;
      d.setDate(d.getDate() + 1);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      added += 1;
    }
    return d;
  };

  const ordinal = (n: number): string => {
    const v = Math.abs(n) % 100;
    if (v >= 11 && v <= 13) return `${n}th`;
    const rem = n % 10;
    if (rem === 1) return `${n}st`;
    if (rem === 2) return `${n}nd`;
    if (rem === 3) return `${n}rd`;
    return `${n}th`;
  };

  const isoWeekYear = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week };
  };

  const buildWeekGroups = (arr: PredictionDay[]) => {
    const out: Array<{ label: string; days: PredictionDay[] }> = [];
    for (const item of arr) {
      const parsed = dateFromPredictionDay(item.day) || toValidDate(item.date) || new Date();
      const { year, week } = isoWeekYear(parsed);
      const label = `${ordinal(week)} Week of ${year}`;
      const last = out[out.length - 1];
      if (last && last.label === label) last.days.push(item);
      else out.push({ label, days: [item] });
    }
    return out;
  };

  const buildMonthGroups = (arr: PredictionDay[]) => {
    const out: Array<{ label: string; days: PredictionDay[] }> = [];
    for (const item of arr) {
      const parsed = dateFromPredictionDay(item.day) || toValidDate(item.date);
      const label = parsed
        ? parsed.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : `Month ${out.length + 1}`;
      const last = out[out.length - 1];
      if (last && last.label === label) last.days.push(item);
      else out.push({ label, days: [item] });
    }
    return out;
  };

  // Summary stats for a group of days
  const groupSummary = (days: PredictionDay[]) => {
    if (!days.length) return { open: 0, close: 0, high: 0, low: 0, changePct: 0 };
    const open  = days[0].price;
    const close = days[days.length - 1].price;
    const high  = Math.max(...days.map(d => d.price));
    const low   = Math.min(...days.map(d => d.price));
    const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
    return { open, close, high, low, changePct };
  };

  const toggleFinancials = (id: FinancialsSectionId) => {
    onFinancialsOpenChange(financialsOpenId === id ? null : id);
  };

  useEffect(() => {
    if (!infoModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfoModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [infoModalOpen]);

  useEffect(() => {
    if (!expanded) setInfoModalOpen(false);
  }, [expanded]);

  useEffect(() => {
    if (!infoModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [infoModalOpen]);

  const isSearchPinned = stock.rank === 0 || String(stock.segment || '').startsWith('search-');
  const isSearchHighlighted = isSearchPinned && highlightedSearchId === `${stock.symbol}-${stock.segment}`;
  const displayName = isSearchPinned ? String(stock.name || '').replace(/\.NS$/i, '') : stock.name;
  const displaySymbol = isSearchPinned ? String(stock.symbol || '').replace(/\.NS$/i, '') : stock.symbol;

  return (
    <div className={`stock-item ${isSearchPinned ? 'search-stock-item' : ''} ${isSearchHighlighted ? 'search-stock-item-highlight' : ''}`}>
      <div className="stock-row" onClick={onStockTap} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onStockTap()}>
        {showSelect && onSelectChange && (
          <input
            type="checkbox"
            className="stock-select-cb"
            checked={selected ?? false}
            onChange={(e) => {
              e.stopPropagation();
              onSelectChange(e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${stock.symbol} for buy`}
          />
        )}
        <div className="stock-main">
          <span className="stock-rank">
            {isSearchPinned && onClearSearchItem ? (
              <button
                type="button"
                className="search-item-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSearchItem();
                }}
                title="Remove searched item"
                aria-label="Remove searched item"
              >
                ×
              </button>
            ) : (
              `#${stock.rank}`
            )}
          </span>
          <div>
            <div className="stock-name">{displayName}</div>
            <div className="stock-symbol-row">
              <span className="stock-symbol">{displaySymbol}</span>
              {stock.bestRank != null && (
                <span className="stock-best-tag" title="Best buy rank among top stocks by volatility">
                  Best #{stock.bestRank}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="stock-price">
          <span className="price">{currency}{stock.price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          <span className={`change ${isUp ? 'up' : 'down'}`}>
            {isUp ? '+' : ''}{stock.changePercent?.toFixed(2)}%
          </span>
        </div>
      </div>
      {expanded && (
        <div className="stock-detail">
          <div className="stock-detail-icons" onClick={(e) => e.stopPropagation()}>
            <button
              className={`icon-btn ${activeTab === 'fundamentals' ? 'active' : ''}`}
              onClick={() => onTabClick('fundamentals')}
              title="Fundamentals"
              aria-label="Fundamentals"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M7 16v-5h3v5" />
                <path d="M11 16V9h3v7" />
                <path d="M15 16v-3h3v3" />
              </svg>
            </button>
            <button
              className={`icon-btn ${activeTab === 'chart' ? 'active' : ''}`}
              onClick={() => onTabClick('chart')}
              title="Chart"
              aria-label="Chart"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </button>
            <button
              className={`icon-btn ${activeTab === 'proscons' ? 'active' : ''}`}
              onClick={() => onTabClick('proscons')}
              title="Pros and Cons"
              aria-label="Pros and Cons"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h8" />
                <path d="M12 8v8" />
              </svg>
            </button>
            <button
              className={`icon-btn ${activeTab === 'prediction' ? 'active' : ''}`}
              onClick={() => onTabClick('prediction')}
              title="7-Day Price Prediction (AI)"
              aria-label="Price Prediction"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 20h20" />
                <path d="M6 16l4-6 4 3 4-8" />
                <circle cx="18" cy="5" r="2" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <button
              type="button"
              className={`icon-btn ${infoModalOpen ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onRequestFinancialsLoad();
                setInfoModalOpen(true);
              }}
              title="Info: profile, profit, AI analysis (opens in a window)"
              aria-label="Info"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
          </div>
          <div className="stock-detail-content">
            {activeTab === 'fundamentals' && (
              fundamentals ? (
                <>
                  <div className="fund-subtabs">
                    <button
                      type="button"
                      className={`fund-subtab-btn ${fundamentalsSubTab === 'details' ? 'active' : ''}`}
                      onClick={() => onFundamentalsSubTabChange('details')}
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className={`fund-subtab-btn ${fundamentalsSubTab === 'scorecard' ? 'active' : ''}`}
                      onClick={() => onFundamentalsSubTabChange('scorecard')}
                    >
                      Scorecard
                    </button>
                  </div>

                  {fundamentalsSubTab === 'details' ? (
                    <div className="fundamentals-grid">
                      {[
                        ['Price', fundamentals.price ?? '—', null],
                        ['Sector', stock.sector?.trim() || fundamentals.sector || '—', null],
                        ['Market Cap', fundamentals.marketCap, /^search$/i.test(String(stock.segmentName || '')) ? inferCapType(stock, fundamentals) : stock.segmentName?.replace(/\s+Cap$/, '')],
                        ['Volume', fundamentals.volume, null],
                        ['Avg Volume', fundamentals.avgVolume, null],
                        ['P/E', fundamentals.pe, null],
                        ['Forward P/E', fundamentals.forwardPE, null],
                        ['EPS', fundamentals.eps, null],
                        ['Dividend Yield', fundamentals.dividendYield, null],
                        ['Open', fundamentals.open, null],
                      ].map(([label, val, cap]) => (
                        <div key={label} className="fund-row">
                          <span className="fund-label">{label}</span>
                          <span className="fund-value">
                            {val}
                            {cap && <span className="fund-cap-type"> ({cap})</span>}
                          </span>
                        </div>
                      ))}
                      <div className="fund-row-pair">
                        <div className="fund-row fund-row-stack">
                          <span className="fund-label">52W Low</span>
                          <span className="fund-value">{fundamentals.fiftyTwoWeekLow ?? '—'}</span>
                          <span className="fund-label">52W Position</span>
                          <span className="fund-value">
                            {(() => {
                              const p = toNumberOrNull(fundamentals.price);
                              const low = toNumberOrNull(fundamentals.fiftyTwoWeekLow);
                              const high = toNumberOrNull(fundamentals.fiftyTwoWeekHigh);
                              if (p == null || low == null || high == null || high <= low) return '—';
                              const posPct = ((p - low) / (high - low)) * 100;
                              return `${posPct.toFixed(1)}% (${p.toFixed(2)} in ${low.toFixed(2)} - ${high.toFixed(2)})`;
                            })()}
                          </span>
                          <span className="fund-label">Day Range</span>
                          <span className="fund-value">{fundamentals.dayLow != null && fundamentals.dayHigh != null ? `${fundamentals.dayLow} - ${fundamentals.dayHigh}` : '—'}</span>
                        </div>
                        <div className="fund-row">
                          <span className="fund-label">52W High</span>
                          <span className="fund-value">{fundamentals.fiftyTwoWeekHigh ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="fund-scorecard">
                      {(() => {
                        const score = scorecardFromFundamentals(fundamentals, stock, history);
                        const rows: Array<{ label: string; value: ScorecardBand }> = [
                          { label: 'Performance', value: score.performance },
                          { label: 'Valuation', value: score.valuation },
                          { label: 'Growth', value: score.growth },
                          { label: 'Profitability', value: score.profitability },
                          { label: 'Entry Point', value: score.entryPoint },
                          { label: 'Red Flags', value: score.redFlags },
                        ];
                        const pairRows: Array<Array<{ label: string; value: ScorecardBand } | null>> = [];
                        for (let i = 0; i < rows.length; i += 2) {
                          pairRows.push([rows[i], rows[i + 1] ?? null]);
                        }
                        return pairRows.map((pair, i) => (
                          <div key={`score-pair-${i}`} className="fund-score-grid-row">
                            {pair.map((item, idx) => item ? (
                              <div key={`${item.label}-${idx}`} className="fund-score-cell">
                                <span className="fund-label">{item.label}</span>
                                <span className={`fund-score-badge ${scoreBandClass(item.value)}`}>{item.value}</span>
                              </div>
                            ) : (
                              <div key={`empty-${idx}`} className="fund-score-cell fund-score-cell-empty" />
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </>
              ) : loadingFundamentals ? (
                <div className="loading">Loading fundamentals...</div>
              ) : null
            )}
            {activeTab === 'chart' && (
              <div className="chart-panel">
                <div className="chart-period-btns">
                  {(['7d', '1m', '1y', '3y', '5y'] as ChartPeriod[]).map((p) => (
                    <button
                      key={p}
                      className={`period-btn ${chartPeriod === p ? 'active' : ''}`}
                      onClick={() => onChartPeriodChange(p)}
                      disabled={loadingChart}
                    >
                      {CHART_PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
                {history.length > 0 ? (
                  (() => {
                    const displayData = sampleForChart(history, MAX_CHART_BARS);
                    const closes = displayData.map((h) => h.close);
                    const minVal = Math.min(...closes);
                    const maxVal = Math.max(...closes);
                    const range  = maxVal - minVal || 1;
                    const W = 600, H = 140, PAD = { top: 10, right: 8, bottom: 4, left: 8 };
                    const iW = W - PAD.left - PAD.right;
                    const iH = H - PAD.top - PAD.bottom;
                    const isUp = closes[closes.length - 1] >= closes[0];
                    const lineColor = isUp ? '#22c55e' : '#ef4444';
                    const gradId = `grad-${stock.symbol}`;

                    const px = (i: number) => PAD.left + (i / (displayData.length - 1)) * iW;
                    const py = (v: number) => PAD.top + iH - ((v - minVal) / range) * iH;

                    const linePath = displayData.map((d, i) =>
                      `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(d.close).toFixed(1)}`
                    ).join(' ');

                    const areaPath = `${linePath} L${px(displayData.length - 1).toFixed(1)},${(PAD.top + iH).toFixed(1)} L${PAD.left},${(PAD.top + iH).toFixed(1)} Z`;

                    const hoveredPoint = hoveredBarIndex != null && hoveredBarIndex < displayData.length
                      ? displayData[hoveredBarIndex] : null;
                    const hx = hoveredBarIndex != null ? px(hoveredBarIndex) : null;
                    const hy = hoveredPoint ? py(hoveredPoint.close) : null;
                    const tooltipLeftPct = hoveredBarIndex != null && displayData.length > 1
                      ? (hoveredBarIndex / (displayData.length - 1)) * 100 : 0;
                    const isLeftEdge  = tooltipLeftPct <= 14;
                    const isRightEdge = tooltipLeftPct >= 86;

                    return (
                      <div className="mini-chart-wrapper line-chart-wrapper">
                        {hoveredPoint && (
                          <div
                            className={`chart-tooltip chart-tooltip--floating ${isLeftEdge ? 'chart-tooltip--left' : isRightEdge ? 'chart-tooltip--right' : ''}`}
                            style={{ left: `${tooltipLeftPct}%` }}
                          >
                            {new Date(hoveredPoint.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            <br />
                            <strong>{currency}{hoveredPoint.close?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                          </div>
                        )}
                        <svg
                          viewBox={`0 0 ${W} ${H}`}
                          className="line-chart-svg"
                          onMouseLeave={() => setHoveredBarIndex(null)}
                          onMouseMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const relX = ((e.clientX - rect.left) / rect.width) * iW;
                            const idx = Math.round((relX / iW) * (displayData.length - 1));
                            setHoveredBarIndex(Math.max(0, Math.min(displayData.length - 1, idx)));
                          }}
                          onTouchMove={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const relX = ((e.touches[0].clientX - rect.left) / rect.width) * iW;
                            const idx = Math.round((relX / iW) * (displayData.length - 1));
                            setHoveredBarIndex(Math.max(0, Math.min(displayData.length - 1, idx)));
                          }}
                          onTouchEnd={() => setHoveredBarIndex(null)}
                          style={{ cursor: 'crosshair' }}
                        >
                          <defs>
                            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          {/* Gradient fill */}
                          <path d={areaPath} fill={`url(#${gradId})`} />
                          {/* Line */}
                          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                          {/* Crosshair */}
                          {hx != null && hy != null && (
                            <>
                              <line x1={hx} y1={PAD.top} x2={hx} y2={PAD.top + iH} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3,3" />
                              <circle cx={hx} cy={hy} r="3.5" fill={lineColor} stroke="#1a1a2e" strokeWidth="1.5" />
                            </>
                          )}
                        </svg>
                      </div>
                    );
                  })()
                ) : loadingChart ? (
                  <div className="loading">Loading chart...</div>
                ) : (
                  <div className="loading">No chart data</div>
                )}
              </div>
            )}
          {activeTab === 'proscons' && (
            analysis ? (
              <div className="pros-cons">
                <div className="list pros">
                  <h4>Pros</h4>
                  <ul>
                    {analysis.pros.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="list cons">
                  <h4>Cons</h4>
                  <ul>
                    {analysis.cons.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : loadingAnalysis ? (
              <div className="loading">Analyzing...</div>
            ) : null
          )}
          {activeTab === 'prediction' && (
            <>
              {/* Period + Level dropdowns */}
              <div className="prediction-filters">
                <div className="prediction-filter-group">
                  <label className="prediction-filter-label">Period</label>
                  <select
                    className="prediction-filter-select"
                    value={predictionPeriod}
                    onChange={(e) => onPredictionPeriodChange(e.target.value as PredictionPeriod)}
                  >
                    {PREDICTION_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="prediction-filter-group">
                  <label className="prediction-filter-label">Severity</label>
                  {(() => {
                    const allowedLevels = allowedPredictionLevels(predictionPeriod);
                    const selectedLevel = normalizePredictionLevelForPeriod(predictionPeriod, predictionLevel);
                    return (
                  <select
                    className="prediction-filter-select"
                    value={selectedLevel}
                    onChange={(e) => onPredictionLevelChange(e.target.value as PredictionLevel)}
                  >
                    {PREDICTION_LEVELS.filter((l) => allowedLevels.includes(l.value)).map((l) => (
                      <option key={l.value} value={l.value}>{l.icon} {l.label}</option>
                    ))}
                  </select>
                    );
                  })()}
                </div>
                {PREDICTION_LEVELS.find((l) => l.value === predictionLevel)?.desc ? (
                  <span className="prediction-level-desc">
                    {PREDICTION_LEVELS.find((l) => l.value === predictionLevel)?.desc}
                  </span>
                ) : null}
              </div>
            {loadingPrediction ? (
              <div className="loading prediction-loading-text">
                Generating {PREDICTION_PERIODS.find((p) => p.value === predictionPeriod)?.label ?? ''} outlook ({predictionLevel})...
              </div>
            ) : prediction?.error ? (
              <div className="loading">{prediction.error}</div>
            ) : prediction ? (
              <div className="prediction-panel">
                {/* Header: trend badge + confidence */}
                <div className="prediction-header">
                  <span className={`prediction-trend-badge prediction-trend-${prediction.trend}`}>
                    {prediction.trend === 'bullish' ? '▲ Bullish' : prediction.trend === 'bearish' ? '▼ Bearish' : '● Neutral'}
                  </span>
                  <span className="prediction-confidence">
                    Confidence: <strong>{prediction.confidence}%</strong>
                  </span>
                </div>

                {/* Summary */}
                {prediction.summary && (
                  <p className="prediction-summary">{prediction.summary}</p>
                )}

                {/* ── Drill-down price table ───────────────────────────── */}
                {(() => {
                  const all = prediction.predictedPrices;
                  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

                  // 7d → always flat daily table, no drill
                  if (predictionPeriod === '7d') {
                    return (
                      <div className="prediction-table-wrap">
                        <table className="prediction-table">
                          <thead><tr><th>Day</th><th>Date</th><th>Price</th><th>Change</th></tr></thead>
                          <tbody>
                            {all.map((d) => (
                              <tr key={d.day} className={d.changePercent >= 0 ? 'pred-up' : 'pred-down'}>
                                <td>D+{d.day}</td><td>{d.date}</td>
                                <td><strong>{currency}{fmt(d.price)}</strong></td>
                                <td className={d.changePercent >= 0 ? 'up' : 'down'}>{d.changePercent >= 0 ? '+' : ''}{d.changePercent.toFixed(2)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // 1m → weeks drill (top: weeks, drill: days)
                  if (predictionPeriod === '1m') {
                    const weeks = buildWeekGroups(all);
                    if (drillLevel === 'days' && drillWeekIdx !== null) {
                      const wDays = weeks[drillWeekIdx]?.days ?? [];
                      const s = groupSummary(wDays);
                      return (
                        <div className="prediction-table-wrap">
                          <div className="pred-drill-breadcrumb">
                            <button className="pred-drill-back" onClick={() => { setDrillLevel('months'); setDrillWeekIdx(null); }}>◀ Weeks</button>
                            <span>{weeks[drillWeekIdx]?.label || `Week ${drillWeekIdx + 1}`}</span>
                          </div>
                          <table className="prediction-table">
                            <thead><tr><th>Day</th><th>Date</th><th>Price</th><th>vs Entry</th></tr></thead>
                            <tbody>
                              {wDays.map((d) => {
                                const chg = s.open > 0 ? ((d.price - s.open) / s.open) * 100 : 0;
                                return (
                                  <tr key={d.day} className={chg >= 0 ? 'pred-up' : 'pred-down'}>
                                    <td>D+{d.day}</td><td>{d.date}</td>
                                    <td><strong>{currency}{fmt(d.price)}</strong></td>
                                    <td className={chg >= 0 ? 'up' : 'down'}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    // Default: week list
                    return (
                      <div className="prediction-table-wrap">
                        <table className="prediction-table pred-group-table">
                          <thead><tr><th>Week</th><th>Range</th><th>Open → Close</th><th>Change</th><th></th></tr></thead>
                          <tbody>
                            {weeks.map((wk, wi) => {
                              const s = groupSummary(wk.days);
                              return (
                                <tr key={wi} className={`pred-group-row ${s.changePct >= 0 ? 'pred-up' : 'pred-down'}`}
                                  onClick={() => { setDrillWeekIdx(wi); setDrillLevel('days'); }}>
                                  <td><strong>Wk {wi + 1}</strong></td>
                                  <td className="pred-range">{wk.label}</td>
                                  <td>{currency}{fmt(s.open)} → <strong>{currency}{fmt(s.close)}</strong></td>
                                  <td className={s.changePct >= 0 ? 'up' : 'down'}>{s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%</td>
                                  <td className="pred-drill-arrow">›</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // 3m / 6m / 1y → months → weeks → days drill
                  const months = buildMonthGroups(all);

                  // Level: days (deepest)
                  if (drillLevel === 'days' && drillWeekIdx !== null && drillMonthIdx !== null) {
                    const mDays = months[drillMonthIdx]?.days ?? [];
                    const mWeeks = buildWeekGroups(mDays);
                    const wDays = mWeeks[drillWeekIdx]?.days ?? [];
                    const s = groupSummary(wDays);
                    return (
                      <div className="prediction-table-wrap">
                        <div className="pred-drill-breadcrumb">
                          <button className="pred-drill-back" onClick={() => { setDrillLevel('months'); setDrillMonthIdx(null); setDrillWeekIdx(null); }}>◀ Months</button>
                          <span className="pred-drill-sep">›</span>
                          <button className="pred-drill-back" onClick={() => { setDrillLevel('weeks'); setDrillWeekIdx(null); }}>{months[drillMonthIdx]?.label || `Month ${drillMonthIdx + 1}`}</button>
                          <span className="pred-drill-sep">›</span>
                          <span>{mWeeks[drillWeekIdx]?.label || `Week ${drillWeekIdx + 1}`}</span>
                        </div>
                        <table className="prediction-table">
                          <thead><tr><th>Day</th><th>Date</th><th>Price</th><th>vs Entry</th></tr></thead>
                          <tbody>
                            {wDays.map((d) => {
                              const chg = s.open > 0 ? ((d.price - s.open) / s.open) * 100 : 0;
                              return (
                                <tr key={d.day} className={chg >= 0 ? 'pred-up' : 'pred-down'}>
                                  <td>D+{d.day}</td><td>{d.date}</td>
                                  <td><strong>{currency}{fmt(d.price)}</strong></td>
                                  <td className={chg >= 0 ? 'up' : 'down'}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // Level: weeks (inside a month)
                  if (drillLevel === 'weeks' && drillMonthIdx !== null) {
                    const mDays = months[drillMonthIdx];
                    const mWeeks = buildWeekGroups(mDays?.days ?? []);
                    return (
                      <div className="prediction-table-wrap">
                        <div className="pred-drill-breadcrumb">
                          <button className="pred-drill-back" onClick={() => { setDrillLevel('months'); setDrillMonthIdx(null); }}>◀ Months</button>
                          <span className="pred-drill-sep">›</span>
                          <span>{mDays?.label || `Month ${drillMonthIdx + 1}`}</span>
                        </div>
                        <table className="prediction-table pred-group-table">
                          <thead><tr><th>Week</th><th>Range</th><th>Open → Close</th><th>Change</th><th></th></tr></thead>
                          <tbody>
                            {mWeeks.map((wk, wi) => {
                              const s = groupSummary(wk.days);
                              return (
                                <tr key={wi} className={`pred-group-row ${s.changePct >= 0 ? 'pred-up' : 'pred-down'}`}
                                  onClick={() => { setDrillWeekIdx(wi); setDrillLevel('days'); }}>
                                  <td><strong>Wk {wi + 1}</strong></td>
                                  <td className="pred-range">{wk.label}</td>
                                  <td>{currency}{fmt(s.open)} → <strong>{currency}{fmt(s.close)}</strong></td>
                                  <td className={s.changePct >= 0 ? 'up' : 'down'}>{s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%</td>
                                  <td className="pred-drill-arrow">›</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  }

                  // Level: months (top)
                  return (
                    <div className="prediction-table-wrap">
                      <table className="prediction-table pred-group-table">
                        <thead><tr><th>Month</th><th>Range</th><th>Open → Close</th><th>Change</th><th></th></tr></thead>
                        <tbody>
                          {months.map((mo, mi) => {
                            const s = groupSummary(mo.days);
                            return (
                              <tr key={mi} className={`pred-group-row ${s.changePct >= 0 ? 'pred-up' : 'pred-down'}`}
                                onClick={() => { setDrillMonthIdx(mi); setDrillWeekIdx(null); setDrillLevel('weeks'); }}>
                                <td><strong>Mo {mi + 1}</strong></td>
                                <td className="pred-range">{mo.label}</td>
                                <td>{currency}{fmt(s.open)} → <strong>{currency}{fmt(s.close)}</strong></td>
                                <td className={s.changePct >= 0 ? 'up' : 'down'}>{s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(2)}%</td>
                                <td className="pred-drill-arrow">›</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Support / Resistance */}
                {(prediction.support != null || prediction.resistance != null) && (
                  <div className="prediction-levels">
                    {prediction.support != null && (
                      <span className="pred-level pred-support">Support: {currency}{prediction.support}</span>
                    )}
                    {prediction.resistance != null && (
                      <span className="pred-level pred-resistance">Resistance: {currency}{prediction.resistance}</span>
                    )}
                  </div>
                )}

                {/* Key Factors */}
                {prediction.keyFactors.length > 0 && (
                  <div className="prediction-factors">
                    <span className="prediction-factors-label">Key Factors:</span>
                    <ul>
                      {prediction.keyFactors.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}

                {prediction.sentimentSummary && (
                  <div className="prediction-sentiment-summary">
                    <span className="prediction-factors-label">Live Sentiment:</span>
                    <div className="prediction-sentiment-grid">
                      <div className="prediction-sentiment-item">
                        <span className={`prediction-sentiment-badge sentiment-${prediction.sentimentSummary.company}`}>
                          Company: {prediction.sentimentSummary.company}
                        </span>
                        {prediction.sentimentReasons?.company && (
                          <div className="prediction-sentiment-reason">{prediction.sentimentReasons.company}</div>
                        )}
                      </div>
                      <div className="prediction-sentiment-item">
                        <span className={`prediction-sentiment-badge sentiment-${prediction.sentimentSummary.sector}`}>
                          Sector: {prediction.sentimentSummary.sector}
                        </span>
                        {prediction.sentimentReasons?.sector && (
                          <div className="prediction-sentiment-reason">{prediction.sentimentReasons.sector}</div>
                        )}
                      </div>
                      <div className="prediction-sentiment-item">
                        <span className={`prediction-sentiment-badge sentiment-${prediction.sentimentSummary.market}`}>
                          Market: {prediction.sentimentSummary.market}
                        </span>
                        {prediction.sentimentReasons?.market && (
                          <div className="prediction-sentiment-reason">{prediction.sentimentReasons.market}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {((prediction.liveNews?.company?.length ?? 0) > 0 ||
                  (prediction.liveNews?.sector?.length ?? 0) > 0 ||
                  (prediction.liveNews?.macro?.length ?? 0) > 0) && (
                  <details className="prediction-live-news">
                    <summary>Live News</summary>
                    {(prediction.liveNews?.company?.length ?? 0) > 0 && (
                      <div className="prediction-live-news-group">
                        <div className="prediction-live-news-title">Stock</div>
                        <ul>
                          {prediction.liveNews?.company.map((item, i) => <li key={`company-${i}`}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                    {(prediction.liveNews?.sector?.length ?? 0) > 0 && (
                      <div className="prediction-live-news-group">
                        <div className="prediction-live-news-title">Sector</div>
                        <ul>
                          {prediction.liveNews?.sector.map((item, i) => <li key={`sector-${i}`}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                    {(prediction.liveNews?.macro?.length ?? 0) > 0 && (
                      <div className="prediction-live-news-group">
                        <div className="prediction-live-news-title">Market</div>
                        <ul>
                          {prediction.liveNews?.macro.map((item, i) => <li key={`macro-${i}`}>{item}</li>)}
                        </ul>
                      </div>
                    )}
                  </details>
                )}


              </div>
            ) : null}
            </>
          )}
          </div>
        </div>
      )}
      {infoModalOpen &&
        createPortal(
          <div
            className="auto-trade-result"
            role="dialog"
            aria-modal="true"
            aria-label={`Stock info: ${displaySymbol}`}
            onClick={() => setInfoModalOpen(false)}
          >
            <div
              className="auto-trade-result-inner trade-confirm-modal gold-page-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="auto-trade-result-header">
                <h3 id="stock-info-popup-title">{displayName} · {displaySymbol}</h3>
                <button type="button" className="auto-trade-close" onClick={() => setInfoModalOpen(false)} aria-label="Close">
                  ×
                </button>
              </div>
              <div className="history-modal-content gold-modal-content stock-detail-content">
                <StockFinancialsAccordionsPanel
                  currency={currency}
                  financialsOpenId={financialsOpenId}
                  toggleFinancials={toggleFinancials}
                  loadingFinancialsReport={loadingFinancialsReport}
                  financialsReport={financialsReport}
                  loadingStockInfo={loadingStockInfo}
                  stockInfo={stockInfo}
                  loadingQuarterlyProfit={loadingQuarterlyProfit}
                  quarterlyProfit={quarterlyProfit}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

type SortOrder = 'asc' | 'desc' | 'best' | 'bestprice';

function StockListSection({
  stocks,
  activeStockId,
  activeTab,
  onStockTap,
  onTabClick,
  analysisCache,
  loadingAnalysisId,
  fundamentalsCache,
  loadingFundamentalsId,
  chartCache,
  chartPeriod,
  onChartPeriodChange,
  loadingChartId,
  selectedStockIds,
  onSelectStock,
  showSelect,
  onClearSearchItem,
  highlightedSearchId,
  quarterlyProfitCache,
  loadingQuarterlyProfitId,
  stockInfoCache,
  loadingStockInfoId,
  financialsReportCache,
  loadingFinancialsReportId,
  onRequestFinancialsLoad,
  financialsOpenId,
  onFinancialsOpenChange,
  predictionCache,
  loadingPredictionId,
  predictionPeriod,
  predictionLevel,
  onPredictionPeriodChange,
  onPredictionLevelChange,
  defaultChartPeriod,
  fundamentalsSubTab,
  onFundamentalsSubTabChange,
}: {
  stocks: Stock[];
  activeStockId: string | null;
  activeTab: TabType | null;
  onStockTap: (stock: Stock) => void;
  onTabClick: (stock: Stock, tab: TabType) => void;
  onRequestFinancialsLoad: (stock: Stock, id: string) => void;
  analysisCache: Record<string, Analysis>;
  loadingAnalysisId: string | null;
  fundamentalsCache: Record<string, Record<string, string>>;
  loadingFundamentalsId: string | null;
  quarterlyProfitCache: Record<string, QuarterlyProfitPayload>;
  loadingQuarterlyProfitId: string | null;
  stockInfoCache: Record<string, StockInfoResponse>;
  loadingStockInfoId: string | null;
  financialsReportCache: Record<string, string>;
  loadingFinancialsReportId: string | null;
  chartCache: Record<string, Partial<Record<ChartPeriod, { date: string; close: number }[]>>>;
  chartPeriod: Record<string, ChartPeriod>;
  onChartPeriodChange: (stock: Stock, period: ChartPeriod) => void;
  loadingChartId: string | null;
  selectedStockIds: Set<string>;
  onSelectStock: (id: string, checked: boolean) => void;
  showSelect: boolean;
  onClearSearchItem?: (stock: Stock) => void;
  highlightedSearchId?: string | null;
  financialsOpenId: FinancialsSectionId | null;
  onFinancialsOpenChange: (id: FinancialsSectionId | null) => void;
  predictionCache: Record<string, Prediction>;
  loadingPredictionId: string | null;
  predictionPeriod: Record<string, PredictionPeriod>;
  predictionLevel: PredictionLevel;
  onPredictionPeriodChange: (stock: Stock, period: PredictionPeriod) => void;
  onPredictionLevelChange: (stock: Stock, level: PredictionLevel) => void;
  defaultChartPeriod: ChartPeriod;
  fundamentalsSubTab: 'details' | 'scorecard';
  onFundamentalsSubTabChange: (tab: 'details' | 'scorecard') => void;
}) {
  return (
    <section className="stock-list-section">
      <div className="stock-list">
        {stocks.length === 0 ? (
          <div className="select-category-placeholder">
            No stocks to display. Try refreshing.
          </div>
        ) : stocks.map((stock) => {
          const id = `${stock.symbol}-${stock.segment}`;
          const isExpanded = activeStockId === id;
          const period = chartPeriod[id] ?? defaultChartPeriod;
          const chartDataForPeriod =
            period === '5y'
              ? (chartCache[id]?.['5y'] ?? [])
              : chartDataForPeriodFromThreeYear(chartCache[id]?.['3y'] ?? null, period);
          return (
            <StockItem
              key={id}
              stock={stock}
              expanded={isExpanded}
              activeTab={isExpanded ? activeTab : null}
              onStockTap={() => onStockTap(stock)}
              onTabClick={(tab) => onTabClick(stock, tab)}
              analysis={analysisCache[id] ?? null}
              loadingAnalysis={loadingAnalysisId === id}
              fundamentals={fundamentalsCache[id] ?? null}
              loadingFundamentals={loadingFundamentalsId === id}
              quarterlyProfit={quarterlyProfitCache[id] ?? null}
              loadingQuarterlyProfit={loadingQuarterlyProfitId === id}
              stockInfo={stockInfoCache[id] ?? null}
              loadingStockInfo={loadingStockInfoId === id}
              financialsReport={financialsReportCache[id] ?? null}
              loadingFinancialsReport={loadingFinancialsReportId === id}
              chartData={chartDataForPeriod}
              chartPeriod={period}
              onChartPeriodChange={(p) => onChartPeriodChange(stock, p)}
              loadingChart={loadingChartId === id}
              selected={selectedStockIds.has(id)}
              onSelectChange={(checked) => onSelectStock(id, checked)}
              showSelect={showSelect}
              onClearSearchItem={String(stock.segment || '').startsWith('search-') && onClearSearchItem ? () => onClearSearchItem(stock) : undefined}
              highlightedSearchId={highlightedSearchId}
              onRequestFinancialsLoad={() => onRequestFinancialsLoad(stock, id)}
              financialsOpenId={financialsOpenId}
              onFinancialsOpenChange={onFinancialsOpenChange}
              prediction={predictionCache[`${id}-${predictionPeriod[id] ?? '7d'}-${predictionLevel}`] ?? null}
              loadingPrediction={loadingPredictionId === id}
              predictionPeriod={predictionPeriod[id] ?? '7d'}
              predictionLevel={predictionLevel}
              onPredictionPeriodChange={(p) => onPredictionPeriodChange(stock, p)}
              onPredictionLevelChange={(l) => onPredictionLevelChange(stock, l)}
              fundamentalsSubTab={fundamentalsSubTab}
              onFundamentalsSubTabChange={onFundamentalsSubTabChange}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function App() {
  const [segmentsByMarket, setSegmentsByMarket] = useState<Record<string, SegmentData[]>>(() => {
    try {
      const raw = sessionStorage.getItem('livestock_segments_v1');
      if (raw) return JSON.parse(raw) as Record<string, SegmentData[]>;
    } catch {}
    return {};
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [financialsOpenId, setFinancialsOpenId] = useState<FinancialsSectionId | null>('threeYear');
  const [preferredTab, setPreferredTab] = useState<TabType>('chart');
  const [analysisCache, setAnalysisCache] = useState<Record<string, Analysis>>({});
  const [loadingAnalysisId, setLoadingAnalysisId] = useState<string | null>(null);
  const [fundamentalsCache, setFundamentalsCache] = useState<Record<string, Record<string, string>>>(() => {
    try {
      const s = sessionStorage.getItem(FUNDAMENTALS_CACHE_KEY);
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  });
  const [loadingFundamentalsId, setLoadingFundamentalsId] = useState<string | null>(null);
  const [quarterlyProfitCache, setQuarterlyProfitCache] = useState<Record<string, QuarterlyProfitPayload>>({});
  const [loadingQuarterlyProfitId, setLoadingQuarterlyProfitId] = useState<string | null>(null);
  const [stockInfoCache, setStockInfoCache] = useState<Record<string, StockInfoResponse>>({});
  const [loadingStockInfoId, setLoadingStockInfoId] = useState<string | null>(null);
  const [financialsReportCache, setFinancialsReportCache] = useState<Record<string, string>>({});
  const [loadingFinancialsReportId, setLoadingFinancialsReportId] = useState<string | null>(null);
  const [chartCache, setChartCache] = useState<Record<string, Partial<Record<ChartPeriod, { date: string; close: number }[]>>>>({});
  const [chartPeriod, setChartPeriod] = useState<Record<string, ChartPeriod>>({});
  const [preferredChartPeriod, setPreferredChartPeriod] = useState<ChartPeriod>('3y');
  const [loadingChartId, setLoadingChartId] = useState<string | null>(null);
  const [predictionCache, setPredictionCache] = useState<Record<string, Prediction>>({});
  const [loadingPredictionId, setLoadingPredictionId] = useState<string | null>(null);
  const [predictionPeriod, setPredictionPeriod] = useState<Record<string, PredictionPeriod>>({});
  const [predictionLevel, setPredictionLevel] = useState<PredictionLevel>('low');
  const [preferredFundamentalsSubTab, setPreferredFundamentalsSubTab] = useState<'details' | 'scorecard'>('details');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [market, setMarket] = useState<string>('in');
  const [displayLimit, setDisplayLimit] = useState<50 | 100 | 150>(150);
  const [segmentFilter, setSegmentFilter] = useState<string[]>(['large']);
  const [segmentMenuOpen, setSegmentMenuOpen] = useState(false);
  const [segmentMenuPos, setSegmentMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const [segmentReadyByMarket, setSegmentReadyByMarket] = useState<Record<string, Record<string, boolean>>>(() => {
    try {
      const raw = sessionStorage.getItem('livestock_segments_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, SegmentData[]>;
        const result: Record<string, Record<string, boolean>> = { in: {}, us: {} };
        for (const [mkt, segs] of Object.entries(parsed)) {
          result[mkt] = {};
          (segs || []).forEach((s) => {
            if (s?.segment) result[mkt][s.segment] = (s.topGainers?.length > 0 || s.topLosers?.length > 0);
          });
        }
        return result;
      }
    } catch {}
    return { in: {}, us: {} };
  });
  /** `__none__` = stocks with no sector label */
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('best');
  const [autoTradeLoading, setAutoTradeLoading] = useState(false);
  const [proceedErrorPopup, setProceedErrorPopup] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [goldPageOpen, setGoldPageOpen] = useState(false);
  const [stockSearchOpen, setStockSearchOpen] = useState(false);
  const [searchPinnedStocks, setSearchPinnedStocks] = useState<Stock[]>([]);
  const [highlightedSearchId, setHighlightedSearchId] = useState<string | null>(null);
  const [goldLoading, setGoldLoading] = useState(false);
  const [goldError, setGoldError] = useState<string | null>(null);
  const [indicesIn, setIndicesIn] = useState<{
    nifty: { price: number | null; change: number; changePercent: number } | null;
    sensex: { price: number | null; change: number; changePercent: number } | null;
    fetchedAt?: string;
  } | null>(null);
  const [indicesLoading, setIndicesLoading] = useState(false);
  const [goldPayload, setGoldPayload] = useState<{
    goodreturns?: {
      ok: boolean;
      sourceUrl?: string;
      /** Jina `Title:` line when present */
      pageTitle?: string | null;
      gold24kPerGram?: number | null;
      gold22kPerGram?: number | null;
      gold18kPerGram?: number | null;
      change24kInr?: number | null;
      change22kInr?: number | null;
      change18kInr?: number | null;
      fetchedAt?: string;
      error?: string;
      lastTenDaysOneGram?: Array<{ dateLabel: string; rate24k: string; rate22k: string }>;
    };
  } | null>(null);
  const [ordersModalTab, setOrdersModalTab] = useState<'orders' | 'portfolio' | 'analyse' | 'settings'>('orders');
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0);
  const [kiteHoldings, setKiteHoldings] = useState<Array<{
    tradingsymbol: string;
    exchange: string;
    quantity: number;
    average_price: number;
    last_price: number;
    pnl?: number;
    day_change_percentage?: number;
  }>>([]);
  const [kiteHoldingsLoading, setKiteHoldingsLoading] = useState(false);
  const [kiteHoldingsError, setKiteHoldingsError] = useState<string | null>(null);
  /** Portfolio tab: which Kite holdings count toward Invested / Current / P&L summary (default all). */
  const [portfolioSelectionIds, setPortfolioSelectionIds] = useState<Set<string>>(() => new Set());
  const portfolioSelectAllRef = useRef<HTMLInputElement>(null);
  const [bestSaleBySymbol, setBestSaleBySymbol] = useState<Record<string, BestSaleSignal>>({});
  const [kiteOrders, setKiteOrders] = useState<Array<{
    order_id: string;
    tradingsymbol: string;
    name?: string;
    exchange: string;
    status: string;
    transaction_type: string;
    quantity: number;
    average_price?: number;
    order_timestamp?: string;
    status_message?: string | null;
  }>>([]);
  const [kiteOrdersLoading, setKiteOrdersLoading] = useState(false);
  const [kiteOrdersError, setKiteOrdersError] = useState<string | null>(null);
  const [portfolioAnalysis, setPortfolioAnalysis] = useState<string | null>(null);
  const [portfolioAnalysisLoading, setPortfolioAnalysisLoading] = useState(false);
  const [portfolioAnalysisError, setPortfolioAnalysisError] = useState<string | null>(null);
  const [reportFullscreen, setReportFullscreen] = useState(false);
  const [analyseSource, setAnalyseSource] = useState<'kite' | 'xlsx'>('kite');
  const [xlsxHoldings, setXlsxHoldings] = useState<HoldingRow[]>([]);
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null);
  const [xlsxUploadError, setXlsxUploadError] = useState<string | null>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);
  const settingsSigninGroupRef = useRef<HTMLDivElement>(null);
  const settingsAccessTokenRef = useRef<HTMLDivElement>(null);
  const segmentMenuRef = useRef<HTMLDivElement>(null);
  const segmentMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const segmentMenuPopupRef = useRef<HTMLDivElement>(null);
  const kiteFormRef = useRef<{ apiKey: string; secret: string; accessToken: string; requestToken: string }>({ apiKey: '', secret: '', accessToken: '', requestToken: '' });
  const [kiteForm, setKiteForm] = useState({ apiKey: '', secret: '', accessToken: '', requestToken: '' });
  const [kiteGenerateLoading, setKiteGenerateLoading] = useState(false);
  const [kiteInvalidateLoading, setKiteInvalidateLoading] = useState(false);
  const [kiteInvalidateError, setKiteInvalidateError] = useState<string | null>(null);
  const [kiteError, setKiteError] = useState<string | null>(null);
  const [kiteGenerateResult, setKiteGenerateResult] = useState<{ success: boolean; accessToken?: string; error?: string } | null>(null);
  const [tradeConfirmModal, setTradeConfirmModal] = useState<{
    stocksToBuy: { symbol: string; name?: string; price?: number; changePercent?: number }[];
  } | null>(null);
  const [confirmCheckedSymbols, setConfirmCheckedSymbols] = useState<Set<string>>(new Set());
  const [buyQuantityBySymbol, setBuyQuantityBySymbol] = useState<Record<string, number>>({});
  const [tradeResult, setTradeResult] = useState<{
    success: boolean;
    error?: string;
    orders?: { symbol: string; name?: string; status: string; orderId?: string; error?: string }[];
  } | null>(null);
  const [failedOrdersFromTrade, setFailedOrdersFromTrade] = useState<Array<{
    order_id: string;
    tradingsymbol: string;
    name?: string;
    exchange: string;
    status: string;
    transaction_type: string;
    quantity: number;
    order_timestamp: string;
    status_message?: string;
    average_price?: number;
  }>>([]);

  const mergeSegmentRows = useCallback((existing: SegmentData[], incoming: SegmentData[]) => {
    const map = new Map<string, SegmentData>();
    existing.forEach((row) => map.set(String(row.segment || ''), row));
    incoming.forEach((row) => {
      const key = String(row.segment || '');
      const existingRow = map.get(key);
      const incomingHasData = (row.topGainers?.length ?? 0) > 0 || (row.topLosers?.length ?? 0) > 0;
      const existingHasData = (existingRow?.topGainers?.length ?? 0) > 0 || (existingRow?.topLosers?.length ?? 0) > 0;
      // Never overwrite good data with empty data (e.g. from a timeout fallback)
      if (existingHasData && !incomingHasData) return;
      map.set(key, row);
    });
    return LOAD_ORDER_SEGMENTS
      .map((seg) => map.get(seg))
      .filter(Boolean) as SegmentData[];
  }, []);

  const segmentsByMarketRef = useRef<Record<string, SegmentData[]>>(segmentsByMarket);
  useEffect(() => {
    segmentsByMarketRef.current = segmentsByMarket;
  }, [segmentsByMarket]);

  const pendingSegmentsByMarketRef = useRef<Record<string, SegmentData[]>>({});
  const activeStockIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<TabType | null>(null);
  useEffect(() => {
    activeStockIdRef.current = activeStockId;
    activeTabRef.current = activeTab;
  }, [activeStockId, activeTab]);

  const writeSegmentsCache = useCallback((baseState: Record<string, SegmentData[]>) => {
    const snapshot: Record<string, SegmentData[]> = { ...baseState };
    for (const [m, pendingRows] of Object.entries(pendingSegmentsByMarketRef.current)) {
      if (!pendingRows?.length) continue;
      snapshot[m] = mergeSegmentRows(snapshot[m] || [], pendingRows);
    }
    try { sessionStorage.setItem('livestock_segments_v1', JSON.stringify(snapshot)); } catch {}
  }, [mergeSegmentRows]);

  const flushPendingSegmentsForMarket = useCallback((m: string) => {
    const pending = pendingSegmentsByMarketRef.current[m];
    if (!pending?.length) return;
    setSegmentsByMarket((prev) => {
      const merged = mergeSegmentRows(prev[m] || [], pending);
      const next = { ...prev, [m]: merged };
      segmentsByMarketRef.current = next;
      pendingSegmentsByMarketRef.current[m] = [];
      writeSegmentsCache(next);
      return next;
    });
  }, [mergeSegmentRows, writeSegmentsCache]);

  const upsertSegmentsForMarket = useCallback((
    m: string,
    incoming: SegmentData[],
    options?: { applyToView?: boolean },
  ) => {
    const applyToView = options?.applyToView ?? true;
    if (!applyToView) {
      const existingPending = pendingSegmentsByMarketRef.current[m] || [];
      pendingSegmentsByMarketRef.current[m] = mergeSegmentRows(existingPending, incoming);
      writeSegmentsCache(segmentsByMarketRef.current);
      return;
    }
    setSegmentsByMarket((prev) => {
      const pending = pendingSegmentsByMarketRef.current[m] || [];
      const merged = mergeSegmentRows(prev[m] || [], mergeSegmentRows(pending, incoming));
      const next = { ...prev, [m]: merged };
      segmentsByMarketRef.current = next;
      pendingSegmentsByMarketRef.current[m] = [];
      writeSegmentsCache(next);
      return next;
    });
  }, [mergeSegmentRows, writeSegmentsCache]);

  // Ref-based cache: tracks which segments have been loaded per market.
  // useRef doesn't support lazy initializers — use null sentinel pattern instead.
  const loadedSegmentsRef = useRef<Record<string, Set<string>> | null>(null);
  if (loadedSegmentsRef.current === null) {
    const base: Record<string, Set<string>> = { in: new Set(), us: new Set() };
    try {
      const raw = sessionStorage.getItem('livestock_segments_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, SegmentData[]>;
        for (const [mkt, segs] of Object.entries(parsed)) {
          if (!base[mkt]) base[mkt] = new Set();
          (segs as SegmentData[]).forEach((s) => {
            if (s?.segment && ((s.topGainers?.length ?? 0) > 0 || (s.topLosers?.length ?? 0) > 0)) {
              base[mkt].add(s.segment);
            }
          });
        }
      }
    } catch {}
    loadedSegmentsRef.current = base;
  }

  // Fetch a group of segments in one API call (e.g. ['large','mid'])
  const fetchSegmentGroupForMarket = useCallback((
    m: string,
    segments: readonly string[],
    forceRefresh = false,
    silent = false,
  ) => {
    const isBackground = silent || forceRefresh;
    const keepReadyStateDuringBackgroundRefresh = forceRefresh && silent;

    // Skip if all segments in group already cached
    if (!forceRefresh) {
      const allLoaded = segments.every((s) => loadedSegmentsRef.current[m]?.has(s));
      if (allLoaded) return Promise.resolve();
    }

    if (!isBackground) { setLoading(true); setError(null); }
    if (forceRefresh && !silent) setRefreshing(true);

    // Mark all segments in group as loading
    if (!keepReadyStateDuringBackgroundRefresh) {
      setSegmentReadyByMarket((prev) => ({
        ...prev,
        [m]: { ...(prev[m] || {}), ...Object.fromEntries(segments.map((s) => [s, false])) },
      }));
    }

    const params = new URLSearchParams({ limit: '150', market: m, segment: segments.join(',') });
    if (forceRefresh) params.set('refresh', '1');

    return fetch(`${API}/stocks?${params}`)
      .then(async (r) => {
        const text = await r.text();
        if (!text) throw new Error('Empty response. Make sure the server is running.');
        try { return JSON.parse(text); }
        catch { throw new Error('Invalid response. Make sure the server is running.'); }
      })
      .then((data) => {
        const shouldDeferViewUpdate =
          silent &&
          activeStockIdRef.current != null &&
          activeTabRef.current === 'fundamentals';
        upsertSegmentsForMarket(m, data.segments || [], { applyToView: !shouldDeferViewUpdate });
        if (!loadedSegmentsRef.current[m]) loadedSegmentsRef.current[m] = new Set();
        segments.forEach((s) => loadedSegmentsRef.current[m].add(s));
        setSegmentReadyByMarket((prev) => ({
          ...prev,
          [m]: { ...(prev[m] || {}), ...Object.fromEntries(segments.map((s) => [s, true])) },
        }));
        setLastUpdated(data.date || new Date().toISOString());
        setError(null);
      })
      .catch((err) => {
        if (!isBackground) setError(err.message);
        setSegmentReadyByMarket((prev) => ({
          ...prev,
          [m]: { ...(prev[m] || {}), ...Object.fromEntries(segments.map((s) => [s, false])) },
        }));
      })
      .finally(() => {
        if (!isBackground) setLoading(false);
        if (forceRefresh && !silent) setRefreshing(false);
      });
  }, [upsertSegmentsForMarket]);

  // 3 grouped fetches: group1 shown immediately, groups 2+3 parallel in background
  const FETCH_GROUPS = [
    ['large', 'mid'],
    ['small', 'flexi'],
    ['micro', 'nano'],
  ] as const;

  const fetchForMarket = useCallback(async (m: string, forceRefresh = false, silent = false) => {
    if (forceRefresh) {
      loadedSegmentsRef.current[m] = new Set();
      if (!silent) {
        setSegmentsByMarket((prev) => ({ ...prev, [m]: [] }));
        setSegmentReadyByMarket((prev) => ({ ...prev, [m]: {} }));
      }
    }
    // Group 1 (large+mid): show immediately
    await fetchSegmentGroupForMarket(m, FETCH_GROUPS[0], forceRefresh, silent);
    // Groups 2+3: parallel background
    await Promise.all([
      fetchSegmentGroupForMarket(m, FETCH_GROUPS[1], forceRefresh, true),
      fetchSegmentGroupForMarket(m, FETCH_GROUPS[2], forceRefresh, true),
    ]);
  }, [fetchSegmentGroupForMarket, activeStockId, activeTab, upsertSegmentsForMarket]);

  const fetchIndicesIn = useCallback(() => {
    setIndicesLoading(true);
    fetch(`${API}/indices/in`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'indices_failed');
        setIndicesIn(j);
      })
      .catch(() => setIndicesIn(null))
      .finally(() => setIndicesLoading(false));
  }, []);

  useEffect(() => {
    fetchForMarket('in', false, false).then(() => {
      fetchForMarket('us', false, true);
    });
  }, [fetchForMarket]);

  useEffect(() => {
    fetchIndicesIn();
  }, [fetchIndicesIn]);

  useEffect(() => {
    if (market === 'us' && (!segmentsByMarket.us || segmentsByMarket.us.length === 0)) {
      fetchForMarket('us', false, false);
    }
  }, [market, segmentsByMarket.us, fetchForMarket]);

  const backgroundRefreshRunningRef = useRef<Record<string, boolean>>({});
  const lastBackgroundRefreshAtRef = useRef<Record<string, number>>({});
  const areAllCapSegmentsLoaded = useCallback((m: string) => {
    const loaded = loadedSegmentsRef.current?.[m];
    return CAP_SEGMENT_VALUES.every((seg) => loaded?.has(seg));
  }, []);

  const refreshMarketInBackground = useCallback(async (m: string) => {
    if (backgroundRefreshRunningRef.current[m]) return;
    backgroundRefreshRunningRef.current[m] = true;
    try {
      for (const group of FETCH_GROUPS) {
        await fetchSegmentGroupForMarket(m, group, true, true);
      }
      lastBackgroundRefreshAtRef.current[m] = Date.now();
    } finally {
      backgroundRefreshRunningRef.current[m] = false;
    }
  }, [fetchSegmentGroupForMarket]);

  useEffect(() => {
    const marketsToRefresh = ['in', 'us'] as const;
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    const tick = () => {
      for (const m of marketsToRefresh) {
        if (!areAllCapSegmentsLoaded(m)) continue;
        const lastAt = lastBackgroundRefreshAtRef.current[m] || 0;
        if (Date.now() - lastAt < FIFTEEN_MIN_MS) continue;
        void refreshMarketInBackground(m);
      }
    };
    const intervalId = window.setInterval(tick, FIFTEEN_MIN_MS);
    return () => window.clearInterval(intervalId);
  }, [areAllCapSegmentsLoaded, refreshMarketInBackground]);

  // Only clear the expanded stock when switching market (list + ids are market-specific).
  // Cap / display-limit / sector changes are handled by the stocks reconciliation effect so a
  // large-cap row stays open when trimming other caps from the filter (e.g. uncheck mid).
  useEffect(() => {
    setActiveStockId(null);
    setActiveTab(null);
  }, [market]);

  // Reset cap filter to large when switching market so user starts fresh.
  const prevMarketRef = useRef(market);
  useEffect(() => {
    if (prevMarketRef.current !== market) {
      prevMarketRef.current = market;
      setSegmentFilter(['large']);
    }
  }, [market]);

  // Auto-select: keep user selection valid as segments load one by one.
  useEffect(() => {
    const readyMap = segmentReadyByMarket[market] || {};
    const readySegments: string[] = CAP_SEGMENT_VALUES.filter((v) => readyMap[v]);
    if (!readySegments.length) return;
    setSegmentFilter((prev) => {
      if (!prev.length) return prev; // allow explicit 0-selected state
      if (prev.includes('all')) {
        // Sync 'all' array to include newly loaded segments so allChecked stays accurate
        const currentInFilter = new Set(prev.filter((v) => v !== 'all'));
        const newOnes = readySegments.filter((v) => !currentInFilter.has(v));
        if (newOnes.length === 0) return prev;
        return ['all', ...Array.from(currentInFilter), ...newOnes];
      }
      // Keep any segments the user has selected that are now ready
      const prevValid = prev.filter((v) => v !== 'all' && readySegments.includes(v));
      if (prevValid.length > 0) return prevValid;
      // If currently selected segments became invalid/unavailable, allow empty state.
      return [];
    });
  }, [market, segmentReadyByMarket]);

  useEffect(() => {
    setSectorFilter('all');
  }, [market, segmentFilter]);

  useEffect(() => {
    // User changed cap selection: apply any pending background updates now.
    flushPendingSegmentsForMarket(market);
  }, [market, segmentFilter, flushPendingSegmentsForMarket]);

  useEffect(() => {
    if (!segmentMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        target &&
        segmentMenuRef.current &&
        !segmentMenuRef.current.contains(target) &&
        segmentMenuPopupRef.current &&
        !segmentMenuPopupRef.current.contains(target)
      ) {
        setSegmentMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [segmentMenuOpen]);

  useEffect(() => {
    if (!segmentMenuOpen) return;
    const updatePosition = () => {
      const rect = segmentMenuTriggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSegmentMenuPos({
        top: rect.bottom + 6,
        left: rect.left,
        minWidth: Math.max(rect.width, 192),
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [segmentMenuOpen]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FUNDAMENTALS_CACHE_KEY, JSON.stringify(fundamentalsCache));
    } catch {
      /* ignore */
    }
  }, [fundamentalsCache]);

  useEffect(() => {
    if (historyModalOpen || reportFullscreen || goldPageOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [historyModalOpen, reportFullscreen, goldPageOpen]);

  useEffect(() => {
    if (!goldPageOpen) return;
    setGoldLoading(true);
    setGoldError(null);
    fetch(`${API}/gold/chennai`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Failed to load gold data');
        setGoldPayload(j);
      })
      .catch((e: Error) => {
        setGoldError(e.message);
        setGoldPayload(null);
      })
      .finally(() => setGoldLoading(false));
  }, [goldPageOpen]);

  kiteFormRef.current = kiteForm;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get('request_token')?.trim();
    if (!requestToken) return;
    if (window.opener) {
      window.opener.postMessage({ type: 'kite-request-token', requestToken }, window.location.origin);
      window.close();
      return;
    }
    try {
      sessionStorage.setItem('kite-request-token', requestToken);
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'kite-request-token') return;
      const token = e.data?.requestToken?.trim();
      if (!token) return;
      const creds = kiteFormRef.current;
      if (!creds.apiKey || !creds.secret) {
        setKiteForm((f) => ({ ...f, requestToken: token }));
        return;
      }
      setKiteGenerateLoading(true);
      setKiteError(null);
      setKiteGenerateResult(null);
      fetchJson<{ success?: boolean; error?: string; accessToken?: string }>(`${API}/settings/kite/generate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...kiteHeaders(creds) },
        body: JSON.stringify({ requestToken: token, apiKey: creds.apiKey, apiSecret: creds.secret }),
      })
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setKiteForm((f) => ({ ...f, accessToken: data.accessToken || '', requestToken: '' }));
          setKiteGenerateResult({ success: true, accessToken: data.accessToken });
        })
        .catch((e) => {
          setKiteGenerateResult({ success: false, error: (e as Error).message });
        })
        .finally(() => setKiteGenerateLoading(false));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('kite-request-token');
    if (!stored || !historyModalOpen || ordersModalTab !== 'settings') return;
    sessionStorage.removeItem('kite-request-token');
    const creds = kiteFormRef.current;
    if (creds.apiKey && creds.secret) {
      setKiteGenerateLoading(true);
      setKiteError(null);
      setKiteGenerateResult(null);
      fetchJson<{ success?: boolean; error?: string; accessToken?: string }>(`${API}/settings/kite/generate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...kiteHeaders(creds) },
        body: JSON.stringify({ requestToken: stored, apiKey: creds.apiKey, apiSecret: creds.secret }),
      })
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setKiteForm((f) => ({ ...f, accessToken: data.accessToken || '', requestToken: '' }));
          setKiteGenerateResult({ success: true, accessToken: data.accessToken });
        })
        .catch((e) => {
          setKiteForm((f) => ({ ...f, requestToken: stored }));
          setKiteGenerateResult({ success: false, error: (e as Error).message });
        })
        .finally(() => setKiteGenerateLoading(false));
    } else {
      setKiteForm((f) => ({ ...f, requestToken: stored }));
    }
  }, [historyModalOpen, ordersModalTab]);

  useEffect(() => {
    if (ordersModalTab === 'settings') {
      setKiteError(null);
      setKiteInvalidateError(null);
      setKiteGenerateResult(null);
    }
  }, [ordersModalTab]);

  useEffect(() => {
    if (!historyModalOpen || ordersModalTab !== 'settings') return;
    const hasCreds = kiteForm.apiKey && kiteForm.secret;
    const hasToken = !!(kiteForm.requestToken.trim() || kiteForm.accessToken.trim());
    const el = hasToken ? settingsAccessTokenRef.current : hasCreds ? settingsSigninGroupRef.current : null;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(id);
  }, [historyModalOpen, ordersModalTab, kiteForm.apiKey, kiteForm.secret, kiteForm.requestToken, kiteForm.accessToken]);

  useEffect(() => {
    if (historyModalOpen) {
      setKiteOrdersError(null);
      setKiteOrdersLoading(true);
      fetchJson<{ orders?: Array<{ order_id: string; tradingsymbol: string; exchange: string; status: string; transaction_type: string; quantity: number; average_price?: number; order_timestamp?: string; status_message?: string | null }>; error?: string }>(`${API}/kite/orders`, {
        headers: kiteHeaders(kiteForm),
      })
        .then((data) => {
          if (data.error) {
            setKiteOrdersError(data.error);
            setKiteOrders([]);
          } else {
            setKiteOrders(data.orders || []);
          }
        })
        .catch((e) => {
          setKiteOrdersError((e as Error).message);
          setKiteOrders([]);
        })
        .finally(() => setKiteOrdersLoading(false));
    }
  }, [historyModalOpen, ordersRefreshTrigger, kiteForm.apiKey, kiteForm.accessToken]);

  useEffect(() => {
    if (historyModalOpen && (ordersModalTab === 'portfolio' || ordersModalTab === 'analyse')) {
      setKiteHoldingsLoading(true);
      fetchJson<{ holdings?: Array<{ tradingsymbol: string; exchange: string; quantity: number; average_price: number; last_price: number; pnl?: number; day_change_percentage?: number }>; error?: string }>(`${API}/kite/holdings`, {
        headers: kiteHeaders(kiteForm),
      })
        .then((data) => {
          if (data.error) {
            setKiteHoldingsError(data.error);
            setKiteHoldings([]);
          } else {
            setKiteHoldingsError(null);
            setKiteHoldings(data.holdings || []);
          }
        })
        .catch((e) => {
          setKiteHoldingsError((e as Error).message);
          setKiteHoldings([]);
        })
        .finally(() => setKiteHoldingsLoading(false));
    }
  }, [historyModalOpen, ordersModalTab, kiteForm.apiKey, kiteForm.accessToken]);

  useEffect(() => {
    if (kiteHoldings.length === 0) {
      setPortfolioSelectionIds(new Set());
      return;
    }
    setPortfolioSelectionIds(new Set(kiteHoldings.map(kiteHoldingKey)));
  }, [kiteHoldings]);

  useEffect(() => {
    const el = portfolioSelectAllRef.current;
    if (!el) return;
    const n = kiteHoldings.length;
    if (n === 0) {
      el.indeterminate = false;
      return;
    }
    let sel = 0;
    for (const h of kiteHoldings) {
      if (portfolioSelectionIds.has(kiteHoldingKey(h))) sel += 1;
    }
    el.indeterminate = sel > 0 && sel < n;
  }, [kiteHoldings, portfolioSelectionIds]);

  useEffect(() => {
    if (!historyModalOpen || ordersModalTab !== 'portfolio') return;
    if (kiteHoldingsLoading || kiteHoldingsError || kiteHoldings.length === 0) return;
    let cancelled = false;
    const unique = [...new Set(kiteHoldings.map((h) => String(h.tradingsymbol || '').trim()).filter(Boolean))];
    const run = async () => {
      const entries = await Promise.all(unique.map(async (sym) => {
        const holding = kiteHoldings.find((h) => h.tradingsymbol === sym);
        const market = 'in';
        const [chartRes, fundamentalsRes] = await Promise.all([
          fetch(`${API}/chart/${encodeURIComponent(sym)}?period=1y&market=${market}`).then((r) => r.json()).catch(() => ({})),
          fetch(`${API}/fundamentals/${encodeURIComponent(sym)}?market=${market}`).then((r) => r.json()).catch(() => ({})),
        ]);
        const signal = deriveBestSaleSignal({
          history: Array.isArray(chartRes?.history) ? chartRes.history : [],
          fundamentals: fundamentalsRes && typeof fundamentalsRes === 'object' ? fundamentalsRes : null,
          averagePrice: holding?.average_price,
          lastPrice: holding?.last_price,
          dayChangePct: holding?.day_change_percentage,
        });
        return [sym, signal] as const;
      }));
      if (cancelled) return;
      setBestSaleBySymbol((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    };
    run();
    return () => { cancelled = true; };
  }, [historyModalOpen, ordersModalTab, kiteHoldingsLoading, kiteHoldingsError, kiteHoldings]);

  const portfolioKiteSelectedHoldings = useMemo(
    () => kiteHoldings.filter((h) => portfolioSelectionIds.has(kiteHoldingKey(h))),
    [kiteHoldings, portfolioSelectionIds],
  );
  const portfolioKiteSummary = useMemo(() => {
    const rows = portfolioKiteSelectedHoldings;
    const invested = rows.reduce((s, h) => s + h.quantity * (h.average_price ?? 0), 0);
    const value = rows.reduce((s, h) => s + h.quantity * (h.last_price ?? 0), 0);
    const pnl = rows.reduce(
      (s, h) => s + (h.pnl ?? h.quantity * ((h.last_price ?? 0) - (h.average_price ?? 0))),
      0,
    );
    return { invested, value, pnl, selectedCount: rows.length };
  }, [portfolioKiteSelectedHoldings]);

  const kiteConfigured = !!(kiteForm.apiKey && kiteForm.accessToken);
  const holdingsForAnalysis = analyseSource === 'xlsx' && xlsxHoldings.length > 0 ? xlsxHoldings : kiteHoldings;

  const canRunKiteAnalysis = !kiteHoldingsLoading && !kiteHoldingsError && kiteHoldings.length > 0;
  const canRunXlsxAnalysis = xlsxHoldings.length > 0;

  useEffect(() => {
    if (ordersModalTab === 'analyse' && !kiteConfigured) setAnalyseSource('xlsx');
  }, [ordersModalTab, kiteConfigured]);

  useEffect(() => {
    if (!historyModalOpen || ordersModalTab !== 'analyse') return;
    const fromKite = analyseSource === 'kite' && canRunKiteAnalysis;
    const fromXlsx = analyseSource === 'xlsx' && canRunXlsxAnalysis;
    if (!fromKite && !fromXlsx) {
      setPortfolioAnalysis(null);
      return;
    }
    const holdings = analyseSource === 'xlsx' ? xlsxHoldings : kiteHoldings;
    setPortfolioAnalysisError(null);
    setPortfolioAnalysisLoading(true);
    fetch(`${API}/analyze-portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdings }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.analysis || data.error);
        setPortfolioAnalysis(data.analysis || '');
      })
      .catch((e) => {
        setPortfolioAnalysisError((e as Error).message);
        setPortfolioAnalysis(null);
      })
      .finally(() => setPortfolioAnalysisLoading(false));
  }, [historyModalOpen, ordersModalTab, analyseSource, canRunKiteAnalysis, canRunXlsxAnalysis, kiteHoldings, xlsxHoldings]);

  const handleSelectStock = useCallback((id: string, checked: boolean) => {
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const segments = segmentsByMarket[market] || [];

  const baseMerged = useMemo(() => {
    if (!segmentFilter || segmentFilter.length === 0) return [];
    let merged: Stock[] = [];
    if (segmentFilter.includes('all')) {
      const all = segments.flatMap((s) => [...s.topGainers, ...s.topLosers]);
      const seen = new Set<string>();
      merged = all.filter((s) => {
        if (seen.has(s.symbol)) return false;
        seen.add(s.symbol);
        return true;
      });
    } else {
      const chosen = segments.filter((s) => segmentFilter.includes(s.segment));
      if (!chosen.length) return [];
      const combined = chosen.flatMap((seg) => [...seg.topGainers, ...seg.topLosers]);
      const seen = new Set<string>();
      merged = combined.filter((s) => {
        if (seen.has(s.symbol)) return false;
        seen.add(s.symbol);
        return true;
      });
    }
    return merged;
  }, [segments, segmentFilter]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    baseMerged.forEach((s) => {
      const t = (s.sector || '').trim();
      set.add(t ? t : '__none__');
    });
    const sortKey = (x: string) => (x === '__none__' ? '\uffff' : x);
    return [...set].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [baseMerged]);

  useEffect(() => {
    if (sectorFilter === 'all') return;
    if (sectorFilter === '__psu__') {
      if (market === 'in') return;
      setSectorFilter('all');
      return;
    }
    if (!sectorOptions.includes(sectorFilter)) setSectorFilter('all');
  }, [sectorFilter, sectorOptions, market]);

  const stocks = useMemo(() => {
    if (!segmentFilter || segmentFilter.length === 0) return [];
    let merged = baseMerged;
    if (sectorFilter !== 'all') {
      merged = merged.filter((s) => {
        const t = (s.sector || '').trim();
        if (sectorFilter === '__none__') return !t;
        if (sectorFilter === '__psu__') return Boolean(s.isPSU);
        return t === sectorFilter;
      });
    }
    const byAbsoluteChange = [...merged].sort((a, b) => {
      const aAbs = Math.abs(a.changePercent ?? 0);
      const bAbs = Math.abs(b.changePercent ?? 0);
      return bAbs - aAbs;
    });
    const topListing = byAbsoluteChange.slice(0, displayLimit);
    const losersInTopN = topListing.filter((s) => (s.changePercent ?? 0) < 0);
    const volumeLog = (v: number | undefined) => Math.log10(Math.max(v ?? 1, 1));
    const capLog = (v: number | undefined) => Math.log10(Math.max(v ?? 1, 1));
    const scored = losersInTopN.map((s) => {
      const dip = -(s.changePercent ?? 0);
      const vol = volumeLog(s.volume) * 0.3;
      const week = (s.weekChange ?? 0) < 0 ? 0.5 : 0;
      const month = (s.monthChange ?? 0) < 0 ? 0.3 : 0;
      const cap = capLog(s.marketCap) * 0.2;
      let fiftyTwoWScore = 0;
      const price = s.price ?? 0;
      const high = s.fiftyTwoWeekHigh;
      const low = s.fiftyTwoWeekLow;
      if (high != null && low != null && high > low && price > 0) {
        const upsideInRange = (high - price) / (high - low);
        fiftyTwoWScore = Math.max(0, Math.min(1, upsideInRange)) * 2;
      }
      const mcap = s.marketCap ?? 1;
      const turnover = (s.volume ?? 0) / mcap;
      const turnoverScore = Math.min(1, Math.log10(Math.max(turnover * 1e6, 1)) / 8) * 0.3;
      const bestScore = dip * 2 + vol + week + month + cap + fiftyTwoWScore + turnoverScore;
      return { ...s, _bestScore: bestScore };
    });
    scored.sort((a, b) => (b._bestScore ?? 0) - (a._bestScore ?? 0));
    const symbolToBestRank: Record<string, number> = {};
    scored.forEach((s, i) => {
      symbolToBestRank[s.symbol] = i + 1;
    });
    const topWithBestRank = topListing.map((s) => ({
      ...s,
      bestRank: symbolToBestRank[s.symbol],
    }));
    const sorted = [...topWithBestRank].sort((a, b) => {
      if (sortOrder === 'best') {
        const aBest = a.bestRank ?? 9999;
        const bBest = b.bestRank ?? 9999;
        return aBest - bBest;
      }
      if (sortOrder === 'bestprice') {
        const aPrice = a.price ?? Infinity;
        const bPrice = b.price ?? Infinity;
        if (aPrice !== bPrice) return aPrice - bPrice;
        const aBest = a.bestRank ?? 9999;
        const bBest = b.bestRank ?? 9999;
        return aBest - bBest;
      }
      const aVal = a.changePercent ?? 0;
      const bVal = b.changePercent ?? 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    const ranked = sorted.map((s, i) => ({ ...s, rank: i + 1 }));
    const pinnedForMarket = searchPinnedStocks
      .filter((s) => (s.market || 'in') === market)
      .map((s) => ({ ...s, rank: 0 }));
    return [...pinnedForMarket, ...ranked];
  }, [baseMerged, segmentFilter, sectorFilter, sortOrder, displayLimit, searchPinnedStocks, market]);

  // After cap/segment list merges, row ids `${symbol}-${segment}` can drift while caches still use the old id.
  // Remap selection + caches so the expanded row (and fundamentals tab) stay attached to the visible stock.
  useEffect(() => {
    if (!activeStockId) return;
    const rowId = (s: Stock) => `${s.symbol}-${s.segment}`;
    if (stocks.some((s) => rowId(s) === activeStockId)) return;

    const candidates = stocks.filter((s) => activeStockId.startsWith(`${s.symbol}-`));
    if (!candidates.length) {
      setActiveStockId(null);
      setActiveTab(null);
      return;
    }
    const nonSearch = candidates.filter((s) => !String(s.segment || '').startsWith('search'));
    const nextStock = nonSearch[0] ?? candidates[0];
    const newId = rowId(nextStock);
    if (newId === activeStockId) return;

    const oldId = activeStockId;
    setActiveStockId(newId);

    const rekeyRecord = <T,>(rec: Record<string, T>): Record<string, T> => {
      if (!Object.prototype.hasOwnProperty.call(rec, oldId)) return rec;
      const next = { ...rec };
      next[newId] = rec[oldId];
      delete next[oldId];
      return next;
    };

    setFundamentalsCache((c) => rekeyRecord(c));
    setAnalysisCache((c) => rekeyRecord(c));
    setQuarterlyProfitCache((c) => rekeyRecord(c));
    setStockInfoCache((c) => rekeyRecord(c));
    setFinancialsReportCache((c) => rekeyRecord(c));
    setChartCache((c) => rekeyRecord(c));
    setChartPeriod((p) => rekeyRecord(p));
    setPredictionPeriod((p) => rekeyRecord(p));
    setPredictionCache((c) => {
      let touched = false;
      const next = { ...c };
      for (const k of Object.keys(c)) {
        if (k.startsWith(`${oldId}-`)) {
          const nk = newId + k.slice(oldId.length);
          next[nk] = c[k];
          delete next[k];
          touched = true;
        }
      }
      return touched ? next : c;
    });

    setLoadingFundamentalsId((x) => (x === oldId ? newId : x));
    setLoadingAnalysisId((x) => (x === oldId ? newId : x));
    setLoadingQuarterlyProfitId((x) => (x === oldId ? newId : x));
    setLoadingStockInfoId((x) => (x === oldId ? newId : x));
    setLoadingFinancialsReportId((x) => (x === oldId ? newId : x));
    setLoadingChartId((x) => (x === oldId ? newId : x));
    setLoadingPredictionId((x) => (x === oldId ? newId : x));
    setHighlightedSearchId((h) => (h === oldId ? newId : h));
    setSelectedStockIds((prev) => {
      if (!prev.has(oldId)) return prev;
      const next = new Set(prev);
      next.delete(oldId);
      next.add(newId);
      return next;
    });
  }, [stocks, activeStockId]);

  const loadFinancialsForStock = async (stock: Stock, id: string) => {
    const mkt = stock.market || 'in';
    const sym = String(stock.symbol || '').replace(/\.(NS|BO)$/i, '');

    let fund: Record<string, string> | undefined = fundamentalsCache[id];
    if (!fund) {
      setLoadingFundamentalsId(id);
      try {
        const res = await fetch(`${API}/fundamentals/${encodeURIComponent(stock.symbol)}?market=${mkt}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        fund = data as Record<string, string>;
        setFundamentalsCache((c) => ({ ...c, [id]: fund! }));
      } catch {
        fund = {};
      } finally {
        setLoadingFundamentalsId(null);
      }
    }

    let qp: QuarterlyProfitPayload | undefined = quarterlyProfitCache[id];
    if (!qp) {
      setLoadingQuarterlyProfitId(id);
      try {
        const res = await fetch(`${API}/quarterly-profit/${encodeURIComponent(sym)}?market=${mkt}`);
        const data = (await res.json()) as QuarterlyProfitPayload & { error?: string };
        if (!res.ok) {
          qp = {
            symbol: sym,
            market: mkt,
            quarters: [],
            annual: [],
            error: data.error || 'Could not load quarterly profit',
          };
        } else {
          qp = data;
        }
        setQuarterlyProfitCache((c) => ({ ...c, [id]: qp! }));
      } catch {
        qp = { symbol: sym, market: mkt, quarters: [], annual: [], error: 'Network error' };
        setQuarterlyProfitCache((c) => ({ ...c, [id]: qp! }));
      } finally {
        setLoadingQuarterlyProfitId(null);
      }
    }

    let info: StockInfoResponse | undefined = stockInfoCache[id];
    if (!info) {
      setLoadingStockInfoId(id);
      try {
        const res = await fetch(`${API}/stock-info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock, fundamentals: fund ?? {} }),
        });
        const data = (await res.json()) as StockInfoResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || 'stock-info failed');
        info = data;
        setStockInfoCache((c) => ({ ...c, [id]: data }));
      } catch {
        info = undefined;
      } finally {
        setLoadingStockInfoId(null);
      }
    }

    if (!financialsReportCache[id]) {
      setLoadingFinancialsReportId(id);
      try {
        const res = await fetch(`${API}/stock-financials-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stock,
            fundamentals: fund,
            quarterlyProfit: qp,
            stockInfo: info,
          }),
        });
        const data = (await res.json()) as { markdown?: string; error?: string };
        const md =
          !res.ok && !data.markdown
            ? `**Error:** ${data.error || 'Report failed'}`
            : data.markdown || '_Empty report._';
        setFinancialsReportCache((c) => ({ ...c, [id]: md }));
      } catch (e) {
        setFinancialsReportCache((c) => ({
          ...c,
          [id]: `**Error:** ${e instanceof Error ? e.message : 'Network error'}`,
        }));
      } finally {
        setLoadingFinancialsReportId(null);
      }
    }
  };

  const ensureThreeYearChartLoaded = useCallback(async (stock: Stock, id: string) => {
    if (chartCache[id]?.['3y']) return chartCache[id]?.['3y'] ?? [];
    const marketCode = stock.market || 'in';
    setLoadingChartId(id);
    try {
      const res = await fetch(`${API}/chart/${stock.symbol}?period=3y&market=${marketCode}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const history = Array.isArray(data.history) ? data.history : [];
      setChartCache((c) => ({
        ...c,
        [id]: { ...(c[id] ?? {}), '3y': history },
      }));
      return history;
    } catch {
      setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), '3y': [] } }));
      return [];
    } finally {
      setLoadingChartId(null);
    }
  }, [chartCache]);

  const ensureChartLoadedForPeriod = useCallback(async (stock: Stock, id: string, period: ChartPeriod) => {
    if (period === '5y') {
      if (chartCache[id]?.['5y']) return chartCache[id]?.['5y'] ?? [];
      const marketCode = stock.market || 'in';
      setLoadingChartId(id);
      try {
        const res = await fetch(`${API}/chart/${stock.symbol}?period=5y&market=${marketCode}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const history = Array.isArray(data.history) ? data.history : [];
        setChartCache((c) => ({
          ...c,
          [id]: { ...(c[id] ?? {}), '5y': history },
        }));
        return history;
      } catch {
        setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), '5y': [] } }));
        return [];
      } finally {
        setLoadingChartId(null);
      }
    }
    return ensureThreeYearChartLoaded(stock, id);
  }, [chartCache, ensureThreeYearChartLoaded]);

  const handleStockTap = (stock: Stock) => {
    const id = `${stock.symbol}-${stock.segment}`;
    if (activeStockId === id) {
      setActiveStockId(null);
      setActiveTab(null);
      return;
    }
    const openTab = preferredTab || 'chart';
    setActiveStockId(id);
    setActiveTab(openTab);
    setChartPeriod((p) => ({ ...p, [id]: p[id] ?? preferredChartPeriod }));
    const market = stock.market || 'in';

    // Load fundamentals if not cached
    if (!fundamentalsCache[id]) {
      if (INDEX_SYMBOLS.has(stock.symbol)) {
        setFundamentalsCache((c) => ({
          ...c,
          [id]: buildIndexFundamentals(stock.symbol, stock.price, indicesIn) as unknown as Record<string, string>,
        }));
      } else {
      setLoadingFundamentalsId(id);
      fetch(`${API}/fundamentals/${stock.symbol}?market=${market}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setFundamentalsCache((c) => ({ ...c, [id]: data }));
        })
        .catch(() => { /* no fallback - live data only */ })
        .finally(() => setLoadingFundamentalsId(null));
      }
    }

    // Preload single source of truth: 3Y chart
    void ensureThreeYearChartLoaded(stock, id);

    // Preload pros-cons if not cached
    if (!analysisCache[id]) {
      setLoadingAnalysisId(id);
      fetch(`${API}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock }),
      })
        .then((r) => r.json())
        .then((analysis) => setAnalysisCache((c) => ({ ...c, [id]: analysis })))
        .catch(() => setAnalysisCache((c) => ({ ...c, [id]: { pros: ['Analysis failed'], cons: ['Try again'] } })))
        .finally(() => setLoadingAnalysisId(null));
    }

    if (openTab === 'chart') {
      const period = chartPeriod[id] ?? preferredChartPeriod;
      void ensureChartLoadedForPeriod(stock, id, period);
    }

  };

  const handleSearchSelect = (picked: { symbol: string; name: string; market?: string; segment?: string }) => {
    const mkt = (picked.market || market) as string;
    const seg = `search-${String(picked.symbol || '').replace(/[^A-Za-z0-9]/g, '_')}`;
    const match = {
      symbol: picked.symbol,
      name: picked.name || picked.symbol,
      price: 0,
      change: 0,
      changePercent: 0,
      segment: seg,
      segmentName: 'Search',
      rank: 0,
      market: mkt,
    };
    setSearchPinnedStocks((prev) => {
      const key = `${match.symbol}|${mkt}`;
      const next = prev.filter((s) => `${s.symbol}|${s.market || 'in'}` !== key);
      return [match as Stock, ...next];
    });
    setMarket(mkt);
    setSegmentFilter(['all', ...CAP_SEGMENT_VALUES]);
    setSectorFilter('all');
    setPreferredTab('chart');
    const id = `${match.symbol}-${match.segment}`;
    setHighlightedSearchId(id);
    setTimeout(() => {
      setHighlightedSearchId((prev) => (prev === id ? null : prev));
    }, 1500);
    setChartPeriod((p) => ({ ...p, [id]: p[id] ?? preferredChartPeriod }));
    const marketCode = match.market || 'in';
    if (!fundamentalsCache[id]) {
      setLoadingFundamentalsId(id);
      fetch(`${API}/fundamentals/${match.symbol}?market=${marketCode}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setFundamentalsCache((c) => ({ ...c, [id]: data }));
        })
        .catch(() => { /* live-only */ })
        .finally(() => setLoadingFundamentalsId(null));
    }

    fetch(`${API}/quote/${encodeURIComponent(match.symbol)}?market=${marketCode}`)
      .then((r) => r.json())
      .then((q) => {
        const livePrice = parsePriceLike(q?.price);
        const liveChangePct = Number.isFinite(Number(q?.changePercent)) ? Number(q.changePercent) : null;
        const liveChange = Number.isFinite(Number(q?.change)) ? Number(q.change) : null;
        setSearchPinnedStocks((prev) => prev.map((row) => {
          if (!(row.symbol === match.symbol && (row.market || 'in') === marketCode)) return row;
          return {
            ...row,
            price: livePrice > 0 ? livePrice : row.price,
            changePercent: liveChangePct != null ? liveChangePct : row.changePercent,
            change: liveChange != null ? liveChange : row.change,
            volume: Number.isFinite(Number(q?.volume)) ? Number(q.volume) : row.volume,
            marketCap: Number.isFinite(Number(q?.marketCap)) ? Number(q.marketCap) : row.marketCap,
            ...(q?.isPSU ? { isPSU: true } : {}),
          };
        }));
      })
      .catch(() => { /* ignore */ });
  };

  const handleAddIndexToList = useCallback((key: 'nifty' | 'sensex') => {
    if (!indicesIn || !indicesIn[key] || indicesIn[key]?.price == null) return;
    const row = indicesIn[key]!;
    const symbol = key === 'nifty' ? '^NSEI' : '^BSESN';
    const name = key === 'nifty' ? 'NIFTY 50' : 'SENSEX';
    const seg = `search-index-${key}`;
    const match: Stock = {
      symbol,
      name,
      price: Number(row.price) || 0,
      change: Number(row.change) || 0,
      changePercent: Number(row.changePercent) || 0,
      segment: seg,
      segmentName: 'Search',
      rank: 0,
      market: 'in',
      history: [],
    };
    const pinKey = `${symbol}|in`;
    setSearchPinnedStocks((prev) => {
      const next = prev.filter((s) => `${s.symbol}|${s.market || 'in'}` !== pinKey);
      return [match, ...next];
    });
    setMarket('in');
    const id = `${match.symbol}-${match.segment}`;
    setHighlightedSearchId(id);
    setTimeout(() => {
      setHighlightedSearchId((prev) => (prev === id ? null : prev));
    }, 1500);
  }, [indicesIn]);

  const handleRemoteSearch = useCallback(async (query: string) => {
    const raw = String(query || '').trim();
    const q = raw
      .replace(/\.(NS|BO)$/i, '')
      .replace(/\b(NSE|BSE)\b/gi, '')
      .trim();
    if (q.length < 1) return [];
    const r = await fetch(`${API}/search/stocks?q=${encodeURIComponent(q)}`);
    const data = await r.json().catch(() => ({}));
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows
      .map((x: Record<string, unknown>) => ({
        symbol: String(x.symbol || ''),
        name: String(x.name || x.symbol || ''),
        market: String(x.market || 'us'),
        exchange: String(x.exchange || ''),
        segment: 'search',
      }))
      .filter((x: { symbol: string; name: string; market: string; segment: string }) => {
        const m = String(x.market || '').toLowerCase();
        return market === 'in' ? m === 'in' : m === 'us';
      })
      .filter((x: { symbol: string; name: string; market: string; exchange?: string; segment: string }) => {
        if (!(x.symbol && x.name)) return false;
        if (market !== 'in') return true;
        return /\.NS$/i.test(x.symbol) || /\bNSE\b/i.test(String(x.exchange || ''));
      })
      // Support both stock name and symbol in the same Yahoo search response.
      .filter((x: { symbol: string; name: string; market: string; exchange?: string; segment: string }) => {
        const sym = String(x.symbol || '').toLowerCase();
        const name = String(x.name || '').toLowerCase();
        const qq = q.toLowerCase();
        return name.includes(qq) || sym.includes(qq);
      });
  }, [market]);

  const handleClearSearchPinnedItem = useCallback((stock: Stock) => {
    const id = `${stock.symbol}-${stock.segment}`;
    setSearchPinnedStocks((prev) => prev.filter((s) => !(s.symbol === stock.symbol && s.segment === stock.segment)));
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (activeStockId === id) {
      setActiveStockId(null);
      setActiveTab(null);
    }
  }, [activeStockId]);

  const handleTabClick = async (stock: Stock, tab: TabType) => {
    const id = `${stock.symbol}-${stock.segment}`;
    if (tab !== 'prediction') {
      setPreferredTab(tab);
    }
    const isSameStock = activeStockId === id;
    const isSameTab = activeTab === tab;
    if (isSameStock && isSameTab) {
      setActiveStockId(null);
      setActiveTab(null);
      return;
    }
    setActiveStockId(id);
    setActiveTab(tab);

    if (tab === 'proscons' && !analysisCache[id]) {
      setLoadingAnalysisId(id);
      try {
        const res = await fetch(`${API}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock }),
        });
        const analysis = await res.json();
        setAnalysisCache((c) => ({ ...c, [id]: analysis }));
      } catch {
        setAnalysisCache((c) => ({ ...c, [id]: { pros: ['Analysis failed'], cons: ['Try again'] } }));
      } finally {
        setLoadingAnalysisId(null);
      }
    }

    if (tab === 'fundamentals' && !fundamentalsCache[id]) {
      if (INDEX_SYMBOLS.has(stock.symbol)) {
        setFundamentalsCache((c) => ({
          ...c,
          [id]: buildIndexFundamentals(stock.symbol, stock.price, indicesIn) as unknown as Record<string, string>,
        }));
      } else {
      setLoadingFundamentalsId(id);
      try {
        const res = await fetch(`${API}/fundamentals/${stock.symbol}?market=${stock.market || 'in'}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setFundamentalsCache((c) => ({ ...c, [id]: data }));
      } catch {
        /* no fallback - live data only */
      } finally {
        setLoadingFundamentalsId(null);
      }
      }
    }

    if (tab === 'chart') {
      setChartPeriod((p) => ({ ...p, [id]: p[id] ?? preferredChartPeriod }));
      const period = chartPeriod[id] ?? preferredChartPeriod;
      await ensureChartLoadedForPeriod(stock, id, period);
    }

    if (tab === 'prediction') {
      const period = predictionPeriod[id] ?? '7d';
      const normalized = normalizePredictionLevelForPeriod(period, predictionLevel);
      if (normalized !== predictionLevel) setPredictionLevel(normalized);
      await loadPrediction(stock, id, period, normalized);
    }
  };

  const loadPrediction = async (stock: Stock, id: string, period: PredictionPeriod, level: PredictionLevel = predictionLevel) => {
    const cacheKey = `${id}-${period}-${level}`;
    if (predictionCache[cacheKey]) return;
    const periodDays = PREDICTION_PERIODS.find((p) => p.value === period)?.days ?? 7;
    setLoadingPredictionId(id);
    try {
      const history3y = chartCache[id]?.['3y'] ?? await ensureThreeYearChartLoaded(stock, id);
      const res = await fetch(`${API}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: stock.symbol,
          market: stock.market || 'in',
          stock,
          periodDays,
          predictionLevel: level,
          fundamentals: fundamentalsCache[id] ?? null,
          analysis: analysisCache[id] ?? null,
          history3y: history3y ?? null,
        }),
      });
      const data = await res.json();
      setPredictionCache((c) => ({ ...c, [cacheKey]: data }));
    } catch {
      setPredictionCache((c) => ({ ...c, [cacheKey]: { currentPrice: 0, predictedPrices: [], trend: 'neutral', confidence: 0, summary: '', keyFactors: [], support: null, resistance: null, disclaimer: '', error: 'Prediction failed. Try again.' } }));
    } finally {
      setLoadingPredictionId(null);
    }
  };

  const handlePredictionLevelChange = (stock: Stock, level: PredictionLevel) => {
    const id = `${stock.symbol}-${stock.segment}`;
    const period = predictionPeriod[id] ?? '7d';
    const normalized = normalizePredictionLevelForPeriod(period, level);
    setPredictionLevel(normalized);
    void loadPrediction(stock, id, period, normalized);
  };

  const handlePredictionPeriodChange = (stock: Stock, period: PredictionPeriod) => {
    const id = `${stock.symbol}-${stock.segment}`;
    setPredictionPeriod((p) => ({ ...p, [id]: period }));
    const normalized = normalizePredictionLevelForPeriod(period, predictionLevel);
    if (normalized !== predictionLevel) setPredictionLevel(normalized);
    void loadPrediction(stock, id, period, normalized);
  };

  const handleProceed = async () => {
    setProceedErrorPopup(null);
    const inSegments = segmentsByMarket['in'] || [];

    // Resolve selected stock ids to full stock objects (only user-selected items)
    const selectedStocks: Stock[] = [];
    const pinnedIn = searchPinnedStocks.filter((s) => (s.market || 'in') === 'in');
    for (const id of selectedStockIds) {
      const pinnedHit = pinnedIn.find((s) => `${s.symbol}-${s.segment}` === id);
      if (pinnedHit) {
        selectedStocks.push(pinnedHit);
        continue;
      }
      for (const seg of inSegments) {
        const found = [...(seg.topGainers || []), ...(seg.topLosers || [])].find(
          (s) => `${s.symbol}-${seg.segment}` === id
        );
        if (found) {
          selectedStocks.push(found);
          break;
        }
      }
    }

    const stocksToBuy = await Promise.all(selectedStocks.map(async (s) => {
      let price = s.price;
      let changePercent = s.changePercent;
      if ((price == null || price <= 0) && String(s.segment || '').startsWith('search')) {
        try {
          const marketCode = s.market || 'in';
          const q = await fetch(`${API}/quote/${encodeURIComponent(s.symbol)}?market=${marketCode}`).then((r) => r.json());
          const qp = parsePriceLike(q?.price);
          if (qp > 0) price = qp;
          if (q?.changePercent != null && Number.isFinite(Number(q.changePercent))) changePercent = Number(q.changePercent);
        } catch {
          // keep current values
        }
      }
      return {
        symbol: s.symbol,
        name: s.name,
        price,
        changePercent,
      };
    }));

    setTradeConfirmModal({ stocksToBuy });
    setConfirmCheckedSymbols(new Set(stocksToBuy.map((s) => s.symbol)));
    setBuyQuantityBySymbol(Object.fromEntries(stocksToBuy.map((s) => [s.symbol, 1])));
  };

  const handleCancelTrade = () => {
    setTradeConfirmModal(null);
  };

  const handleConfirmTrade = async () => {
    if (!tradeConfirmModal?.stocksToBuy?.length) return;
    const qty = (s: { symbol: string }) => buyQuantityBySymbol[s.symbol] ?? 1;
    const effectiveChecked = new Set(confirmCheckedSymbols);
    tradeConfirmModal.stocksToBuy.forEach((s) => {
      if (qty(s) === 0) effectiveChecked.delete(s.symbol);
    });
    setConfirmCheckedSymbols(effectiveChecked);
    const toSend = tradeConfirmModal.stocksToBuy
      .filter((s) => effectiveChecked.has(s.symbol) && qty(s) > 0)
      .map((s) => ({ ...s, quantity: Math.max(1, qty(s)) }));
    if (toSend.length === 0) return;
    setAutoTradeLoading(true);
    setTradeResult(null);
    const ts = new Date().toISOString();
    try {
      const res = await fetch(`${API}/auto-trade/run?dryRun=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...kiteHeaders(kiteForm) },
        body: JSON.stringify({
          stocks: toSend,
          apiKey: kiteForm.apiKey,
          apiSecret: kiteForm.secret,
          accessToken: kiteForm.accessToken,
        }),
      });
      let data: { success?: boolean; error?: string; orders?: unknown[] };
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { success: false, error: 'Invalid server response' };
      }
      const orders = Array.isArray(data.orders) ? data.orders : [];
      setTradeResult({
        success: data.success ?? false,
        error: data.error,
        orders,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setTradeResult({ success: false, error: errMsg, orders: [] });
    } finally {
      setAutoTradeLoading(false);
    }
  };

  const handleCloseTradeResult = () => {
    const orders = Array.isArray(tradeResult?.orders) ? tradeResult.orders : [];
    const failed = orders.filter((o) => o?.status === 'FAILED');
    if (failed.length > 0) {
      const ts = new Date().toISOString();
      setFailedOrdersFromTrade((prev) => [
        ...failed.map((o, i) => ({
          order_id: `failed-${o?.symbol ?? 'unknown'}-${ts}-${i}`,
          tradingsymbol: o?.symbol ?? 'unknown',
          name: o?.name ?? '',
          exchange: 'NSE',
          status: 'REJECTED',
          transaction_type: 'BUY',
          quantity: (o as { quantity?: number })?.quantity ?? 1,
          order_timestamp: ts,
          status_message: o?.error || 'Order failed',
        })),
        ...prev,
      ]);
    }
    setOrdersModalTab('orders');
    setHistoryModalOpen(true);
    setOrdersRefreshTrigger((t) => t + 1);
    setTradeConfirmModal(null);
    setTradeResult(null);
  };

  const handleChartPeriodChange = (stock: Stock, period: ChartPeriod) => {
    const id = `${stock.symbol}-${stock.segment}`;
    setPreferredChartPeriod(period); // sticky: new stocks open with same period
    setChartPeriod((p) => ({ ...p, [id]: period }));
    void ensureChartLoadedForPeriod(stock, id, period);
  };

  if (error) {
    return (
      <div className="app">
        <header className="header" />
        <div className="error-banner">Error: {stripErrorUrl(error)}. Make sure the server is running.</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
        <div className="header-title-row">
          <div className="proceed-area">
            <div className="proceed-area-primary">
              <div className="proceed-area-left">
                <button
                  className="proceed-btn"
                  onClick={handleProceed}
                  disabled={autoTradeLoading || tradeConfirmModal !== null || selectedStockIds.size === 0}
                  title="Buy selected stocks via Kite"
                >
                  {autoTradeLoading ? (
                    <span className="refresh-spinner" aria-hidden />
                  ) : (
                    <>
                      Buy
                      {selectedStockIds.size > 0 && (
                        <span className="proceed-badge"> ({selectedStockIds.size})</span>
                      )}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="history-btn"
                  onClick={() => { setHistoryModalOpen(true); setOrdersModalTab('orders'); }}
                  title="View my orders"
                >
                  My Zerodha
                </button>
                <button
                  type="button"
                  className="history-btn"
                  onClick={() => setGoldPageOpen(true)}
                  title="Gold price (Chennai) rates"
                >
                  Gold
                </button>
              </div>
              <div className="header-indices" aria-live="polite">
                {indicesLoading && (
                  <span className="header-indices-placeholder" aria-hidden>
                    …
                  </span>
                )}
                {!indicesLoading && indicesIn && (
                  <>
                    {(['nifty', 'sensex'] as const).map((key) => {
                      const row = indicesIn[key];
                      const label = key === 'nifty' ? 'NIFTY' : 'SENSEX';
                      if (!row || row.price == null) return null;
                      const pts = row.change;
                      const sign = pts > 0 ? '+' : '';
                      const tone = pts > 0 ? 'up' : pts < 0 ? 'down' : 'flat';
                      return (
                        <button
                          key={key}
                          type="button"
                          className="header-index-item header-index-item-link"
                          onClick={() => handleAddIndexToList(key)}
                          title={`Add ${label} to stock list`}
                        >
                          <span className="header-index-label">{label}</span>
                          <span className="header-index-values">
                            <span className="header-index-price">
                              {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(row.price)}
                            </span>
                            <span className={`header-index-points header-index-points--${tone}`}>
                              {sign}
                              {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(pts)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="header-toolbar">
        <div className="header-actions">
            <select
              className="market-picker"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              title="Stock market"
            >
              {MARKET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="segment-dropdown" ref={segmentMenuRef}>
              <button
                type="button"
                className="segment-dropdown-trigger"
                ref={segmentMenuTriggerRef}
                onClick={() => setSegmentMenuOpen((v) => !v)}
                title="Cap category"
                aria-haspopup="menu"
                aria-expanded={segmentMenuOpen}
              >
                {segmentFilter.includes('all')
                  ? 'All Cap'
                  : segmentFilter.length > 0
                    ? `${segmentFilter.length} selected`
                    : 'Select cap type'}
                <span className="segment-dropdown-caret" aria-hidden>▾</span>
              </button>
            </div>
            {segmentMenuOpen && segmentMenuPos
              ? createPortal(
                  <div
                    className="segment-dropdown-menu"
                    ref={segmentMenuPopupRef}
                    role="menu"
                    aria-label="Cap type filter options"
                    style={{
                      position: 'fixed',
                      top: `${segmentMenuPos.top}px`,
                      left: `${segmentMenuPos.left}px`,
                      minWidth: `${segmentMenuPos.minWidth}px`,
                    }}
                  >
                    {SEGMENT_OPTIONS.map((opt) => {
                      const readyMap = segmentReadyByMarket[market] || {};
                      const readySegments = CAP_SEGMENT_VALUES.filter((v) => readyMap[v]);
                      const isAll = opt.value === 'all';
                      const allCapsReady = CAP_SEGMENT_VALUES.every((v) => readyMap[v]);
                      const isReady = isAll ? allCapsReady : !!readyMap[opt.value];
                      const allChecked = readySegments.length > 0 && readySegments.every((v) => segmentFilter.includes(v));
                      const checked = segmentFilter.includes(opt.value);
                      return (
                        <label key={opt.value} className={`segment-checkbox-item ${!isReady ? 'segment-checkbox-item-disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isAll ? allChecked : checked}
                            disabled={!isReady}
                            onChange={(e) => {
                              if (!isReady) return;
                              if (opt.value === 'all') {
                                if (e.target.checked) {
                                  setSegmentFilter(['all', ...readySegments]);
                                } else {
                                  setSegmentFilter([]);
                                }
                                return;
                              }
                              const nextSet = new Set(segmentFilter.filter((v) => v !== 'all'));
                              if (e.target.checked) {
                                nextSet.add(opt.value);
                              } else {
                                nextSet.delete(opt.value);
                              }
                              const allSelected = readySegments.length > 0 && readySegments.every((v) => nextSet.has(v));
                              if (allSelected) {
                                setSegmentFilter(['all', ...readySegments]);
                              } else {
                                setSegmentFilter([...nextSet]);
                              }
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>,
                  document.body
                )
              : null}
            <select
              className="limit-picker"
              value={displayLimit}
              onChange={(e) => setDisplayLimit(Number(e.target.value) as 50 | 100 | 150)}
              title="Show top N from fetched list"
            >
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={150}>Top 150</option>
            </select>
            <button
              className="refresh-btn"
              onClick={() => {
                fetchIndicesIn();
                fetchForMarket('in', true, true).then(() => fetchForMarket('us', true, true));
              }}
              title="Refresh"
            >
              {refreshing ? (
                <span className="refresh-spinner" aria-hidden />
              ) : (
                <span className="refresh-icon">↻</span>
              )}
              <span className="last-fetched">
                {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </button>
            <select
              className="sector-picker"
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              title="Filter by sector (India: PSU = public-sector heuristic)"
            >
              <option value="all">All sectors</option>
              {market === 'in' ? (
                <option value="__psu__">PSU</option>
              ) : null}
              {sectorOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === '__none__' ? 'Others' : opt}
                </option>
              ))}
            </select>
            <select
              className={`sort-picker sort-${sortOrder}`}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              title="Sort by profit, loss, best rank, or best price"
            >
              <option value="desc">Profit</option>
              <option value="asc">Loss</option>
              <option value="best">Best</option>
              <option value="bestprice">Best Price</option>
            </select>
            <button
              type="button"
              className="history-btn header-toolbar-search-btn"
              onClick={() => setStockSearchOpen((v) => !v)}
              title="Search stocks by common name"
              aria-label="Search stocks"
            >
              🔍
            </button>
        </div>
        </div>
        <StockSearchPanel
          open={stockSearchOpen}
          onSelect={handleSearchSelect}
          onClose={() => {
            setStockSearchOpen(false);
          }}
          onRemoteSearch={handleRemoteSearch}
        />
        </div>
      </header>

      {proceedErrorPopup && (
        <div className="auto-trade-result" role="dialog" aria-label="Buy error">
          <div className="auto-trade-result-inner">
            <div className="auto-trade-result-header">
              <h3>Error</h3>
              <button className="auto-trade-close" onClick={() => setProceedErrorPopup(null)} aria-label="Close">×</button>
            </div>
            <p className="auto-trade-error">{proceedErrorPopup ? stripErrorUrl(proceedErrorPopup) : ''}</p>
          </div>
        </div>
      )}

      {tradeConfirmModal && (
        <div className="auto-trade-result" role="dialog" aria-label="Confirm trade">
          <div className="auto-trade-result-inner trade-confirm-modal">
            <div className="auto-trade-result-header">
              <h3>{tradeResult ? (tradeResult.success ? 'Order placed' : 'Order failed') : 'Confirm trade'}</h3>
              <button type="button" className="auto-trade-close" onClick={(e) => { e.preventDefault(); (tradeResult ? handleCloseTradeResult : handleCancelTrade)(); }} aria-label="Close">×</button>
            </div>
            {tradeResult ? (
              <div className="trade-result-content">
                {tradeResult.success ? (
                  <>
                    <p className="trade-result-msg success">Order placed successfully.</p>
                    {tradeResult.orders && tradeResult.orders.length > 0 && (
                      <ul className="trade-result-orders">
                        {tradeResult.orders.map((o, j) => (
                          <li key={j} className={o?.status === 'PLACED' ? 'placed' : o?.status === 'FAILED' ? 'failed' : ''}>
                            <span className="symbol">{o?.symbol ?? '—'}</span>
                            {o?.name && <span className="name">{o.name}</span>}
                            <span className="status">{o?.status ?? ''}</span>
                            {o?.orderId && <span className="order-id">#{o.orderId}</span>}
                            {o?.error && <span className="error">{stripErrorUrl(o.error)}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <p className="trade-result-msg error">{tradeResult.error ? stripErrorUrl(tradeResult.error) : ''}</p>
                    {tradeResult.orders && tradeResult.orders.length > 0 && (
                      <ul className="trade-result-orders">
                        {tradeResult.orders.map((o, j) => (
                          <li key={j} className="failed">
                            <span className="symbol">{o?.symbol ?? '—'}</span>
                            {o?.name && <span className="name">{o.name}</span>}
                            <span className="status">{o?.status ?? ''}</span>
                            {o?.error && <span className="error">{stripErrorUrl(o.error)}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <button type="button" className="proceed-btn" onClick={(e) => { e.preventDefault(); handleCloseTradeResult(); }} style={{ marginTop: '1rem', width: '100%' }}>
                  {tradeResult?.success ? 'View Orders' : 'Done'}
                </button>
              </div>
            ) : (
              <>
                <p className="trade-confirm-desc">Stocks to buy (uncheck to exclude from order):</p>
                {tradeConfirmModal.stocksToBuy.length === 0 ? (
                  <p className="trade-confirm-empty">No stocks to trade. Select stocks or refresh the list.</p>
                ) : (
                  <>
                    <ul className="trade-confirm-list">
                      {tradeConfirmModal.stocksToBuy.map((s, i) => (
                        <li key={i} className="trade-confirm-item">
                          <input
                            type="checkbox"
                            className="trade-confirm-cb"
                            checked={confirmCheckedSymbols.has(s.symbol)}
                            onChange={() => {
                              setConfirmCheckedSymbols((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.symbol)) next.delete(s.symbol);
                                else next.add(s.symbol);
                                return next;
                              });
                            }}
                            aria-label={`Include ${s.symbol} in order`}
                          />
                          <span className="symbol">{s.symbol}</span>
                          {s.name && <span className="name">{s.name}</span>}
                          <span className="trade-confirm-qty-wrap">
                            <input
                              type="number"
                              min={0}
                              max={9999}
                              step={1}
                              value={buyQuantityBySymbol[s.symbol] ?? 1}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '') {
                                  setBuyQuantityBySymbol((prev) => ({ ...prev, [s.symbol]: 0 }));
                                } else {
                                  const n = parseInt(v, 10);
                                  if (!isNaN(n)) {
                                    const clamped = Math.max(0, Math.min(9999, n));
                                    setBuyQuantityBySymbol((prev) => ({ ...prev, [s.symbol]: clamped }));
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v === '') {
                                  setBuyQuantityBySymbol((prev) => ({ ...prev, [s.symbol]: 0 }));
                                } else {
                                  const n = parseInt(v, 10);
                                  const clamped = !isNaN(n) ? Math.max(0, Math.min(9999, n)) : 0;
                                  setBuyQuantityBySymbol((prev) => ({ ...prev, [s.symbol]: clamped }));
                                }
                              }}
                              className="trade-confirm-qty-input"
                              aria-label={`Quantity for ${s.symbol}`}
                            />
                          </span>
                          <span className="price">₹{s.price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                          {s.changePercent != null && (
                            <span className="change down">{s.changePercent.toFixed(2)}%</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="trade-confirm-actions">
                      <button type="button" className="trade-cancel-btn" onClick={handleCancelTrade} disabled={autoTradeLoading}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="proceed-btn"
                        onClick={(e) => { e.preventDefault(); handleConfirmTrade(); }}
                        disabled={autoTradeLoading || confirmCheckedSymbols.size === 0}
                      >
                        {autoTradeLoading ? <span className="refresh-spinner" aria-hidden /> : 'Buy'}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {historyModalOpen && (
        <div className="auto-trade-result" role="dialog" aria-label="My Zerodha">
          <div className="auto-trade-result-inner trade-confirm-modal">
            <div className="auto-trade-result-header orders-header-with-tabs">
              <div className="orders-modal-tabs">
                <button
                  type="button"
                  className={`orders-tab-btn ${ordersModalTab === 'orders' ? 'active' : ''}`}
                  onClick={() => setOrdersModalTab('orders')}
                >
                  My Zerodha
                </button>
                <button
                  type="button"
                  className={`orders-tab-btn ${ordersModalTab === 'portfolio' ? 'active' : ''}`}
                  onClick={() => setOrdersModalTab('portfolio')}
                >
                  Portfolio
                </button>
                <button
                  type="button"
                  className={`orders-tab-btn ${ordersModalTab === 'analyse' ? 'active' : ''}`}
                  onClick={() => setOrdersModalTab('analyse')}
                >
                  Analyse
                </button>
                <button
                  type="button"
                  className={`orders-tab-btn ${ordersModalTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setOrdersModalTab('settings')}
                >
                  Settings
                </button>
              </div>
              <button className="auto-trade-close" onClick={() => setHistoryModalOpen(false)} aria-label="Close">×</button>
            </div>
            <div className={`history-modal-content ${ordersModalTab === 'analyse' && portfolioAnalysis ? 'history-modal-content-no-scroll' : ''}`}>
              {ordersModalTab === 'analyse' ? (
                <div className="analyse-tab-wrapper portfolio-tab-wrapper">
                  <div className="analyse-source-bar">
                    {kiteConfigured && (
                      <div className="analyse-source-tabs">
                        <button
                          type="button"
                          className={`analyse-source-tab ${analyseSource === 'kite' ? 'active' : ''}`}
                          onClick={() => { setAnalyseSource('kite'); setXlsxUploadError(null); }}
                        >
                          Kite Portfolio
                        </button>
                        <button
                          type="button"
                          className={`analyse-source-tab ${analyseSource === 'xlsx' ? 'active' : ''}`}
                          onClick={() => { setAnalyseSource('xlsx'); setPortfolioAnalysisError(null); }}
                        >
                          Upload XLSX
                        </button>
                      </div>
                    )}
                    {(analyseSource === 'xlsx' || !kiteConfigured) && (
                      <div className="analyse-xlsx-upload-wrap">
                        <p className="analyse-xlsx-privacy">Zerodha Kite Console holdings XLSX. Stays in this tab only — no storage.</p>
                        <div className="analyse-xlsx-upload">
                          <input
                            ref={xlsxInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="analyse-xlsx-input"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              setXlsxUploadError(null);
                              setXlsxFileName(file.name);
                              try {
                                const parsed = await parsePortfolioXlsx(file);
                                setXlsxHoldings(parsed);
                                if (parsed.length === 0) setXlsxUploadError('No valid rows found. Need Symbol and Quantity columns.');
                              } catch (err) {
                                setXlsxUploadError((err as Error).message);
                                setXlsxHoldings([]);
                              }
                            }}
                            aria-label="Upload portfolio XLSX"
                          />
                          <button
                            type="button"
                            className="analyse-xlsx-btn"
                            onClick={() => xlsxInputRef.current?.click()}
                          >
                            {xlsxFileName ? `📄 ${xlsxFileName}` : 'Choose portfolio XLSX'}
                          </button>
                          {xlsxHoldings.length > 0 && (
                            <>
                              <span className="analyse-xlsx-count">{xlsxHoldings.length} holdings</span>
                              <button
                                type="button"
                                className="analyse-xlsx-clear"
                                onClick={() => { setXlsxHoldings([]); setXlsxFileName(null); setPortfolioAnalysis(null); setPortfolioAnalysisError(null); }}
                                title="Clear uploaded data"
                              >
                                Clear
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {kiteConfigured && analyseSource === 'kite' && kiteHoldingsLoading && !kiteHoldingsError ? (
                    <p className="orders-empty-msg">Loading portfolio...</p>
                  ) : kiteConfigured && analyseSource === 'kite' && kiteHoldingsError ? (
                    <div className="orders-error-msg">
                      <p>{stripErrorUrl(kiteHoldingsError)}</p>
                      <button
                        type="button"
                        className="history-btn"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => { setOrdersModalTab('settings'); setHistoryModalOpen(true); }}
                      >
                        Configure
                      </button>
                    </div>
                  ) : kiteConfigured && analyseSource === 'kite' && kiteHoldings.length === 0 ? (
                    <p className="orders-empty-msg">No data</p>
                  ) : (analyseSource === 'xlsx' || !kiteConfigured) && xlsxUploadError ? (
                    <div className="orders-error-msg">
                      <p>{stripErrorUrl(xlsxUploadError)}</p>
                    </div>
                  ) : (analyseSource === 'xlsx' || !kiteConfigured) && xlsxHoldings.length === 0 ? (
                    <p className="orders-empty-msg">No data</p>
                  ) : portfolioAnalysisLoading ? (
                    <div className="analyse-loading">
                      <span className="analyse-loading-spinner" aria-hidden />
                      <p>Analyzing portfolio with AI...</p>
                      <span className="analyse-loading-hint">This may take 15–30 seconds</span>
                    </div>
                  ) : portfolioAnalysisError ? (
                    <div className="orders-error-msg">
                      <p>{stripErrorUrl(portfolioAnalysisError)}</p>
                      {kiteConfigured && (
                        <button
                          type="button"
                          className="history-btn"
                          onClick={() => { setOrdersModalTab('settings'); setHistoryModalOpen(true); }}
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  ) : portfolioAnalysis ? (
                    <>
                      <div className="analyse-summary-bar">
                        {(() => {
                          const h = holdingsForAnalysis;
                          const invested = h.reduce((s, x) => s + (x.quantity * (x.average_price ?? 0)), 0);
                          const value = h.reduce((s, x) => s + (x.quantity * (x.last_price ?? 0)), 0);
                          const pnl = h.reduce((s, x) => s + (x.pnl ?? (x.quantity * ((x.last_price ?? 0) - (x.average_price ?? 0)))), 0);
                          return (
                            <>
                              <span className="analyse-summary-item">
                                <span className="analyse-summary-label">Invested</span>
                                <span className="analyse-summary-value">₹{invested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                              </span>
                              <span className="analyse-summary-item">
                                <span className="analyse-summary-label">Current</span>
                                <span className="analyse-summary-value">₹{value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                              </span>
                              <span className={`analyse-summary-item analyse-summary-pnl ${pnl >= 0 ? 'pnl-up' : 'pnl-down'}`}>
                                <span className="analyse-summary-label">P&L</span>
                                <span className="analyse-summary-value">{pnl >= 0 ? '+' : ''}₹{pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <div className="analyse-report-scroll-wrap">
                        <div className="portfolio-scroll portfolio-analysis-content portfolio-overview-scroll">
                          <button
                            type="button"
                            className="analyse-action-btn portfolio-overview-fullscreen"
                            onClick={() => setReportFullscreen(true)}
                            title="Full screen"
                            aria-label="Full screen"
                          >
                            ⛶
                          </button>
                        <div className="portfolio-analysis-card">
                          <div className="portfolio-analysis-body">
                            <div className="portfolio-analysis-markdown">
                              <ReactMarkdown>{portfolioAnalysis}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                        <details className="portfolio-analysis-prompt-details">
                          <summary>View analysis prompt</summary>
                          <p className="portfolio-analysis-prompt-text">
                            You are an experienced equity analyst and portfolio strategist at Morgan Stanley. Get my Zerodha portfolio from portfolio tab in myOrders. Please perform a detailed analysis of my holdings, including sector allocation, stock concentration, risk exposure, and historical performance trends. Compare my portfolio composition with standard benchmarks such as Nifty 50 and Sensex. Identify strengths, weaknesses, and diversification gaps. Then, provide actionable insights on how much additional capital should be invested for long‑term wealth creation (10–15 years horizon), considering risk tolerance, compounding potential, and market cycles. Present your analysis in a structured format with clear recommendations, including suggested allocation percentages across equity, debt, and other asset classes.
                          </p>
                        </details>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : ordersModalTab === 'portfolio' ? (
                <div className="portfolio-tab-wrapper">
                  {!kiteHoldingsLoading && !kiteHoldingsError && kiteHoldings.length > 0 && (
                    <>
                      <div className="analyse-summary-bar">
                        <span className="analyse-summary-item">
                          <span className="analyse-summary-label">Invested</span>
                          <span className="analyse-summary-value">
                            ₹{portfolioKiteSummary.invested.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </span>
                        <span className="analyse-summary-item">
                          <span className="analyse-summary-label">Current</span>
                          <span className="analyse-summary-value">
                            ₹{portfolioKiteSummary.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </span>
                        <span
                          className={`analyse-summary-item analyse-summary-pnl ${portfolioKiteSummary.pnl >= 0 ? 'pnl-up' : 'pnl-down'}`}
                        >
                          <span className="analyse-summary-label">P&L</span>
                          <span className="analyse-summary-value">
                            {portfolioKiteSummary.pnl >= 0 ? '+' : ''}
                            ₹{portfolioKiteSummary.pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                  <div className="portfolio-scroll">
                  {kiteHoldingsLoading && !kiteHoldingsError ? (
                    <p className="orders-empty-msg">Loading portfolio...</p>
                  ) : kiteHoldingsError ? (
                    <div className="orders-error-msg">
                      <p>{stripErrorUrl(kiteHoldingsError)}</p>
                      <button
                        type="button"
                        className="history-btn"
                        onClick={() => { setOrdersModalTab('settings'); setHistoryModalOpen(true); }}
                      >
                        Configure
                      </button>
                    </div>
                  ) : kiteHoldings.length === 0 ? (
                    <p className="orders-empty-msg">No holdings in your Kite portfolio.</p>
                  ) : (
                    <>
                      <div className="portfolio-select-all-toolbar">
                        <label className="portfolio-select-all-label">
                          <input
                            ref={portfolioSelectAllRef}
                            type="checkbox"
                            className="stock-select-cb"
                            checked={
                              kiteHoldings.length > 0 &&
                              portfolioKiteSummary.selectedCount === kiteHoldings.length
                            }
                            onChange={(e) => {
                              const on = e.target.checked;
                              setPortfolioSelectionIds(on ? new Set(kiteHoldings.map(kiteHoldingKey)) : new Set());
                            }}
                          />
                          <span>
                            Select all ({portfolioKiteSummary.selectedCount} of {kiteHoldings.length})
                          </span>
                        </label>
                      </div>
                      <ul className="proceed-history-list kite-holdings-list">
                      {kiteHoldings.map((h) => {
                        const hk = kiteHoldingKey(h);
                        return (
                        <li key={hk} className="holding-item">
                          <input
                            type="checkbox"
                            className="stock-select-cb"
                            checked={portfolioSelectionIds.has(hk)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPortfolioSelectionIds((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(hk);
                                else next.delete(hk);
                                return next;
                              });
                            }}
                            aria-label={`Include ${h.tradingsymbol} in portfolio totals`}
                          />
                          <div className="holding-item-text">
                          <div className="holding-line1">
                            <span className="symbol">{h.tradingsymbol}</span>
                            <span className="exchange">{h.exchange}</span>
                            <span className="qty">Qty {h.quantity}</span>
                            {bestSaleBySymbol[h.tradingsymbol]?.isBestSale && (
                              <span
                                className="best-sale-tag"
                                title={`Best Sale score ${bestSaleBySymbol[h.tradingsymbol]?.score}: ${bestSaleBySymbol[h.tradingsymbol]?.reason}`}
                              >
                                Best Sale
                              </span>
                            )}
                          </div>
                          <div className="holding-line2">
                            <span className="price">Avg ₹{h.average_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            <span className="price">LTP ₹{h.last_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            {h.pnl != null && (
                              <span className={h.pnl >= 0 ? 'pnl-up' : 'pnl-down'}>
                                P&L ₹{h.pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            )}
                            {h.day_change_percentage != null && (
                              <span className={h.day_change_percentage >= 0 ? 'pnl-up' : 'pnl-down'}>
                                {h.day_change_percentage >= 0 ? '+' : ''}{h.day_change_percentage.toFixed(2)}%
                              </span>
                            )}
                          </div>
                          </div>
                        </li>
                        );
                      })}
                    </ul>
                    </>
                  )}
                  </div>
                </div>
              ) : ordersModalTab === 'settings' ? (
                <div className="orders-tab-wrapper settings-tab-content">
                  <div className="settings-content">
                    <div className="settings-hint-row">
                      <p className="settings-hint">We keep these credentials in memory until you close the tab — no storage.</p>
                      <button
                        type="button"
                        className="settings-clear-creds"
                        onClick={() => setKiteForm({ apiKey: '', secret: '', accessToken: '', requestToken: '' })}
                      >
                        Clear credentials
                      </button>
                    </div>
                    <div className="settings-kite-login-section">
                      <h3 className="settings-kite-login-title">Sign in with Kite</h3>
                      <p className="settings-kite-login-desc">Get API Key and Secret Key from your app at <a href="https://developers.kite.trade/login" target="_blank" rel="noopener noreferrer">kite.trade</a>.</p>
                      <div className="settings-field">
                        <label>API Key (from kite.trade)</label>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="Your app API key"
                          value={kiteForm.apiKey}
                          onChange={(e) => setKiteForm((f) => ({ ...f, apiKey: e.target.value }))}
                          autoComplete="off"
                        />
                      </div>
                      <div className="settings-field">
                        <label>Secret Key (from kite.trade)</label>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="Your app secret key"
                          value={kiteForm.secret}
                          onChange={(e) => setKiteForm((f) => ({ ...f, secret: e.target.value }))}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    {kiteForm.apiKey && kiteForm.secret && (
                    <div className="settings-signin-group" ref={settingsSigninGroupRef}>
                      <h3 className="settings-kite-login-title">Sign in with Zerodha</h3>
                      <p className="settings-kite-login-hint">Sign in with Zerodha. After login, you will be redirected back and the access token will be generated automatically. Set your Kite app&apos;s redirect URL to this app (e.g. <code>{window.location.origin}</code>).</p>
                      <button
                        type="button"
                        className="settings-kite-login-btn"
                        onClick={() => {
                          const url = `https://kite.zerodha.com/connect/login?api_key=${kiteForm.apiKey}&v=3`;
                          window.open(url, 'kite-login', 'width=500,height=600,scrollbars=yes');
                        }}
                      >
                        Sign in with Zerodha
                      </button>
                      <div className="settings-request-token-inner">
                        <label>Request Token → Generate Access Token</label>
                        <p className="settings-hint" style={{ margin: '0 0 0.5rem' }}>
                          Paste the <code>request_token</code> from the sign-in redirect URL, then click Generate.
                        </p>
                        <div className="settings-input-with-btn-row">
                          <input
                            type="text"
                            className="settings-input"
                            placeholder="Enter request token"
                            value={kiteForm.requestToken}
                            onChange={(e) => setKiteForm((f) => ({ ...f, requestToken: e.target.value }))}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="settings-generate-btn"
                            onClick={async () => {
                              if (!kiteForm.requestToken.trim()) return;
                              if (!kiteForm.apiKey || !kiteForm.secret) {
                                setKiteError('Enter API Key and Secret Key first.');
                                return;
                              }
                              setKiteError(null);
                              setKiteGenerateResult(null);
                              setKiteGenerateLoading(true);
                              try {
                                const data = await fetchJson<{ success?: boolean; error?: string; accessToken?: string }>(`${API}/settings/kite/generate-token`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', ...kiteHeaders(kiteForm) },
                                  body: JSON.stringify({
                                    requestToken: kiteForm.requestToken.trim(),
                                    apiKey: kiteForm.apiKey,
                                    apiSecret: kiteForm.secret,
                                  }),
                                });
                                if (data.error) throw new Error(data.error);
                                setKiteForm((f) => ({ ...f, accessToken: data.accessToken || '', requestToken: '' }));
                                setKiteGenerateResult({ success: true, accessToken: data.accessToken });
                              } catch (e) {
                                setKiteGenerateResult({ success: false, error: (e as Error).message });
                              } finally {
                                setKiteGenerateLoading(false);
                              }
                            }}
                            disabled={kiteGenerateLoading || !kiteForm.requestToken.trim()}
                            title="Generate access token"
                            aria-label="Generate access token"
                          >
                            {kiteGenerateLoading ? (
                              <span className="settings-icon-spinner" aria-hidden />
                            ) : (
                              'Generate'
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="settings-access-token-inner" ref={settingsAccessTokenRef}>
                          <label>Access Token</label>
                          <div className="settings-input-with-btn-row">
                            <input
                              type="text"
                              className="settings-input"
                              placeholder="Paste access token or click Generate"
                              value={kiteForm.accessToken}
                              onChange={(e) => {
                                setKiteForm((f) => ({ ...f, accessToken: e.target.value }));
                                setKiteInvalidateError(null);
                              }}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="settings-invalidate-btn"
                              onClick={async () => {
                                const accessToken = kiteForm.accessToken.trim();
                                if (!accessToken) return;
                                if (!kiteForm.apiKey) {
                                  setKiteInvalidateError('API Key required to invalidate token.');
                                  return;
                                }
                                setKiteInvalidateError(null);
                                setKiteInvalidateLoading(true);
                                try {
                                  const data = await fetchJson<{ success?: boolean; error?: string }>(`${API}/settings/kite/invalidate-token`, {
                                    method: 'DELETE',
                                    headers: kiteHeaders({ ...kiteForm, accessToken }),
                                  });
                                  if (data.error) throw new Error(data.error);
                                  setKiteForm((f) => ({ ...f, accessToken: '' }));
                                  setKiteGenerateResult(null);
                                } catch (e) {
                                  setKiteInvalidateError((e as Error).message);
                                } finally {
                                  setKiteInvalidateLoading(false);
                                }
                              }}
                              disabled={!kiteForm.accessToken.trim() || kiteInvalidateLoading}
                              title="Invalidate access token via Kite API (security)"
                            >
                              {kiteInvalidateLoading ? (
                                <span className="settings-icon-spinner" aria-hidden />
                              ) : (
                                'Invalidate'
                              )}
                            </button>
                          </div>
                          {kiteInvalidateError && (
                            <p className="settings-field-error">{stripErrorUrl(kiteInvalidateError)}</p>
                          )}
                        </div>
                      {kiteGenerateResult && (
                        <div className="settings-generate-result" style={{ marginTop: '1rem' }}>
                          <h4 className="settings-generate-result-title">
                            {kiteGenerateResult.success ? 'Access Token' : 'Error'}
                          </h4>
                          {kiteGenerateResult.success ? (
                            <p className="settings-generate-success">
                              Token generated. Valid until market close. Regenerate daily.
                            </p>
                          ) : (
                            <p className="settings-generate-error">{kiteGenerateResult.error ? stripErrorUrl(kiteGenerateResult.error) : ''}</p>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                    {kiteError && <p className="settings-error">{stripErrorUrl(kiteError)}</p>}
                  </div>
                </div>
              ) : (
                <div className="orders-tab-wrapper">
                  {kiteOrdersLoading ? (
                    <p className="orders-empty-msg">Loading orders...</p>
                  ) : kiteOrdersError && failedOrdersFromTrade.length === 0 ? (
                    <div className="orders-error-msg">
                      <p>{stripErrorUrl(kiteOrdersError)}</p>
                      {kiteConfigured ? (
                        <button
                          type="button"
                          className="history-btn"
                          onClick={() => setOrdersRefreshTrigger((t) => t + 1)}
                        >
                          Retry
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="history-btn"
                          onClick={() => { setOrdersModalTab('settings'); setHistoryModalOpen(true); }}
                        >
                          Configure
                        </button>
                      )}
                    </div>
                  ) : kiteOrders.length === 0 && failedOrdersFromTrade.length === 0 ? (
                    <p className="orders-empty-msg">No orders from Kite. Orders shown are for today only.</p>
                  ) : (
                    <>
                    <ul className="proceed-history-list kite-orders-list">
                      {[...failedOrdersFromTrade, ...kiteOrders]
                        .sort((a, b) => (b.order_timestamp || '').localeCompare(a.order_timestamp || ''))
                        .map((o) => {
                          const avgPrice = 'average_price' in o ? o.average_price : undefined;
                          return (
                        <li key={o.order_id} className={o.status === 'COMPLETE' ? 'success' : o.status === 'REJECTED' || o.status === 'CANCELLED' ? 'error' : ''}>
                          <div className="order-line1">
                            <span className="symbol">{o.tradingsymbol}</span>
                          </div>
                          <div className={`order-line2 ${o.status === 'COMPLETE' ? 'placed' : o.status === 'REJECTED' || o.status === 'CANCELLED' ? 'failed' : ''}`}>
                            {o.name && <span className="name">{o.name}</span>}
                            <span className="exchange">({o.exchange})</span>
                            <span className="status">{o.status}</span>
                            <span className={`txn-type txn-${(o.transaction_type || '').toLowerCase()}`}>{o.transaction_type || '—'}</span>
                            <span className="qty">Qty: {o.quantity}</span>
                            {avgPrice != null && avgPrice > 0 && (
                              <span className="price">₹{avgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                            )}
                          </div>
                          {(o.status === 'REJECTED' || o.status === 'CANCELLED') && (
                            <div className="order-line-error">
                              {stripErrorUrl(o.status_message || (o as { status_message_raw?: string }).status_message_raw || 'Order failed')}
                            </div>
                          )}
                          <span className="history-time">{o.order_timestamp ? new Date(o.order_timestamp).toLocaleString('en-IN') : ''}</span>
                        </li>
                          );
                      })}
                    </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {goldPageOpen && (
        <div className="auto-trade-result" role="dialog" aria-label="Gold price (Chennai) rates">
          <div className="auto-trade-result-inner trade-confirm-modal gold-page-modal">
            <div className="auto-trade-result-header">
              <h3>Gold price (Chennai)</h3>
              <button type="button" className="auto-trade-close" onClick={() => setGoldPageOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="history-modal-content gold-modal-content">
              {goldLoading && (
                <div className="gold-loading">
                  <span className="refresh-spinner" aria-hidden />
                  <span>Loading gold rates…</span>
                </div>
              )}
              {!goldLoading && goldError && <p className="auto-trade-error">{goldError}</p>}
              {!goldLoading && !goldError && goldPayload && (
                <>
                  {goldPayload.goodreturns?.ok && (
                    <section className="gold-section gold-today-section" aria-label="Goodreturns Chennai gold rates">
                      {(() => {
                        const line = goodreturnsPageTitleWithoutTrailingDate(goldPayload.goodreturns.pageTitle);
                        return line ? <p className="gold-page-title-line">{line}</p> : null;
                      })()}
                      <div className="gold-today-grid">
                        <div className="gold-today-card">
                          <div className="gold-today-label">24K gold / g</div>
                          <div className="gold-today-value">{fmtGoldInr(goldPayload.goodreturns.gold24kPerGram)}</div>
                          {(() => {
                            const ch = fmtGoldChangeInr(goldPayload.goodreturns.change24kInr);
                            if (!ch) return null;
                            return (
                              <div className={`gold-today-change ${(goldPayload.goodreturns.change24kInr ?? 0) >= 0 ? 'gold-today-change-up' : 'gold-today-change-down'}`}>
                                {ch} vs prior day
                              </div>
                            );
                          })()}
                        </div>
                        <div className="gold-today-card">
                          <div className="gold-today-label">22K gold / g</div>
                          <div className="gold-today-value">{fmtGoldInr(goldPayload.goodreturns.gold22kPerGram)}</div>
                          {(() => {
                            const ch = fmtGoldChangeInr(goldPayload.goodreturns.change22kInr);
                            if (!ch) return null;
                            return (
                              <div className={`gold-today-change ${(goldPayload.goodreturns.change22kInr ?? 0) >= 0 ? 'gold-today-change-up' : 'gold-today-change-down'}`}>
                                {ch} vs prior day
                              </div>
                            );
                          })()}
                        </div>
                        <div className="gold-today-card">
                          <div className="gold-today-label">18K gold / g</div>
                          <div className="gold-today-value">{fmtGoldInr(goldPayload.goodreturns.gold18kPerGram)}</div>
                          {(() => {
                            const ch = fmtGoldChangeInr(goldPayload.goodreturns.change18kInr);
                            if (!ch) return null;
                            return (
                              <div className={`gold-today-change ${(goldPayload.goodreturns.change18kInr ?? 0) >= 0 ? 'gold-today-change-up' : 'gold-today-change-down'}`}>
                                {ch} vs prior day
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      {goldPayload.goodreturns.lastTenDaysOneGram &&
                        goldPayload.goodreturns.lastTenDaysOneGram.length > 0 && (
                        <section className="gold-section gold-section-last-ten" aria-label="Last 10 days Chennai gold 1 gram">
                          <h4 className="gold-section-title">Gold Rate in Chennai for Last 10 Days (1 gram)</h4>
                          <div className="gold-table-wrap">
                            <table className="gold-table">
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>24K</th>
                                  <th>22K</th>
                                </tr>
                              </thead>
                              <tbody>
                                {goldPayload.goodreturns.lastTenDaysOneGram.map((row, i) => (
                                  <tr key={`${row.dateLabel}-${i}`}>
                                    <td>{row.dateLabel}</td>
                                    <td>
                                      <GoodreturnsLastTenRateCell value={row.rate24k} />
                                    </td>
                                    <td>
                                      <GoodreturnsLastTenRateCell value={row.rate22k} />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      )}
                    </section>
                  )}
                  {!goldLoading && goldPayload.goodreturns && !goldPayload.goodreturns.ok && (
                    <p className="gold-source">
                      Goodreturns Chennai rates unavailable ({goldPayload.goodreturns.error ?? 'unknown'}).{' '}
                      <a
                        href="https://www.goodreturns.in/gold-rates/chennai.html"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open page
                      </a>
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {reportFullscreen && portfolioAnalysis && (
        <div className="report-fullscreen-overlay" role="dialog" aria-label="Portfolio Overview full screen">
          <div className="report-fullscreen-header">
            <span className="report-fullscreen-title">Portfolio Overview</span>
            <button type="button" className="analyse-action-btn" onClick={() => setReportFullscreen(false)} title="Exit full screen" aria-label="Exit full screen">✕</button>
          </div>
          <div className="report-fullscreen-content">
            <div className="portfolio-analysis-card">
              <div className="portfolio-analysis-body">
                <div className="portfolio-analysis-markdown">
                  <ReactMarkdown>{portfolioAnalysis}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {loading && segments.length === 0 ? (
          <div className="loading-stocks-center">
            <span className="refresh-spinner" aria-hidden />
            <span>Loading stocks…</span>
          </div>
        ) : !segmentFilter || segmentFilter.length === 0 ? (
          <div className="select-category-placeholder">
            Select a cap category from the dropdown to view stocks
          </div>
        ) : (
          <StockListSection
            stocks={stocks}
            activeStockId={activeStockId}
            activeTab={activeTab}
            onStockTap={handleStockTap}
            onTabClick={handleTabClick}
            analysisCache={analysisCache}
            loadingAnalysisId={loadingAnalysisId}
            fundamentalsCache={fundamentalsCache}
            loadingFundamentalsId={loadingFundamentalsId}
            quarterlyProfitCache={quarterlyProfitCache}
            loadingQuarterlyProfitId={loadingQuarterlyProfitId}
            stockInfoCache={stockInfoCache}
            loadingStockInfoId={loadingStockInfoId}
            financialsReportCache={financialsReportCache}
            loadingFinancialsReportId={loadingFinancialsReportId}
            onRequestFinancialsLoad={(stock, id) => void loadFinancialsForStock(stock, id)}
            chartCache={chartCache}
            chartPeriod={chartPeriod}
            onChartPeriodChange={handleChartPeriodChange}
            loadingChartId={loadingChartId}
            selectedStockIds={selectedStockIds}
            onSelectStock={handleSelectStock}
            showSelect
            onClearSearchItem={handleClearSearchPinnedItem}
            highlightedSearchId={highlightedSearchId}
            financialsOpenId={financialsOpenId}
            onFinancialsOpenChange={setFinancialsOpenId}
            predictionCache={predictionCache}
            loadingPredictionId={loadingPredictionId}
            predictionPeriod={predictionPeriod}
            predictionLevel={predictionLevel}
            onPredictionPeriodChange={handlePredictionPeriodChange}
            onPredictionLevelChange={handlePredictionLevelChange}
            defaultChartPeriod={preferredChartPeriod}
            fundamentalsSubTab={preferredFundamentalsSubTab}
            onFundamentalsSubTabChange={setPreferredFundamentalsSubTab}
          />
        )}
      </main>
    </div>
  );
}
