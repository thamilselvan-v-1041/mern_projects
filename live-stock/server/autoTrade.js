/**
 * Auto-trade: Daily purchase of top 3 stocks from top 50 loss stocks (India NSE)
 * Uses Zerodha Kite Connect API. Requires KITE_API_KEY, KITE_API_SECRET, KITE_ACCESS_TOKEN in .env
 *
 * Setup: https://kite.trade/docs/connect/v3/
 * Access token expires daily - regenerate via login flow each morning before market open.
 */

import { KiteConnect } from 'kiteconnect';

const AUTO_TRADE_TOP_LOSERS = 50;
const AUTO_TRADE_BUY_COUNT = 3;
const KITE_RATE_LIMIT_MS = 350; // ~3 requests/sec

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Get top 3 stocks from top 50 losers (sorted by most negative change %)
 * @param {Object} segmentData - from getTopStocksBySegment
 * @returns {Array} top 3 loser stocks
 */
export function getTop3FromTop50Losers(segmentData) {
  const allLosers = [];
  for (const [segment, data] of Object.entries(segmentData || {})) {
    const losers = (data.topLosers || []).map((s) => ({ ...s, segment }));
    allLosers.push(...losers);
  }
  // Sort by changePercent ascending (most negative first)
  const sorted = [...allLosers].sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0));
  const top50 = sorted.slice(0, AUTO_TRADE_TOP_LOSERS);
  const top3 = top50.slice(0, AUTO_TRADE_BUY_COUNT);
  return top3;
}

/**
 * Place buy orders via Zerodha Kite Connect
 * @param {Array} stocks - [{ symbol, name, price, segment, ... }]
 * @param {Object} options - { dryRun, quantityPerStock, credentials: { apiKey, apiSecret, accessToken } }
 * @returns {Object} { success, orders, error }
 */
export async function placeKiteOrders(stocks, options = {}) {
  const { dryRun = true, quantityPerStock = 1, credentials } = options;
  const apiKey = credentials?.apiKey || process.env.KITE_API_KEY;
  const apiSecret = credentials?.apiSecret || process.env.KITE_API_SECRET;
  const accessToken = credentials?.accessToken || process.env.KITE_ACCESS_TOKEN;

  if (!apiKey || !apiSecret) {
    return { success: false, error: 'API Key and Secret Key required. Set them in Settings.' };
  }

  if (!dryRun && !accessToken) {
    return { success: false, error: 'KITE_ACCESS_TOKEN required for live orders (regenerate daily via login)' };
  }

  const orders = [];

  for (const stock of stocks) {
    const tradingsymbol = (stock.symbol || '').replace(/\.(NS|BO)$/, '');
    const qty = Math.max(1, Math.floor(stock.quantity ?? quantityPerStock));

    if (dryRun) {
      orders.push({
        symbol: tradingsymbol,
        name: stock.name,
        price: stock.price,
        changePercent: stock.changePercent,
        quantity: qty,
        status: 'DRY_RUN',
        message: `Would place BUY ${qty} ${tradingsymbol} @ MARKET`,
      });
      continue;
    }

    try {
      const kite = new KiteConnect({ api_key: apiKey });
      kite.setAccessToken(accessToken);

      const orderId = await kite.placeOrder('regular', {
        exchange: 'NSE',
        tradingsymbol,
        transaction_type: 'BUY',
        quantity: qty,
        product: 'CNC',
        order_type: 'MARKET',
        validity: 'DAY',
      });

      orders.push({
        symbol: tradingsymbol,
        name: stock.name,
        quantity: qty,
        orderId,
        status: 'PLACED',
      });

      await sleep(KITE_RATE_LIMIT_MS);
    } catch (err) {
      orders.push({
        symbol: tradingsymbol,
        name: stock.name,
        quantity: qty,
        status: 'FAILED',
        error: err.message || String(err),
      });
    }
  }

  return { success: true, orders };
}

/**
 * Run full auto-trade: fetch top 50 losers, pick top 3, place orders
 * @param {Function} getSegmentData - async () => segmentData from getTopStocksBySegment
 * @param {Object} options - { dryRun, quantityPerStock, customStocks, credentials }
 * @param {Array} options.customStocks - optional [{ symbol, name, price, changePercent, ... }] to use instead of top 3 losers
 * @param {Object} options.credentials - optional { apiKey, apiSecret, accessToken } for request-scoped auth (no process.env)
 */
export async function runAutoTrade(getSegmentData, options = {}) {
  const dryRun = options.dryRun ?? (process.env.AUTO_TRADE_DRY_RUN !== 'false');
  const envQty = parseInt(process.env.AUTO_TRADE_QUANTITY || '1', 10) || 1;
  const quantityPerStock = options.quantityPerStock ?? envQty;
  const customStocks = options.customStocks;
  const credentials = options.credentials;

  const startTime = new Date().toISOString();
  console.log(`[AutoTrade] Starting at ${startTime} (dryRun=${dryRun})`);

  try {
    let stocksToBuy;
    if (customStocks !== undefined && customStocks !== null && Array.isArray(customStocks)) {
      // Client sent a list – use only these, never fall back to top 3 losers
      stocksToBuy = customStocks
        .filter((s) => s && s.symbol)
        .map((s) => ({
          symbol: String(s.symbol).trim(),
          name: s.name,
          price: s.price,
          changePercent: s.changePercent,
          quantity: s.quantity,
        }));
      console.log('[AutoTrade] Using client-selected stocks only:', stocksToBuy.map((s) => s.symbol).join(', ') || '(none)');
    } else {
      const segmentData = await getSegmentData();
      stocksToBuy = getTop3FromTop50Losers(segmentData);
    }

    if (stocksToBuy.length === 0) {
      console.log('[AutoTrade] No stocks to trade');
      return { success: false, error: 'No stocks to trade', orders: [], top3: [] };
    }

    console.log('[AutoTrade] Stocks to buy:', stocksToBuy.map((s) => `${s.symbol} (${s.changePercent?.toFixed(2)}%)`).join(', '));

    const result = await placeKiteOrders(stocksToBuy, { dryRun, quantityPerStock, credentials });

    if (result.orders?.length) {
      result.orders.forEach((o) => console.log(`[AutoTrade] ${o.status}: ${o.symbol} - ${o.message || o.error || o.orderId}`));
    }

    return {
      success: result.success,
      error: result.error,
      orders: result.orders || [],
      top3: stocksToBuy.map((s) => ({ symbol: s.symbol, name: s.name, changePercent: s.changePercent })),
      dryRun,
      timestamp: startTime,
    };
  } catch (err) {
    console.error('[AutoTrade] Error:', err.message);
    return {
      success: false,
      error: err.message,
      orders: [],
      top3: [],
      dryRun,
      timestamp: startTime,
    };
  }
}
