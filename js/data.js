// Load ticker index from data/index.json (eager, on app start)
async function loadTickerIndex() {
  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error('data/index.json not found');
    const entries = await res.json();
    if (Array.isArray(entries) && entries.length > 0) {
      TICKERS = entries;
      tickerIndexLoaded = true;
    }
  } catch (e) {
    // Fall back to hardcoded TICKERS in config.js
    console.log('Using fallback ticker list:', e.message);
  }
  tickerIndexLoaded = true;
}

// Load meta prices from data/meta.json (eager, on app start)
async function loadMetaData() {
  try {
    const res = await fetch('data/meta.json');
    if (!res.ok) throw new Error('data/meta.json not found');
    const json = await res.json();
    if (json.tickers) {
      for (const [yahooTicker, meta] of Object.entries(json.tickers)) {
        if (!dataCache[yahooTicker]) {
          dataCache[yahooTicker] = {
            ticker: yahooTicker,
            name: yahooTicker,
            currentPrice: meta.currentPrice,
            priceChange: meta.priceChange,
            percentChange: meta.percentChange,
            currency: meta.currency || 'USD',
            dailyData: []
          };
        } else {
          dataCache[yahooTicker].currentPrice = meta.currentPrice;
          dataCache[yahooTicker].priceChange = meta.priceChange;
          dataCache[yahooTicker].percentChange = meta.percentChange;
        }
      }
    }
  } catch (e) {
    // meta.json not available
  }
}

// Load per-ticker daily data from data/daily/{ticker}.json (lazy, on demand)
async function loadTickerDailyData(yahooTicker) {
  // Check if already cached
  if (dataCache[yahooTicker] && dataCache[yahooTicker].dailyData && dataCache[yahooTicker].dailyData.length > 0) {
    return dataCache[yahooTicker];
  }

  // Check daily data cache (legacy)
  if (dailyDataCache[yahooTicker] && dailyDataCache[yahooTicker].length > 0) {
    if (!dataCache[yahooTicker]) {
      dataCache[yahooTicker] = { ticker: yahooTicker, name: yahooTicker, currentPrice: 0, priceChange: 0, percentChange: 0, currency: 'USD', dailyData: [] };
    }
    dataCache[yahooTicker].dailyData = dailyDataCache[yahooTicker];
    return dataCache[yahooTicker];
  }

  // Try per-ticker file
  try {
    const res = await fetch(`data/daily/${yahooTicker}.json`);
    if (res.ok) {
      const entries = await res.json();
      const dailyData = entries.map(d => ({
        date: new Date(d.date + 'T00:00:00Z'),
        price: d.price
      }));

      if (!dataCache[yahooTicker]) {
        // Find name from TICKERS
        const tickerInfo = TICKERS.find(t => t.yahoo === yahooTicker);
        dataCache[yahooTicker] = {
          ticker: yahooTicker,
          name: tickerInfo ? tickerInfo.name : yahooTicker,
          currentPrice: dailyData.length > 0 ? dailyData[dailyData.length - 1].price : 0,
          priceChange: 0,
          percentChange: 0,
          currency: 'USD',
          dailyData
        };
      } else {
        dataCache[yahooTicker].dailyData = dailyData;
        if (dailyData.length > 0 && !dataCache[yahooTicker].currentPrice) {
          dataCache[yahooTicker].currentPrice = dailyData[dailyData.length - 1].price;
        }
      }
      return dataCache[yahooTicker];
    }
  } catch (e) {
    // Per-ticker file not available
  }

  return null;
}

// Load multiple tickers in parallel (for optimizer/batch use)
async function loadMultipleTickers(yahooTickers) {
  return Promise.all(yahooTickers.map(t => fetchStockData(t)));
}

// Legacy: load bundled data.json (backwards compatibility)
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

// Legacy: load bundled daily-data.json (backwards compatibility)
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

// Fetch stock data — tries: cache → per-ticker file → legacy bundled → Yahoo Finance API
async function fetchStockData(yahooTicker) {
  // 1. Check if already fully cached
  if (dataCache[yahooTicker] && dataCache[yahooTicker].dailyData && dataCache[yahooTicker].dailyData.length > 0) {
    return dataCache[yahooTicker];
  }

  // 2. Deduplicate concurrent loads for same ticker
  if (dailyLoadPromises[yahooTicker]) {
    return dailyLoadPromises[yahooTicker];
  }

  dailyLoadPromises[yahooTicker] = (async () => {
    // 3. Try per-ticker daily file
    const fromFile = await loadTickerDailyData(yahooTicker);
    if (fromFile && fromFile.dailyData && fromFile.dailyData.length > 0) {
      return fromFile;
    }

    // 4. Try legacy bundled data
    if (!bundledDataLoaded) {
      if (!bundledDataPromise) bundledDataPromise = loadBundledData();
      await bundledDataPromise;
    }
    if (!dailyDataLoaded) {
      if (!dailyDataPromise) dailyDataPromise = loadDailyData();
      await dailyDataPromise;
    }

    if (dataCache[yahooTicker] && dataCache[yahooTicker].dailyData && dataCache[yahooTicker].dailyData.length > 0) {
      return dataCache[yahooTicker];
    }

    if (dataCache[yahooTicker] && dailyDataCache[yahooTicker]) {
      dataCache[yahooTicker].dailyData = dailyDataCache[yahooTicker];
      return dataCache[yahooTicker];
    }

    // 5. Fetch from Yahoo Finance via CORS proxy
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
        if (dailyHistoryArr.length > 0) {
          dailyHistoryArr[dailyHistoryArr.length - 1].price = currentPrice;
        }
      }

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
  })();

  const result = await dailyLoadPromises[yahooTicker];
  delete dailyLoadPromises[yahooTicker];
  return result;
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
