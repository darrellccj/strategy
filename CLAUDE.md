# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Investment Simulator - a single-page web application for backtesting stock investment strategies using historical data. Users can simulate Dollar Cost Averaging (DCA) or Lump Sum investment strategies across different time periods.

## Technology Stack

- Pure HTML5/CSS/JavaScript (no frameworks or build tools)
- Single-file application: `investment-simulator.html`
- Yahoo Finance API via CORS proxy (`corsproxy.io`) for historical stock data
- Canvas API for chart rendering

## Running the Application

Open `investment-simulator.html` directly in a browser. No build process or server required.

## Architecture

The application is organized into three layers within a single HTML file:

1. **Presentation (HTML/CSS)**: Two-column responsive layout with input controls on the left and results/chart on the right. Responsive breakpoints at 400px, 768px, and 1024px.

2. **Logic (JavaScript)**:
   - State object tracks user selections (ticker, investment style, amount, years)
   - `backtestDCA()` - simulates monthly contributions over time
   - `backtestLumpSum()` - simulates one-time investment
   - `drawChart()` - renders historical portfolio value on canvas

3. **Data Layer**:
   - `fetchStockData()` - retrieves 10 years of monthly close prices from Yahoo Finance
   - In-memory caching prevents redundant API calls
   - Fallback data available if API fails

## Current Stock Tickers

GOOGL, MSFT, NVDA, PLTR (hardcoded in HTML buttons and JavaScript)

## Adding New Features

- **New tickers**: Add button in HTML, update JavaScript ticker handling
- **New investment strategies**: Add to the backtest functions following existing DCA/Lump Sum patterns
- **Chart modifications**: Edit `drawChart()` function which uses Canvas 2D context
