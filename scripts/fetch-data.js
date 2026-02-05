const fs = require('fs');
const path = require('path');

const TICKERS = [
  { symbol: 'AAPL', yahoo: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', yahoo: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', yahoo: 'GOOGL', name: 'Alphabet (Google)' },
  { symbol: 'AMZN', yahoo: 'AMZN', name: 'Amazon' },
  { symbol: 'META', yahoo: 'META', name: 'Meta Platforms' },
  { symbol: 'NVDA', yahoo: 'NVDA', name: 'Nvidia' },
  { symbol: 'TSLA', yahoo: 'TSLA', name: 'Tesla' },
  { symbol: 'GLD', yahoo: 'GLD', name: 'SPDR Gold Trust' },
  { symbol: 'SLV', yahoo: 'SLV', name: 'iShares Silver Trust' },
  { symbol: 'VOO', yahoo: 'VOO', name: 'Vanguard S&P 500 ETF' },
  { symbol: 'SPY', yahoo: 'SPY', name: 'SPDR S&P 500 ETF' },
  { symbol: 'BTC', yahoo: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'ETH', yahoo: 'ETH-USD', name: 'Ethereum' },
];

async function fetchTickerData(yahooTicker) {
  const historyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=10y&interval=1mo&includePrePost=false`;
  const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=2d&interval=1d&includePrePost=false`;
  const dailyHistoryUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=10y&interval=1d&includePrePost=false`;

  const [historyRes, dailyRes, dailyHistoryRes] = await Promise.all([
    fetch(historyUrl),
    fetch(dailyUrl).catch(() => null),
    fetch(dailyHistoryUrl).catch(() => null),
  ]);

  if (!historyRes.ok) {
    throw new Error(`Failed to fetch history for ${yahooTicker}: ${historyRes.status}`);
  }

  const data = await historyRes.json();
  const dailyData = dailyRes && dailyRes.ok ? await dailyRes.json() : null;
  const dailyHistoryData = dailyHistoryRes && dailyHistoryRes.ok ? await dailyHistoryRes.json() : null;

  if (!data.chart || !data.chart.result || !data.chart.result[0]) {
    throw new Error(`Invalid data format for ${yahooTicker}`);
  }

  const result = data.chart.result[0];
  const meta = result.meta;
  const quotes = result.indicators.quote[0];
  const timestamps = result.timestamp;

  // Build monthly data, keeping only one entry per calendar month (latest wins)
  const monthlyMap = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    if (quotes.close[i] !== null) {
      const d = new Date(timestamps[i] * 1000);
      const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      monthlyMap.set(key, {
        date: d.toISOString(),
        price: Math.round(quotes.close[i] * 100) / 100,
      });
    }
  }

  const currentPrice = meta.regularMarketPrice;

  // Replace the last entry's price with the live current price
  const monthlyData = Array.from(monthlyMap.values());
  if (monthlyData.length > 0) {
    monthlyData[monthlyData.length - 1].price = Math.round(currentPrice * 100) / 100;
  }

  let priceChange = 0;
  let percentChange = 0;
  if (dailyData && dailyData.chart && dailyData.chart.result && dailyData.chart.result[0]) {
    const dailyQuotes = dailyData.chart.result[0].indicators.quote[0];
    const closes = dailyQuotes.close.filter(c => c !== null);
    if (closes.length >= 2) {
      const prevClose = closes[closes.length - 2];
      priceChange = Math.round((currentPrice - prevClose) * 100) / 100;
      percentChange = Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100;
    }
  }

  // Build daily data for EMA calculations
  let dailyDataArr = [];
  if (dailyHistoryData && dailyHistoryData.chart && dailyHistoryData.chart.result && dailyHistoryData.chart.result[0]) {
    const dResult = dailyHistoryData.chart.result[0];
    const dQuotes = dResult.indicators.quote[0];
    const dTimestamps = dResult.timestamp;
    for (let i = 0; i < dTimestamps.length; i++) {
      if (dQuotes.close[i] !== null) {
        const d = new Date(dTimestamps[i] * 1000);
        const dateStr = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
        dailyDataArr.push({
          date: dateStr,
          price: Math.round(dQuotes.close[i] * 100) / 100,
        });
      }
    }
  }

  return {
    name: meta.shortName || meta.symbol,
    currentPrice,
    priceChange,
    percentChange,
    currency: meta.currency || 'USD',
    monthlyData,
    dailyData: dailyDataArr,
  };
}

async function main() {
  const result = { updated: new Date().toISOString(), tickers: {} };
  let failures = 0;

  for (const ticker of TICKERS) {
    try {
      console.log(`Fetching ${ticker.symbol} (${ticker.yahoo})...`);
      result.tickers[ticker.yahoo] = await fetchTickerData(ticker.yahoo);
      const td = result.tickers[ticker.yahoo];
      console.log(`  OK - ${td.monthlyData.length} monthly, ${td.dailyData.length} daily data points`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      failures++;
    }
  }

  const outPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(result));
  console.log(`\nWrote ${outPath}`);
  console.log(`${TICKERS.length - failures}/${TICKERS.length} tickers fetched successfully.`);

  if (failures === TICKERS.length) {
    process.exit(1);
  }
}

main();
