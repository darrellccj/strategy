# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Investment Simulator - a single-page web application for backtesting stock investment strategies using historical data. Users can simulate Dollar Cost Averaging (DCA) or Lump Sum investment strategies across different time periods.

## Technology Stack

- Pure HTML5/CSS/JavaScript (no frameworks or build tools)
- Single-file application: `index.html` (hosted via GitHub Pages)
- Yahoo Finance API via CORS proxy fallback chain for historical stock data
- Canvas API for chart rendering

## Running the Application

Open `index.html` directly in a browser. No build process or server required. Also deployed at `https://darrellccj.github.io/strategy/`.

## Architecture

The application is organized into three layers within a single HTML file:

1. **Presentation (HTML/CSS)**: Two-column responsive layout with input controls on the left and results/chart on the right. Responsive breakpoints at 400px, 768px, and 1024px.

2. **Logic (JavaScript)**:
   - State object tracks user selections (ticker, yahooTicker, investment style, amount, years)
   - `backtestDCA()` - simulates monthly contributions over time
   - `backtestLumpSum()` - simulates one-time investment
   - `drawChart()` - renders historical portfolio value on canvas

3. **Data Layer**:
   - `fetchWithProxy()` - tries multiple CORS proxies in order (allorigins.win, then corsproxy.io)
   - `fetchStockData()` - retrieves 10 years of monthly close prices from Yahoo Finance
   - In-memory `dataCache` prevents redundant API calls
   - Fallback data returned if all proxies fail

## Ticker Selection

Dynamic search bar filters from the `TICKERS` array. Each ticker has a display `symbol`, a `yahoo` ticker (for API calls), and a `name`. Crypto tickers use Yahoo Finance format (e.g. `BTC-USD` for Bitcoin).

Current tickers: AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA, GLD, SLV, VOO, SPY, BTC, ETH

## Adding New Features

- **New tickers**: Add an entry to the `TICKERS` array with `symbol`, `yahoo`, and `name` fields
- **New investment strategies**: Create a backtest function following the pattern of `backtestDCA`/`backtestLumpSum`, add a case in `calculate()`, and add a toggle button in HTML
- **Chart modifications**: Edit `drawChart()` which uses Canvas 2D context with device pixel ratio scaling
