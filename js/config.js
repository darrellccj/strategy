// Available tickers
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

// Strategy configuration
const STRATEGIES = {
  dca:          { name: 'Monthly DCA',        desc: 'Buy a fixed amount every month',                   amountLabel: 'Monthly Amount',        amountHint: "Amount you'll invest each month",                          defaultAmount: 500 },
  lump:         { name: 'Lump Sum',            desc: 'Invest everything at once',                        amountLabel: 'Initial Investment',    amountHint: 'One-time investment amount',                               defaultAmount: 10000 },
  ema50:        { name: '50 EMA Touch',        desc: 'Buy when price touches 50-day EMA',                amountLabel: 'Buy Amount per Signal', amountHint: 'Amount to invest each time price touches 50 EMA',         defaultAmount: 1000 },
  ema100:       { name: '100 EMA Touch',       desc: 'Buy when price touches 100-day EMA',               amountLabel: 'Buy Amount per Signal', amountHint: 'Amount to invest each time price touches 100 EMA',        defaultAmount: 1000 },
  ema200:       { name: '200 EMA Touch',       desc: 'Buy when price touches 200-day EMA',               amountLabel: 'Buy Amount per Signal', amountHint: 'Amount to invest each time price touches 200 EMA',        defaultAmount: 1000 },
  emaCrossover: { name: 'EMA Crossover',       desc: 'Buy on golden cross (50 EMA crosses above 200)',   amountLabel: 'Buy Amount per Signal', amountHint: 'Amount to invest on each golden cross signal',            defaultAmount: 5000 },
  rsi:          { name: 'RSI Mean Reversion',  desc: 'Buy when RSI drops below 30 (oversold)',           amountLabel: 'Buy Amount per Signal', amountHint: 'Amount to invest each time RSI signals oversold',         defaultAmount: 1000 },
  macd:         { name: 'MACD Divergence',     desc: 'Buy on bullish MACD crossover',                    amountLabel: 'Buy Amount per Signal', amountHint: 'Amount to invest on each bullish MACD crossover',         defaultAmount: 1000 },
};

// State
let state = {
  portfolio: [
    { symbol: 'VOO', yahoo: 'VOO', name: 'Vanguard S&P 500 ETF', allocation: 100, data: null }
  ],
  style: 'dca',
  amount: 500,
  years: 5,
  mode: 'simulate',
  optimizeTargetReturn: 15,
  optimizeYears: 5,
  optimizeComplexity: 1
};

// Pending ticker for adding to portfolio
let pendingTicker = null;

// Cache for ticker data
const dataCache = {};

// Pre-fetched data
let bundledDataLoaded = false;
let bundledDataPromise = null;
let dailyDataLoaded = false;
let dailyDataPromise = null;
let dailyDataCache = {};

// CORS proxies to try in order
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];
