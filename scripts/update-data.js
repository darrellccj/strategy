const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DAILY_DIR = path.join(DATA_DIR, 'daily');
const TICKERS_FILE = path.join(__dirname, 'tickers.json');

// Rate limiting: delay between requests (ms)
const DELAY_MS = 400; // ~2.5 req/s

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DAILY_DIR)) fs.mkdirSync(DAILY_DIR, { recursive: true });
}

function loadTickers() {
  const raw = fs.readFileSync(TICKERS_FILE, 'utf8');
  return JSON.parse(raw);
}

async function fetchYahooChart(yahooTicker, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${yahooTicker}`);
  const json = await res.json();
  if (!json.chart || !json.chart.result || !json.chart.result[0]) {
    throw new Error(`No chart data for ${yahooTicker}`);
  }
  return json.chart.result[0];
}

async function fetchDailyData(yahooTicker) {
  const result = await fetchYahooChart(yahooTicker, '10y', '1d');
  const meta = result.meta;
  const quotes = result.indicators.quote[0];
  const timestamps = result.timestamp || [];

  const dailyArr = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quotes.close[i] !== null && quotes.close[i] !== undefined) {
      const d = new Date(timestamps[i] * 1000);
      const dateStr = d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
      dailyArr.push({
        date: dateStr,
        price: Math.round(quotes.close[i] * 100) / 100,
      });
    }
  }

  // Update last entry with current price
  const currentPrice = meta.regularMarketPrice;
  if (dailyArr.length > 0) {
    dailyArr[dailyArr.length - 1].price = Math.round(currentPrice * 100) / 100;
  }

  return {
    name: meta.shortName || meta.symbol || yahooTicker,
    currentPrice: Math.round(currentPrice * 100) / 100,
    currency: meta.currency || 'USD',
    dailyData: dailyArr,
  };
}

async function fetchDailyChange(yahooTicker) {
  try {
    const result = await fetchYahooChart(yahooTicker, '2d', '1d');
    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    const currentPrice = meta.regularMarketPrice;
    const closes = (quotes.close || []).filter(c => c !== null);
    let priceChange = 0, percentChange = 0;
    if (closes.length >= 2) {
      const prev = closes[closes.length - 2];
      priceChange = Math.round((currentPrice - prev) * 100) / 100;
      percentChange = Math.round(((currentPrice - prev) / prev) * 10000) / 100;
    }
    return { priceChange, percentChange };
  } catch {
    return { priceChange: 0, percentChange: 0 };
  }
}

// Financial Modeling Prep API for fundamentals (free tier: 250 calls/day)
// Set FMP_API_KEY env variable, or skip fundamentals
async function fetchFundamentals(symbols) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.log('No FMP_API_KEY set, skipping fundamentals fetch. Using placeholder data.');
    return null;
  }

  const fundamentals = {};
  let callCount = 0;

  for (const symbol of symbols) {
    if (callCount >= 240) {
      console.log('  Approaching FMP rate limit, stopping fundamentals fetch');
      break;
    }
    try {
      const url = `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&period=annual&limit=1&apikey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      callCount++;
      if (data && data[0]) {
        const d = data[0];
        // Earnings Yield = 1 / PE ratio (or use earningsYield if available)
        const earningsYield = d.earningsYield || (d.peRatio ? 1 / d.peRatio : 0);
        const returnOnCapital = d.returnOnInvestedCapital || d.roic || 0;
        const marketCap = d.marketCap || 0;
        if (earningsYield !== 0 || returnOnCapital !== 0) {
          fundamentals[symbol] = { earningsYield, returnOnCapital, marketCap };
        }
      }
      await sleep(300);
    } catch {
      // skip
    }
  }

  return fundamentals;
}

function computeMagicFormulaRankings(tickers, fundamentals) {
  // Filter: exclude Financials, Utilities, and tickers without fundamentals
  const eligible = tickers.filter(t =>
    t.sector !== 'Financials' &&
    t.sector !== 'Utilities' &&
    fundamentals[t.symbol] &&
    fundamentals[t.symbol].earningsYield > 0 &&
    fundamentals[t.symbol].returnOnCapital > 0
  );

  // Sort by earnings yield (descending = higher is better)
  const byEY = [...eligible].sort((a, b) =>
    fundamentals[b.symbol].earningsYield - fundamentals[a.symbol].earningsYield
  );
  const eyRank = {};
  byEY.forEach((t, i) => { eyRank[t.symbol] = i + 1; });

  // Sort by return on capital (descending = higher is better)
  const byROC = [...eligible].sort((a, b) =>
    fundamentals[b.symbol].returnOnCapital - fundamentals[a.symbol].returnOnCapital
  );
  const rocRank = {};
  byROC.forEach((t, i) => { rocRank[t.symbol] = i + 1; });

  // Combined rank (lower is better)
  const rankings = eligible.map(t => ({
    symbol: t.symbol,
    name: t.name,
    sector: t.sector,
    earningsYield: Math.round(fundamentals[t.symbol].earningsYield * 10000) / 10000,
    returnOnCapital: Math.round(fundamentals[t.symbol].returnOnCapital * 10000) / 10000,
    marketCap: fundamentals[t.symbol].marketCap,
    eyRank: eyRank[t.symbol],
    rocRank: rocRank[t.symbol],
    combinedRank: eyRank[t.symbol] + rocRank[t.symbol],
  }));

  rankings.sort((a, b) => a.combinedRank - b.combinedRank);
  return rankings;
}

async function main() {
  ensureDirs();
  const tickers = loadTickers();
  console.log(`Loaded ${tickers.length} tickers from ${TICKERS_FILE}`);

  const meta = {};
  const indexEntries = [];
  let success = 0;
  let failures = 0;

  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    const pct = ((i / tickers.length) * 100).toFixed(1);
    process.stdout.write(`[${pct}%] Fetching ${t.symbol} (${t.yahoo})...`);

    try {
      const data = await fetchDailyData(t.yahoo);
      const change = await fetchDailyChange(t.yahoo);

      // Write per-ticker daily data
      const dailyPath = path.join(DAILY_DIR, `${t.yahoo}.json`);
      fs.writeFileSync(dailyPath, JSON.stringify(data.dailyData));

      // Collect meta
      meta[t.yahoo] = {
        currentPrice: data.currentPrice,
        priceChange: change.priceChange,
        percentChange: change.percentChange,
        currency: data.currency,
      };

      // Collect index entry (use fetched name if available)
      indexEntries.push({
        symbol: t.symbol,
        yahoo: t.yahoo,
        name: data.name || t.name,
        sector: t.sector || '',
      });

      console.log(` OK (${data.dailyData.length} days)`);
      success++;
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      // Still add to index with original name
      indexEntries.push({
        symbol: t.symbol,
        yahoo: t.yahoo,
        name: t.name,
        sector: t.sector || '',
      });
      failures++;
    }

    await sleep(DELAY_MS);
  }

  // Write index.json
  const indexPath = path.join(DATA_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(indexEntries));
  console.log(`\nWrote ${indexPath} (${indexEntries.length} tickers)`);

  // Write meta.json
  const metaPath = path.join(DATA_DIR, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({ updated: new Date().toISOString(), tickers: meta }));
  console.log(`Wrote ${metaPath}`);

  // Fetch fundamentals and compute Magic Formula rankings
  const stockSymbols = tickers
    .filter(t => !t.yahoo.includes('-USD') && !['GLD', 'SLV', 'VOO', 'SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'ARKK', 'TLT', 'HYG', 'VNQ', 'EFA', 'EEM', 'VWO', 'VXUS', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC'].includes(t.symbol))
    .map(t => t.symbol);

  const fundamentals = await fetchFundamentals(stockSymbols);

  if (fundamentals) {
    const rankings = computeMagicFormulaRankings(tickers, fundamentals);
    const fundPath = path.join(DATA_DIR, 'fundamentals.json');
    fs.writeFileSync(fundPath, JSON.stringify({
      updated: new Date().toISOString(),
      rankings,
    }));
    console.log(`Wrote ${fundPath} (${rankings.length} ranked stocks)`);
  } else {
    // Write placeholder fundamentals
    const fundPath = path.join(DATA_DIR, 'fundamentals.json');
    fs.writeFileSync(fundPath, JSON.stringify({
      updated: new Date().toISOString(),
      rankings: [],
      note: 'Set FMP_API_KEY environment variable to fetch real fundamentals data',
    }));
    console.log(`Wrote placeholder ${fundPath}`);
  }

  // Also update legacy data.json and daily-data.json for backwards compat
  // (These will eventually be removed)
  console.log(`\n${success}/${tickers.length} tickers fetched (${failures} failures)`);

  if (success === 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
