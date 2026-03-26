/**
 * One-off / maintenance: fetches public S&P500 GICS CSV and merges with
 * heuristics for tickers in US_STOCKS not in the index. Writes server/usSectorMap.generated.json
 *
 * Run: node scripts/generate-us-sector-map.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'server', 'index.js');
const OUT_PATH = path.join(__dirname, '..', 'server', 'usSectorMap.generated.json');

const SP500_CSV =
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv';

function parseUsStocksSymbols() {
  const t = fs.readFileSync(INDEX_PATH, 'utf8');
  const start = t.indexOf('const US_STOCKS = {');
  const sub = t.slice(start);
  const end = sub.indexOf('};', sub.indexOf('flexi:')) + 2;
  const block = sub.slice(0, end);
  const syms = new Set();
  for (const m of block.matchAll(/'([A-Z][A-Z0-9.-]*)'/g)) syms.add(m[1]);
  return [...syms];
}

/** Map Yahoo/GICS-style names into normalizeSectorForDisplay-friendly raw sectors */
function gicsToRawSector(gics) {
  const g = (gics || '').trim();
  if (!g) return null;
  const map = {
    'Information Technology': 'Technology',
    'Health Care': 'Healthcare',
    Financials: 'Financial Services',
    'Consumer Discretionary': 'Consumer Cyclical',
    'Consumer Staples': 'Consumer Defensive',
    Industrials: 'Industrials',
    Energy: 'Energy',
    Materials: 'Basic Materials',
    'Real Estate': 'Real Estate',
    Utilities: 'Utilities',
    'Communication Services': 'Communication Services',
  };
  return map[g] || g;
}

const ETF_TICKERS = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'VEA', 'VWO', 'EFA', 'EEM',
  'GLD', 'SLV', 'USO', 'UNG', 'TLT', 'HYG', 'LQD', 'BND', 'AGG', 'TIP', 'SHY', 'IEF',
  'ARKK', 'XBI', 'IBB',
]);

function heuristicSector(sym) {
  if (ETF_TICKERS.has(sym)) return 'Exchange Traded Fund';
  // ADRs / well-known non-S&P names
  const adrs = {
    BABA: 'Consumer Cyclical',
    JD: 'Consumer Cyclical',
    PDD: 'Consumer Cyclical',
    BIDU: 'Communication Services',
    NIO: 'Consumer Cyclical',
    XPEV: 'Consumer Cyclical',
    LI: 'Consumer Cyclical',
    GRAB: 'Consumer Cyclical',
    CPNG: 'Consumer Cyclical',
    SE: 'Consumer Cyclical',
    MELI: 'Consumer Cyclical',
  };
  if (adrs[sym]) return adrs[sym];
  // Crypto / mining style
  if (/^(MARA|RIOT|COIN|HUT|HIVE|BITF|CORZ|IREN|CIFR|ARBK|SDIG|WULF|BTCM|EBON|CAN|CLSK|BTBT)$/i.test(sym))
    return 'Technology';
  // Regional banks often missing from S&P
  if (
    /^(HBAN|FITB|KEY|RF|MTB|CFG|FHN|BOH|BKU|UCBI|WSFS|IBOC|FFIN|HOMB|ONB|TCBI|CATY|BANF|SBCF|EWBC|FRME|FULT|FNB|PNFP|ASB|HWC|WAL|COLB|RMBS|SNV|PB|ZION|CMA|WTFC)$/i.test(
      sym,
    )
  )
    return 'Financial Services';
  return 'Industrials';
}

async function main() {
  const res = await fetch(SP500_CSV);
  if (!res.ok) throw new Error(`CSV fetch ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const spMap = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const parts = [];
    let cur = '';
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        inQ = !inQ;
        continue;
      }
      if (c === ',' && !inQ) {
        parts.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
    parts.push(cur);
    const symbol = parts[0]?.trim();
    const gics = parts[2]?.trim();
    if (symbol && gics) {
      const raw = gicsToRawSector(gics);
      if (raw) spMap[symbol] = raw;
    }
  }

  function sp500Lookup(sym) {
    return spMap[sym] || spMap[sym.replace(/-/g, '.')] || spMap[sym.replace(/\./g, '-')];
  }

  const wanted = parseUsStocksSymbols();
  const out = {};
  let fromSp = 0;
  let fromHeur = 0;
  for (const sym of wanted) {
    const hit = sp500Lookup(sym);
    if (hit) {
      out[sym] = hit;
      fromSp++;
    } else {
      out[sym] = heuristicSector(sym);
      fromHeur++;
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 0) + '\n', 'utf8');
  console.log(`Wrote ${OUT_PATH} (${wanted.length} symbols, ${fromSp} from S&P500, ${fromHeur} heuristic)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
