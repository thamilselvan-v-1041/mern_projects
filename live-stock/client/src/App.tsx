import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import * as XLSX from 'xlsx';
import './App.css';

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

function kiteHeaders(creds: { apiKey: string; secret: string; accessToken: string }): Record<string, string> {
  const h: Record<string, string> = {};
  if (creds.apiKey) h['X-Kite-Api-Key'] = creds.apiKey;
  if (creds.secret) h['X-Kite-Api-Secret'] = creds.secret;
  if (creds.accessToken) h['X-Kite-Access-Token'] = creds.accessToken;
  return h;
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
}: {
  stock: Stock;
  expanded: boolean;
  activeTab: TabType | null;
  onStockTap: () => void;
  onTabClick: (tab: TabType) => void;
  analysis: Analysis | null;
  loadingAnalysis: boolean;
  fundamentals: Record<string, string> | null;
  loadingFundamentals: boolean;
  chartData: { date: string; close: number }[] | null;
  chartPeriod: ChartPeriod;
  onChartPeriodChange: (period: ChartPeriod) => void;
  loadingChart: boolean;
  selected?: boolean;
  onSelectChange?: (checked: boolean) => void;
  showSelect?: boolean;
}) {
  const isUp = (stock.changePercent ?? 0) >= 0;
  const currency = stock.market === 'us' ? '$' : '₹';
  const history = chartData ?? stock.history ?? [];
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; close: number } | null>(null);

  return (
    <div className="stock-item">
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
          <span className="stock-rank">#{stock.rank}</span>
          <div>
            <div className="stock-name">{stock.name}</div>
            <div className="stock-symbol-row">
              <span className="stock-symbol">{stock.symbol}</span>
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
              title="Today & recent progress"
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
          </div>
          <div className="stock-detail-content">
            {activeTab === 'fundamentals' && (
            fundamentals ? (
              <div className="fundamentals-grid">
                {[
                  ['Price', fundamentals.price ?? '—', null],
                  ['Market Cap', fundamentals.marketCap, stock.segmentName?.replace(/\s+Cap$/, '')],
                  ['Volume', fundamentals.volume, null],
                  ['Avg Volume', fundamentals.avgVolume, null],
                  ['P/E', fundamentals.pe, null],
                  ['Forward P/E', fundamentals.forwardPE, null],
                  ['EPS', fundamentals.eps, null],
                  ['Dividend Yield', fundamentals.dividendYield, null],
                  ['52W High', fundamentals.fiftyTwoWeekHigh, null],
                  ['52W Low', fundamentals.fiftyTwoWeekLow, null],
                  ['Open', fundamentals.open, null],
                  ['Day Range', fundamentals.dayLow != null && fundamentals.dayHigh != null ? `${fundamentals.dayLow} - ${fundamentals.dayHigh}` : '—', null],
                ].map(([label, val, cap]) => (
                  <div key={label} className="fund-row">
                    <span className="fund-label">{label}</span>
                    <span className="fund-value">
                      {val}
                      {cap && <span className="fund-cap-type"> ({cap})</span>}
                    </span>
                  </div>
                ))}
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
}: {
  stocks: Stock[];
  activeStockId: string | null;
  activeTab: TabType | null;
  onStockTap: (stock: Stock) => void;
  onTabClick: (stock: Stock, tab: TabType) => void;
  analysisCache: Record<string, Analysis>;
  loadingAnalysisId: string | null;
  fundamentalsCache: Record<string, Record<string, string>>;
  loadingFundamentalsId: string | null;
  chartCache: Record<string, Partial<Record<ChartPeriod, { date: string; close: number }[]>>>;
  chartPeriod: Record<string, ChartPeriod>;
  onChartPeriodChange: (stock: Stock, period: ChartPeriod) => void;
  loadingChartId: string | null;
  selectedStockIds: Set<string>;
  onSelectStock: (id: string, checked: boolean) => void;
  showSelect: boolean;
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
          const period = chartPeriod[id] ?? '1m';
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
              chartData={chartDataForPeriod}
              chartPeriod={period}
              onChartPeriodChange={(p) => onChartPeriodChange(stock, p)}
              loadingChart={loadingChartId === id}
              selected={selectedStockIds.has(id)}
              onSelectChange={(checked) => onSelectStock(id, checked)}
              showSelect={showSelect}
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
  const [chartCache, setChartCache] = useState<Record<string, Partial<Record<ChartPeriod, { date: string; close: number }[]>>>>({});
  const [chartPeriod, setChartPeriod] = useState<Record<string, ChartPeriod>>({});
  const [loadingChartId, setLoadingChartId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [market, setMarket] = useState<string>('in');
  const [displayLimit, setDisplayLimit] = useState<50 | 100 | 150>(150);
  const [segmentFilter, setSegmentFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [autoTradeLoading, setAutoTradeLoading] = useState(false);
  const [proceedErrorPopup, setProceedErrorPopup] = useState<string | null>(null);
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
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

  useEffect(() => {
    fetchForMarket('in', false, false).then(() => {
      fetchForMarket('us', false, true);
    });
  }, [fetchForMarket]);

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
    try {
      sessionStorage.setItem(FUNDAMENTALS_CACHE_KEY, JSON.stringify(fundamentalsCache));
    } catch {
      /* ignore */
    }
  }, [fundamentalsCache]);

  useEffect(() => {
    if (historyModalOpen || reportFullscreen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [historyModalOpen, reportFullscreen]);

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
      setKiteHoldingsError(null);
      setKiteHoldingsLoading(true);
      fetchJson<{ holdings?: Array<{ tradingsymbol: string; exchange: string; quantity: number; average_price: number; last_price: number; pnl?: number; day_change_percentage?: number }>; error?: string }>(`${API}/kite/holdings`, {
        headers: kiteHeaders(kiteForm),
      })
        .then((data) => {
          if (data.error) {
            setKiteHoldingsError(data.error);
            setKiteHoldings([]);
          } else {
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

  const stocks = useMemo(() => {
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
    return sorted.map((s, i) => ({ ...s, rank: i + 1 }));
  }, [segments, segmentFilter, sortOrder, displayLimit, market]);

  const handleStockTap = (stock: Stock) => {
    const id = `${stock.symbol}-${stock.segment}`;
    if (activeStockId === id) {
      setActiveStockId(null);
      setActiveTab(null);
      return;
    }
    setActiveStockId(id);
    setActiveTab('fundamentals');
    setChartPeriod((p) => ({ ...p, [id]: p[id] ?? '1m' }));
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
  };

  const handleTabClick = async (stock: Stock, tab: TabType) => {
    const id = `${stock.symbol}-${stock.segment}`;
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
      setChartPeriod((p) => ({ ...p, [id]: p[id] ?? '1m' }));
      const period = chartPeriod[id] ?? '1m';
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

  const handleProceed = () => {
    setProceedErrorPopup(null);
    const inSegments = segmentsByMarket['in'] || [];

    // Resolve selected stock ids to full stock objects (only user-selected items)
    const selectedStocks: Stock[] = [];
    for (const id of selectedStockIds) {
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

    const stocksToBuy = selectedStocks.map((s) => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      changePercent: s.changePercent,
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
    const toSend = tradeConfirmModal.stocksToBuy
      .filter((s) => confirmCheckedSymbols.has(s.symbol))
      .map((s) => ({ ...s, quantity: Math.max(1, buyQuantityBySymbol[s.symbol] ?? 1) }));
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
      const data = await res.json();
      const entry = {
        timestamp: ts,
        success: data.success ?? false,
        error: data.error,
        orders: data.orders,
      };
      setTradeResult({
        success: entry.success,
        error: entry.error,
        orders: entry.orders,
      });
      if (entry.success === false && entry.error) {
        setProceedErrorPopup(entry.error);
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      setTradeResult({ success: false, error: errMsg });
      setProceedErrorPopup(errMsg);
    } finally {
      setAutoTradeLoading(false);
    }
  };

  const handleCloseTradeResult = () => {
    const failed = tradeResult?.orders?.filter((o) => o.status === 'FAILED') ?? [];
    if (failed.length > 0) {
      const ts = new Date().toISOString();
      setFailedOrdersFromTrade((prev) => [
        ...failed.map((o, i) => ({
          order_id: `failed-${o.symbol}-${ts}-${i}`,
          tradingsymbol: o.symbol,
          name: o.name,
          exchange: 'NSE',
          status: 'REJECTED',
          transaction_type: 'BUY',
          quantity: (o as { quantity?: number }).quantity ?? 1,
          order_timestamp: ts,
          status_message: o.error || 'Order failed',
        })),
        ...prev,
      ]);
    }
    setTradeConfirmModal(null);
    setTradeResult(null);
    setOrdersModalTab('orders');
    setHistoryModalOpen(true);
    setOrdersRefreshTrigger((t) => t + 1);
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
        <div className="error-banner">Error: {error}. Make sure the server is running.</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-title-row">
          <div className="proceed-area">
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
          </div>
        </div>
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
            <div className="header-right">
              <button className="refresh-btn" onClick={() => fetchForMarket('in', true, true).then(() => fetchForMarket('us', true, true))} title="Refresh">
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
            </div>
        </div>
      </header>

      {proceedErrorPopup && (
        <div className="auto-trade-result" role="dialog" aria-label="Buy error">
          <div className="auto-trade-result-inner">
            <div className="auto-trade-result-header">
              <h3>Error</h3>
              <button className="auto-trade-close" onClick={() => setProceedErrorPopup(null)} aria-label="Close">×</button>
            </div>
            <p className="auto-trade-error">{proceedErrorPopup}</p>
          </div>
        </div>
      )}

      {tradeConfirmModal && (
        <div className="auto-trade-result" role="dialog" aria-label="Confirm trade">
          <div className="auto-trade-result-inner trade-confirm-modal">
            <div className="auto-trade-result-header">
              <h3>{tradeResult ? (tradeResult.success ? 'Order placed' : 'Order failed') : 'Confirm trade'}</h3>
              <button className="auto-trade-close" onClick={tradeResult ? handleCloseTradeResult : handleCancelTrade} aria-label="Close">×</button>
            </div>
            {tradeResult ? (
              <div className="trade-result-content">
                {tradeResult.success ? (
                  <>
                    <p className="trade-result-msg success">Order placed successfully.</p>
                    {tradeResult.orders && tradeResult.orders.length > 0 && (
                      <ul className="trade-result-orders">
                        {tradeResult.orders.map((o, j) => (
                          <li key={j} className={o.status === 'PLACED' ? 'placed' : o.status === 'FAILED' ? 'failed' : ''}>
                            <span className="symbol">{o.symbol}</span>
                            {o.name && <span className="name">{o.name}</span>}
                            <span className="status">{o.status}</span>
                            {o.orderId && <span className="order-id">#{o.orderId}</span>}
                            {o.error && <span className="error">{o.error}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <p className="trade-result-msg error">{tradeResult.error}</p>
                    {tradeResult.orders && tradeResult.orders.length > 0 && (
                      <ul className="trade-result-orders">
                        {tradeResult.orders.map((o, j) => (
                          <li key={j} className="failed">
                            <span className="symbol">{o.symbol}</span>
                            {o.name && <span className="name">{o.name}</span>}
                            <span className="status">{o.status}</span>
                            {o.error && <span className="error">{o.error}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <button className="proceed-btn" onClick={handleCloseTradeResult} style={{ marginTop: '1rem', width: '100%' }}>
                  Done
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
                              min={1}
                              max={9999}
                              value={buyQuantityBySymbol[s.symbol] ?? 1}
                              onChange={(e) =>
                                setBuyQuantityBySymbol((prev) => ({
                                  ...prev,
                                  [s.symbol]: Math.max(1, Math.min(9999, parseInt(e.target.value, 10) || 1)),
                                }))
                              }
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
                      <button className="trade-cancel-btn" onClick={handleCancelTrade} disabled={autoTradeLoading}>
                        Cancel
                      </button>
                      <button
                        className="proceed-btn"
                        onClick={handleConfirmTrade}
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
                  {kiteConfigured && analyseSource === 'kite' && kiteHoldingsLoading ? (
                    <p className="orders-empty-msg">Loading portfolio...</p>
                  ) : kiteConfigured && analyseSource === 'kite' && kiteHoldingsError ? (
                    <div className="orders-error-msg">
                      <p>{kiteHoldingsError}</p>
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
                      <p>{xlsxUploadError}</p>
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
                      <p>{portfolioAnalysisError}</p>
                      {kiteConfigured && (
                        <button
                          type="button"
                          className="history-btn"
                          style={{ marginTop: '0.5rem' }}
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
                  {!kiteHoldingsLoading && !kiteHoldingsError && kiteHoldings.length > 0 && (() => {
                    const invested = kiteHoldings.reduce((s, h) => s + (h.quantity * (h.average_price ?? 0)), 0);
                    const value = kiteHoldings.reduce((s, h) => s + (h.quantity * (h.last_price ?? 0)), 0);
                    const pnl = kiteHoldings.reduce((s, h) => s + (h.pnl ?? (h.quantity * ((h.last_price ?? 0) - (h.average_price ?? 0)))), 0);
                    return (
                      <div className="analyse-summary-bar">
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
                      </div>
                    );
                  })()}
                  <div className="portfolio-scroll">
                  {kiteHoldingsLoading ? (
                    <p className="orders-empty-msg">Loading portfolio...</p>
                  ) : kiteHoldingsError ? (
                    <div className="orders-error-msg">
                      <p>{kiteHoldingsError}</p>
                      <button
                        type="button"
                        className="history-btn"
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => { setOrdersModalTab('settings'); setHistoryModalOpen(true); }}
                      >
                        Configure
                      </button>
                    </div>
                  ) : kiteHoldings.length === 0 ? (
                    <p className="orders-empty-msg">No holdings in your Kite portfolio.</p>
                  ) : (
                    <ul className="proceed-history-list kite-holdings-list">
                      {kiteHoldings.map((h, i) => (
                        <li key={`${h.tradingsymbol}-${i}`} className="holding-item">
                          <div className="holding-line1">
                            <span className="symbol">{h.tradingsymbol}</span>
                            <span className="exchange">{h.exchange}</span>
                            <span className="qty">Qty {h.quantity}</span>
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
                        </li>
                      ))}
                    </ul>
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
                      <p className="settings-kite-login-hint">Sign in with your existing Zerodha account, then copy <code>request_token</code> from the redirect URL.</p>
                      <a
                        href={`https://kite.zerodha.com/connect/login?api_key=${kiteForm.apiKey}&v=3`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="settings-kite-login-btn"
                      >
                        Sign in with Zerodha
                      </a>
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
                      {(kiteForm.requestToken.trim() || kiteForm.accessToken.trim()) && (
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
                            <p className="settings-field-error">{kiteInvalidateError}</p>
                          )}
                        </div>
                      )}
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
                            <p className="settings-generate-error">{kiteGenerateResult.error}</p>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                    {kiteError && <p className="settings-error">{kiteError}</p>}
                  </div>
                </div>
              ) : (
                <div className="orders-tab-wrapper">
                  {kiteOrdersLoading ? (
                    <p className="orders-empty-msg">Loading orders...</p>
                  ) : kiteOrdersError && failedOrdersFromTrade.length === 0 ? (
                    <div className="orders-error-msg">
                      <p>{kiteOrdersError}</p>
                      {kiteConfigured ? (
                        <button
                          type="button"
                          className="history-btn"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => setOrdersRefreshTrigger((t) => t + 1)}
                        >
                          Retry
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="history-btn"
                          style={{ marginTop: '0.5rem' }}
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
                              {o.status_message || (o as { status_message_raw?: string }).status_message_raw || 'Order failed'}
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
            chartCache={chartCache}
            chartPeriod={chartPeriod}
            onChartPeriodChange={handleChartPeriodChange}
            loadingChartId={loadingChartId}
            selectedStockIds={selectedStockIds}
            onSelectStock={handleSelectStock}
            showSelect
          />
        )}
      </main>
    </div>
  );
}
