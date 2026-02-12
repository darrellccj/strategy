# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Growth Investing Simulator - a web application for backtesting stock investment strategies using historical data. Users can simulate various strategies (DCA, Lump Sum, EMA, RSI, MACD) across different time periods, build multi-asset portfolios, and run an optimizer to find portfolios matching a target return.

## Technology Stack

- Pure HTML5/CSS/JavaScript (no frameworks or build tools)
- No ES modules — all JS files use global scope, loaded via `<script>` tags in dependency order
- Yahoo Finance API via CORS proxy fallback chain for historical stock data
- Canvas API for chart rendering
- Hosted via GitHub Pages

## Running the Application

Open `index.html` directly in a browser. No build process or server required. Also deployed at `https://darrellccj.github.io/strategy/`.

## File Structure

```
index.html          — HTML structure only (~175 lines)
styles.css          — All CSS (~1,070 lines)
js/
  config.js         — TICKERS, STRATEGIES, state, caches, CORS_PROXIES
  utils.js          — formatCurrency, formatPercent, sliceDailyFromYearsAgo, computeMaxDrawdown, sampleForChart
  data.js           — loadBundledData, loadDailyData, fetchWithProxy, fetchStockData, getFallbackData
  indicators.js     — calculateEMA, calculateRSI, calculateMACD
  backtest.js       — backtestDCA, backtestLumpSum, backtestEMA, backtestEMACrossover, backtestRSI, backtestMACD, backtestSingle, calculate, getTotalAllocation
  chart.js          — drawChart (with drawOverlayLine, drawPriceOverlay helpers)
  optimize.js       — calculateTWR, calculateRiskScore, computeRiskFromValues, backtestSingleWithParams, ensureAllTickersLoaded, runOptimization, renderOptimizeResults
  ui.js             — All DOM refs, event handlers, portfolio UI, ticker search, strategy dropdown, mode switching, initialization
data.json           — Pre-fetched ticker metadata (bundled)
daily-data.json     — Pre-fetched daily price history (bundled)
```

**Script load order matters** (dependency chain):
`config.js` → `utils.js` → `data.js` → `indicators.js` → `backtest.js` → `chart.js` → `optimize.js` → `ui.js`

## Architecture

1. **Config** (`js/config.js`): TICKERS array, STRATEGIES object, global `state` object, data caches
2. **Utils** (`js/utils.js`): Pure helper functions with no dependencies
3. **Data** (`js/data.js`): Loads bundled JSON files, fetches from Yahoo Finance via CORS proxies
4. **Indicators** (`js/indicators.js`): Technical indicator calculations (EMA, RSI, MACD)
5. **Backtest** (`js/backtest.js`): All strategy backtesting + portfolio aggregation
6. **Chart** (`js/chart.js`): Canvas rendering with overlay support for indicators
7. **Optimize** (`js/optimize.js`): Portfolio optimization engine using Float64Arrays for performance
8. **UI** (`js/ui.js`): DOM manipulation, event handlers, initialization (runs on load)

## Ticker Selection

Dynamic search bar filters from the `TICKERS` array in `js/config.js`. Each ticker has `symbol`, `yahoo` (API ticker), and `name`. Crypto tickers use Yahoo Finance format (e.g. `BTC-USD`).

Current tickers: AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, GLD, SLV, VOO, SPY, BTC, ETH

## Adding New Features

- **New tickers**: Add to `TICKERS` array in `js/config.js`
- **New strategies**: Add config to `STRATEGIES` in `js/config.js`, create backtest function in `js/backtest.js`, add case in `backtestSingle()` and `backtestSingleWithParams()`, add chart overlay in `js/chart.js` if needed
- **Chart modifications**: Edit `drawChart()` in `js/chart.js`
- **New UI controls**: Add HTML in `index.html`, wire events in `js/ui.js`
