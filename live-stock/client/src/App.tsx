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
  { value: 'flexi', label: 'Flexi Cap' },
] as const;

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

type TabType = 'fundamentals' | 'chart' | 'proscons';

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

const MAX_CHART_BARS = 120;

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
}) {
  const isUp = (stock.changePercent ?? 0) >= 0;
  const currency = stock.market === 'us' ? '$' : '₹';
  const history = chartData ?? stock.history ?? [];
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; close: number } | null>(null);
  const [financialsOpenId, setFinancialsOpenId] = useState<FinancialsSectionId | null>('analysis');
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const toggleFinancials = (id: FinancialsSectionId) => {
    setFinancialsOpenId((prev) => (prev === id ? null : id));
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
                      <span className="fund-label">Day Range</span>
                      <span className="fund-value">{fundamentals.dayLow != null && fundamentals.dayHigh != null ? `${fundamentals.dayLow} - ${fundamentals.dayHigh}` : '—'}</span>
                    </div>
                    <div className="fund-row">
                      <span className="fund-label">52W High</span>
                      <span className="fund-value">{fundamentals.fiftyTwoWeekHigh ?? '—'}</span>
                    </div>
                  </div>
                </div>
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
                    const min = Math.min(...displayData.map((h) => h.close));
                    const max = Math.max(...displayData.map((h) => h.close));
                    const range = max - min || 1;
                    const chartH = 100;
                    return (
                      <>
                        <div className="mini-chart-wrapper">
                          <div className="mini-chart">
                            {displayData.map((p, i) => (
                              <div
                                key={i}
                                className="chart-bar"
                                style={{
                                  height: `${((p.close - min) / range) * chartH}px`,
                                  minHeight: 2,
                                }}
                                onMouseEnter={() => setHoveredPoint(p)}
                                onMouseLeave={() => setHoveredPoint(null)}
                                title={`${new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ${currency}${p.close?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              >
                                {hoveredPoint === p && (
                                  <div className="chart-tooltip">
                                    {new Date(p.date).toLocaleDateString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                    <br />
                                    <strong>{currency}{p.close?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
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
          const period = chartPeriod[id] ?? '1y';
          const chartDataForPeriod = chartCache[id]?.[period] ?? null;
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
            />
          );
        })}
      </div>
    </section>
  );
}

export default function App() {
  const [segmentsByMarket, setSegmentsByMarket] = useState<Record<string, SegmentData[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
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
  const [loadingChartId, setLoadingChartId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [market, setMarket] = useState<string>('in');
  const [displayLimit, setDisplayLimit] = useState<50 | 100 | 150>(150);
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  /** `__none__` = stocks with no sector label */
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
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

  const fetchForMarket = useCallback((m: string, forceRefresh = false, silent = false) => {
    const isBackground = silent || forceRefresh;

    if (!isBackground) {
      setLoading(true);
      setError(null);
    }
    if (forceRefresh && !silent) setRefreshing(true);

    const params = new URLSearchParams({ limit: '150', market: m });
    if (forceRefresh) params.set('refresh', '1');
    const url = `${API}/stocks?${params}`;
    return fetch(url)
      .then(async (r) => {
        const text = await r.text();
        if (!text) throw new Error('Empty response. Make sure the server is running.');
        try {
          return JSON.parse(text);
        } catch {
          throw new Error('Invalid response. Make sure the server is running.');
        }
      })
      .then((data) => {
        setSegmentsByMarket((prev) => ({ ...prev, [m]: data.segments || [] }));
        setLastUpdated(data.date || new Date().toISOString());
        setError(null);
      })
      .catch((err) => {
        if (!isBackground) setError(err.message);
      })
      .finally(() => {
        if (!isBackground) setLoading(false);
        if (forceRefresh && !silent) setRefreshing(false);
      });
  }, []);

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

  useEffect(() => {
    setActiveStockId(null);
    setActiveTab(null);
  }, [segmentFilter, displayLimit, market]);

  useEffect(() => {
    setSectorFilter('all');
  }, [market, segmentFilter]);

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
    if (!segmentFilter) return [];
    let merged: Stock[] = [];
    if (segmentFilter === 'all') {
      const all = segments.flatMap((s) => [...s.topGainers, ...s.topLosers]);
      const seen = new Set<string>();
      merged = all.filter((s) => {
        if (seen.has(s.symbol)) return false;
        seen.add(s.symbol);
        return true;
      });
    } else {
      const seg = segments.find((s) => s.segment === segmentFilter);
      if (!seg) return [];
      const combined = [...seg.topGainers, ...seg.topLosers];
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
    if (!segmentFilter) return [];
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
    setChartPeriod((p) => ({ ...p, [id]: p[id] ?? '1y' }));
    const market = stock.market || 'in';

    // Load fundamentals if not cached
    if (!fundamentalsCache[id]) {
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

    // Preload chart (1m) if not cached
    if (!chartCache[id]?.['1m']) {
      setLoadingChartId(id);
      fetch(`${API}/chart/${stock.symbol}?period=1m&market=${market}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), '1m': data.history ?? [] } }));
        })
        .catch(() => setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), '1m': [] } })))
        .finally(() => setLoadingChartId(null));
    }

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
      const period = chartPeriod[id] ?? '1y';
      if (!chartCache[id]?.[period]) {
        setLoadingChartId(id);
        fetch(`${API}/chart/${stock.symbol}?period=${period}&market=${market}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.error) throw new Error(data.error);
            setChartCache((c) => ({
              ...c,
              [id]: { ...(c[id] ?? {}), [period]: data.history ?? [] },
            }));
          })
          .catch(() => setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), [period]: [] } })))
          .finally(() => setLoadingChartId(null));
      }
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
    setSegmentFilter('all');
    setSectorFilter('all');
    setPreferredTab('chart');
    const id = `${match.symbol}-${match.segment}`;
    setHighlightedSearchId(id);
    setTimeout(() => {
      setHighlightedSearchId((prev) => (prev === id ? null : prev));
    }, 1500);
    setChartPeriod((p) => ({ ...p, [id]: p[id] ?? '1y' }));
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
    setPreferredTab(tab);
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

    if (tab === 'chart') {
      setChartPeriod((p) => ({ ...p, [id]: p[id] ?? '1y' }));
      const period = chartPeriod[id] ?? '1y';
      if (!chartCache[id]?.[period]) {
        setLoadingChartId(id);
        fetch(`${API}/chart/${stock.symbol}?period=${period}&market=${stock.market || 'in'}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.error) throw new Error(data.error);
            setChartCache((c) => ({
              ...c,
              [id]: { ...(c[id] ?? {}), [period]: data.history ?? [] },
            }));
          })
          .catch(() => setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), [period]: [] } })))
          .finally(() => setLoadingChartId(null));
      }
    }
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
    setChartPeriod((p) => ({ ...p, [id]: period }));
    if (!chartCache[id]?.[period]) {
      setLoadingChartId(id);
      fetch(`${API}/chart/${stock.symbol}?period=${period}&market=${stock.market || 'in'}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setChartCache((c) => ({
            ...c,
            [id]: { ...(c[id] ?? {}), [period]: data.history ?? [] },
          }));
        })
        .catch(() => setChartCache((c) => ({ ...c, [id]: { ...(c[id] ?? {}), [period]: [] } })))
        .finally(() => setLoadingChartId(null));
    }
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
                        <span key={key} className="header-index-item">
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
                        </span>
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
            <select
              className="segment-picker"
              value={segmentFilter}
              onChange={(e) => setSegmentFilter(e.target.value)}
              title="Cap category"
            >
              {SEGMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
        ) : !segmentFilter ? (
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
          />
        )}
      </main>
    </div>
  );
}
