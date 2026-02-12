async function loadBundledData() {
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error('data.json not found');
    const json = await res.json();
    if (json.tickers) {
      for (const [yahooTicker, tickerData] of Object.entries(json.tickers)) {
        dataCache[yahooTicker] = {
          ticker: yahooTicker,
          name: tickerData.name,
          currentPrice: tickerData.currentPrice,
          priceChange: tickerData.priceChange,
          percentChange: tickerData.percentChange,
          currency: tickerData.currency || 'USD',
          dailyData: []
        };
      }
    }
  } catch (e) {
    // data.json not available
  }
  bundledDataLoaded = true;
}

async function loadDailyData() {
  try {
    const res = await fetch('daily-data.json');
    if (!res.ok) throw new Error('daily-data.json not found');
    const json = await res.json();
    if (json.tickers) {
      for (const [yahooTicker, entries] of Object.entries(json.tickers)) {
        const dailyData = entries.map(d => ({
          date: new Date(d.date + 'T00:00:00Z'),
          price: d.price
        }));
        dailyDataCache[yahooTicker] = dailyData;
        // Merge into main cache if entry exists
        if (dataCache[yahooTicker]) {
          dataCache[yahooTicker].dailyData = dailyData;
        }
      }
    }
  } catch (e) {
    // daily-data.json not available
  }
  dailyDataLoaded = true;
}

// Fetch with CORS proxy fallback
async function fetchWithProxy(url) {
  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const response = await fetch(proxyUrl);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      continue;
    }
  }
  throw new Error('All proxies failed');
}

// Fetch stock data from Yahoo Finance
async function fetchStockData(yahooTicker) {
  // Load bundled data on first call
  if (!bundledDataLoaded) {
    if (!bundledDataPromise) bundledDataPromise = loadBundledData();
    await bundledDataPromise;
  }
  if (!dailyDataLoaded) {
    if (!dailyDataPromise) dailyDataPromise = loadDailyData();
    await dailyDataPromise;
  }

  // Check cache (may have been populated from bundled data)
  if (dataCache[yahooTicker] && dataCache[yahooTicker].dailyData && dataCache[yahooTicker].dailyData.length > 0) {
    return dataCache[yahooTicker];
  }

  // Merge daily data from separate cache if available
  if (dataCache[yahooTicker] && dailyDataCache[yahooTicker]) {
    dataCache[yahooTicker].dailyData = dailyDataCache[yahooTicker];
    return dataCache[yahooTicker];
  }

  const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=2d&interval=1d&includePrePost=false`;
  const dailyHistoryUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=10y&interval=1d&includePrePost=false`;

  try {
    const [dailyData, dailyHistoryData] = await Promise.all([
      fetchWithProxy(dailyUrl).catch(() => null),
      fetchWithProxy(dailyHistoryUrl).catch(() => null)
    ]);

    let currentPrice = 0;
    let priceChange = 0;
    let percentChange = 0;
    let name = yahooTicker;

    // Build daily history data
    let dailyHistoryArr = [];
    if (dailyHistoryData && dailyHistoryData.chart && dailyHistoryData.chart.result && dailyHistoryData.chart.result[0]) {
      const dResult = dailyHistoryData.chart.result[0];
      const meta = dResult.meta;
      const dQuotes = dResult.indicators.quote[0];
      const dTimestamps = dResult.timestamp;
      currentPrice = meta.regularMarketPrice;
      name = meta.shortName || meta.symbol;

      for (let j = 0; j < dTimestamps.length; j++) {
        if (dQuotes.close[j] !== null) {
          dailyHistoryArr.push({
            date: new Date(dTimestamps[j] * 1000),
            price: dQuotes.close[j]
          });
        }
      }
      // Update last entry with current price
      if (dailyHistoryArr.length > 0) {
        dailyHistoryArr[dailyHistoryArr.length - 1].price = currentPrice;
      }
    }

    // Extract daily change
    if (dailyData && dailyData.chart && dailyData.chart.result && dailyData.chart.result[0]) {
      const meta = dailyData.chart.result[0].meta;
      if (!currentPrice) currentPrice = meta.regularMarketPrice;
      if (!name || name === yahooTicker) name = meta.shortName || meta.symbol;
      const dailyQuotes = dailyData.chart.result[0].indicators.quote[0];
      const closes = dailyQuotes.close.filter(c => c !== null);
      if (closes.length >= 2) {
        const prevClose = closes[closes.length - 2];
        priceChange = currentPrice - prevClose;
        percentChange = (priceChange / prevClose) * 100;
      }
    }

    if (dailyHistoryArr.length === 0) throw new Error('No daily data');

    const tickerData = {
      ticker: yahooTicker,
      name,
      currentPrice,
      priceChange,
      percentChange,
      dailyData: dailyHistoryArr,
      currency: 'USD'
    };

    dataCache[yahooTicker] = tickerData;
    return tickerData;
  } catch (error) {
    console.error('Error fetching stock data:', error);
    return getFallbackData(yahooTicker);
  }
}

// Fallback data if API fails
function getFallbackData(ticker) {
  return {
    ticker,
    name: ticker,
    currentPrice: 0,
    priceChange: 0,
    percentChange: 0,
    dailyData: [],
    isFallback: true
  };
}
