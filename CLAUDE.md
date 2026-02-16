# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Growth Investing Simulator - a web application for backtesting stock investment strategies using historical data. Users can simulate various strategies (DCA, Lump Sum, EMA, RSI, MACD) across different time periods, build multi-asset portfolios, run an optimizer to find portfolios matching a target return, and view Greenblatt's Magic Formula stock rankings.

## Technology Stack

- Pure HTML5/CSS/JavaScript (no frameworks or build tools)
- No ES modules — all JS files use global scope, loaded via `<script>` tags in dependency order
- Yahoo Finance API via CORS proxy fallback chain for historical stock data
- Financial Modeling Prep API for fundamentals (Magic Formula)
- Canvas API for chart rendering
- Hosted via GitHub Pages

## Running the Application

Open `index.html` directly in a browser. No build process or server required. Also deployed at `https://darrellccj.github.io/strategy/`.

## Data Architecture

Ticker data is split into per-ticker files for lazy loading (500+ tickers):

```
data/
  index.json            — Ticker catalog: symbol, yahoo, name, sector (~30KB)
  meta.json             — Current prices for all tickers (~50KB)
  fundamentals.json     — Magic Formula metrics, pre-computed
  daily/
    AAPL.json           — Per-ticker daily prices (~100-200KB each)
    MSFT.json
    ...                 — 500+ files
data.json               — Legacy bundled metadata (backwards compat)
daily-data.json         — Legacy bundled daily prices (backwards compat)
scripts/
  tickers.json          — Master ticker list (S&P 500 + ETFs + crypto)
  update-data.js        — Node.js script to fetch and update all data
  fetch-data.js         — Legacy fetch script
```

Data loading order: `data/index.json` + `data/meta.json` (eager on startup) → `data/daily/{ticker}.json` (lazy on demand) → legacy bundled files → Yahoo Finance CORS proxy (fallback).

## File Structure

```
index.html          — HTML structure with 4 tabs (Simulate, Optimize, FIRE, Magic Formula)
styles.css          — All CSS
js/
  config.js         — TICKERS (dynamic from index.json), STRATEGIES, state, caches, CORS_PROXIES
  utils.js          — formatCurrency, formatPercent, sliceDailyFromYearsAgo, computeMaxDrawdown, sampleForChart
  data.js           — loadTickerIndex, loadMetaData, loadTickerDailyData, loadMultipleTickers, fetchStockData, legacy loaders
  indicators.js     — calculateEMA, calculateRSI, calculateMACD
  backtest.js       — backtestDCA, backtestLumpSum, backtestEMA, backtestEMACrossover, backtestRSI, backtestMACD, backtestSingle, calculate, getTotalAllocation
  chart.js          — drawChart (with drawOverlayLine, drawPriceOverlay helpers)
  optimize.js       — calculateTWR, calculateRiskScore, computeRiskFromValues, backtestSingleWithParams, ensureTickersLoaded, runOptimization (with tickerPool param), renderOptimizeResults
  magic.js          — loadMagicFormula, getMagicFormulaTop, getMagicFormulaRankings, renderMagicFormulaTab, addMagicFormulaToPortfolio, useMagicFormulaInOptimizer
  ui.js             — All DOM refs, event handlers, portfolio UI, ticker search (debounced, capped at 30), strategy dropdown, mode switching, optimizer pool selector, initialization
```

**Script load order matters** (dependency chain):
`config.js` → `utils.js` → `data.js` → `indicators.js` → `backtest.js` → `chart.js` → `optimize.js` → `magic.js` → `ui.js`

## Architecture

1. **Config** (`js/config.js`): TICKERS array (populated from data/index.json), STRATEGIES object, global `state` object, data caches
2. **Utils** (`js/utils.js`): Pure helper functions with no dependencies
3. **Data** (`js/data.js`): Lazy-loads per-ticker daily data, falls back to legacy bundled files, then Yahoo Finance CORS proxies
4. **Indicators** (`js/indicators.js`): Technical indicator calculations (EMA, RSI, MACD)
5. **Backtest** (`js/backtest.js`): All strategy backtesting + portfolio aggregation
6. **Chart** (`js/chart.js`): Canvas rendering with overlay support for indicators
7. **Optimize** (`js/optimize.js`): Portfolio optimization engine using Float64Arrays. Accepts a `tickerPool` parameter to limit search space.
8. **Magic** (`js/magic.js`): Greenblatt's Magic Formula rankings from `data/fundamentals.json`. Provides top-N stock picks for portfolio building and optimizer pool.
9. **UI** (`js/ui.js`): DOM manipulation, event handlers, initialization (runs on load)

## Ticker Selection

Dynamic search bar filters from the `TICKERS` array (loaded from `data/index.json`). Each ticker has `symbol`, `yahoo` (API ticker), `name`, and `sector`. Crypto tickers use Yahoo Finance format (e.g. `BTC-USD`). Search is debounced (150ms) and capped at 30 visible results.

500+ tickers: S&P 500 + major ETFs + crypto (BTC, ETH, SOL).

## Optimizer Pool System

The optimizer can search different ticker pools:
- **Portfolio** — only tickers in current portfolio (default, existing behavior)
- **All Tickers** — all 500+ tickers
- **MF Top 10/20/30** — top Magic Formula ranked stocks

## Updating Data

Run `node scripts/update-data.js` to refresh all data. Set `FMP_API_KEY` env variable for Magic Formula fundamentals.

GitHub Action (`.github/workflows/update-data.yml`) runs weekly on Sunday at 6 AM UTC.

## Adding New Features

- **New tickers**: Add to `scripts/tickers.json`, re-run update script
- **New strategies**: Add config to `STRATEGIES` in `js/config.js`, create backtest function in `js/backtest.js`, add case in `backtestSingle()` and `backtestSingleWithParams()`, add chart overlay in `js/chart.js` if needed
- **Chart modifications**: Edit `drawChart()` in `js/chart.js`
- **New UI controls**: Add HTML in `index.html`, wire events in `js/ui.js`
