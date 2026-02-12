// DOM Elements
const tickerSearch = document.getElementById('ticker-search');
const tickerDropdown = document.getElementById('ticker-dropdown');
const addTickerBtn = document.getElementById('add-ticker-btn');
const portfolioListEl = document.getElementById('portfolio-list');
const allocationFill = document.getElementById('allocation-fill');
const allocationStatus = document.getElementById('allocation-status');
const amountInput = document.getElementById('amount');
const amountLabel = document.getElementById('amount-label');
const amountHint = document.getElementById('amount-hint');
const yearsSlider = document.getElementById('years');
const yearsDisplay = document.getElementById('years-display');
const resultsCard = document.querySelector('.results-card');
const breakdownToggle = document.getElementById('breakdown-toggle');
const breakdownList = document.getElementById('breakdown-list');
const strategySelectBtn = document.getElementById('strategy-select-btn');
const strategyBtnText = document.getElementById('strategy-btn-text');
const strategyDropdown = document.getElementById('strategy-dropdown');

// --- Portfolio management UI ---
function renderPortfolioList() {
  const list = portfolioListEl;
  list.innerHTML = '';

  if (state.portfolio.length === 0) {
    list.innerHTML = '<div class="portfolio-empty">Add a stock to get started</div>';
  }

  state.portfolio.forEach((entry, idx) => {
    const div = document.createElement('div');
    div.className = 'portfolio-entry';
    div.innerHTML = `
      <span class="pe-symbol">${entry.symbol}</span>
      <span class="pe-name">${entry.name}</span>
      <input type="text" class="portfolio-alloc-input" value="${entry.allocation}" data-idx="${idx}" inputmode="numeric">
      <span class="pe-pct-label">%</span>
      <button class="remove-ticker-btn" data-idx="${idx}">&times;</button>
    `;
    list.appendChild(div);
  });

  // Wire allocation inputs
  list.querySelectorAll('.portfolio-alloc-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const val = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
      state.portfolio[idx].allocation = val;
      updateAllocationBar();
      updateResults();
    });
    input.addEventListener('blur', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      e.target.value = state.portfolio[idx].allocation;
    });
    input.addEventListener('focus', (e) => {
      e.target.select();
    });
  });

  // Wire remove buttons
  list.querySelectorAll('.remove-ticker-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      removeTickerFromPortfolio(idx);
    });
  });

  updateAllocationBar();
}

function updateAllocationBar() {
  const total = getTotalAllocation();
  allocationFill.style.width = Math.min(total, 100) + '%';

  if (total === 100) {
    allocationFill.className = 'allocation-fill ok';
    allocationStatus.textContent = `Total: ${total}%`;
    allocationStatus.className = 'allocation-status';
  } else if (total > 100) {
    allocationFill.className = 'allocation-fill over';
    allocationStatus.textContent = `Total: ${total}% (over 100%)`;
    allocationStatus.className = 'allocation-status warn';
  } else {
    allocationFill.className = 'allocation-fill under';
    allocationStatus.textContent = `Total: ${total}%`;
    allocationStatus.className = 'allocation-status';
  }
}

async function addTickerToPortfolio(ticker) {
  // Silently ignore duplicates
  if (state.portfolio.some(e => e.symbol === ticker.symbol)) return;

  const remaining = Math.max(0, 100 - getTotalAllocation());
  const allocation = remaining > 0 ? remaining : 10;

  const entry = {
    symbol: ticker.symbol,
    yahoo: ticker.yahoo,
    name: ticker.name,
    allocation,
    data: null
  };

  state.portfolio.push(entry);
  renderPortfolioList();

  // Fetch data
  resultsCard.classList.add('loading');
  entry.data = await fetchStockData(ticker.yahoo);
  resultsCard.classList.remove('loading');
  updateResults();
}

function removeTickerFromPortfolio(idx) {
  state.portfolio.splice(idx, 1);
  renderPortfolioList();
  updateResults();
}

// Load data for all portfolio tickers
async function loadPortfolioData() {
  resultsCard.classList.add('loading');
  await Promise.all(
    state.portfolio.map(async (entry) => {
      entry.data = await fetchStockData(entry.yahoo);
    })
  );
  resultsCard.classList.remove('loading');
  updateResults();
}

// Update results display
function updateResults() {
  const results = calculate();

  if (!results || results.noSignals) {
    document.getElementById('total-contributed').textContent = results && results.noSignals ? '$0' : (state.portfolio.length === 0 ? '-' : 'No data');
    document.getElementById('final-value').textContent = results && results.noSignals ? '$0' : (state.portfolio.length === 0 ? '-' : 'No data');
    document.getElementById('max-drawdown').textContent = '-';
    document.getElementById('total-return').textContent = '-';
    document.getElementById('profit-text').innerHTML = results && results.noSignals ? 'No signals in this period' : '';
    drawChart(null);
    updateChartLegend(null);
    renderBreakdown(results ? results.perTickerResults : null);
    return;
  }

  document.getElementById('total-contributed').textContent = formatCurrency(results.totalInvested);
  document.getElementById('final-value').textContent = formatCurrency(results.finalValue);

  const profitSign = results.profit >= 0 ? '+' : '';
  const returnClass = results.returnPercent >= 0 ? 'positive' : 'negative';
  document.getElementById('profit-text').innerHTML = `Profit: ${profitSign}${formatCurrency(results.profit)} <span class="${returnClass}">(${formatPercent(results.returnPercent)})</span>`;

  const drawdownEl = document.getElementById('max-drawdown');
  drawdownEl.textContent = results.maxDrawdown.toFixed(1) + '%';
  drawdownEl.className = 'result-value negative';

  const totalReturnEl = document.getElementById('total-return');
  const annualizedReturn = results.returnPercent / state.years;
  totalReturnEl.textContent = formatPercent(annualizedReturn) + '/yr';
  totalReturnEl.className = `result-value ${annualizedReturn >= 0 ? 'positive' : 'negative'}`;

  updateChartLegend(results);
  drawChart(results);
  renderBreakdown(results.perTickerResults);
}

// Render per-ticker breakdown
function renderBreakdown(perTickerResults) {
  if (!perTickerResults || perTickerResults.length <= 1) {
    breakdownToggle.style.display = 'none';
    breakdownList.classList.remove('open');
    breakdownList.innerHTML = '';
    return;
  }

  breakdownToggle.style.display = '';
  breakdownList.innerHTML = '';

  for (const ptr of perTickerResults) {
    const r = ptr.result;
    const div = document.createElement('div');
    div.className = 'breakdown-entry';

    if (!r || r.noSignals) {
      div.innerHTML = `
        <div class="breakdown-header">
          <span class="bh-ticker">${ptr.symbol}</span>
          <span class="bh-alloc">${ptr.allocation}%</span>
        </div>
        <div class="breakdown-details">
          <span class="bd-label">Status</span>
          <span class="bd-value">${r && r.noSignals ? 'No signals' : 'No data'}</span>
        </div>`;
    } else {
      const sign = ptr.priceChange >= 0 ? '+' : '';
      div.innerHTML = `
        <div class="breakdown-header">
          <span class="bh-ticker">${ptr.symbol}</span>
          <span class="bh-alloc">${ptr.allocation}%</span>
        </div>
        <div class="breakdown-details">
          <span class="bd-label">Current Price</span>
          <span class="bd-value">$${ptr.currentPrice.toFixed(2)} (${sign}${ptr.percentChange.toFixed(2)}%)</span>
          <span class="bd-label">Value</span>
          <span class="bd-value">${formatCurrency(r.finalValue)}</span>
          <span class="bd-label">Invested</span>
          <span class="bd-value">${formatCurrency(r.totalInvested)}</span>
          <span class="bd-label">Shares</span>
          <span class="bd-value">${r.totalShares.toFixed(4)}</span>
          <span class="bd-label">Avg Cost</span>
          <span class="bd-value">$${r.avgCostPerShare.toFixed(2)}</span>
          <span class="bd-label">Max Drawdown</span>
          <span class="bd-value">${r.maxDrawdown.toFixed(1)}%</span>
        </div>`;
    }
    breakdownList.appendChild(div);
  }
}

// Update chart legend based on strategy mode
function updateChartLegend(results) {
  const legend = document.querySelector('.chart-legend');
  const baseLegend = `
    <div class="legend-item">
      <div class="legend-dot typical"></div>
      <span>Portfolio Value</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot" style="background: #d4cfc4;"></div>
      <span>Total Invested</span>
    </div>`;

  if (!results || state.portfolio.length !== 1) {
    legend.innerHTML = baseLegend;
    return;
  }

  if (results.isEma) {
    legend.innerHTML = baseLegend + `
      <div class="legend-item">
        <div class="legend-dot" style="background: #8b9dc3;"></div>
        <span>Stock Price</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #c4713b;"></div>
        <span>${results.emaPeriod} EMA</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #5a7a5a;"></div>
        <span>Buy Signal</span>
      </div>`;
  } else if (results.isEmaCrossover) {
    legend.innerHTML = baseLegend + `
      <div class="legend-item">
        <div class="legend-dot" style="background: #8b9dc3;"></div>
        <span>Stock Price</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #c4713b;"></div>
        <span>50 EMA</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #7a5c8a;"></div>
        <span>200 EMA</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #5a7a5a;"></div>
        <span>Buy Signal</span>
      </div>`;
  } else if (results.isRsi) {
    legend.innerHTML = baseLegend + `
      <div class="legend-item">
        <div class="legend-dot" style="background: #8b9dc3;"></div>
        <span>Stock Price</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #c4713b;"></div>
        <span>RSI(14)</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #5a7a5a;"></div>
        <span>Buy Signal</span>
      </div>`;
  } else if (results.isMacd) {
    legend.innerHTML = baseLegend + `
      <div class="legend-item">
        <div class="legend-dot" style="background: #8b9dc3;"></div>
        <span>Stock Price</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #c4713b;"></div>
        <span>MACD</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #7a5c8a;"></div>
        <span>Signal</span>
      </div>
      <div class="legend-item">
        <div class="legend-dot" style="background: #5a7a5a;"></div>
        <span>Buy Signal</span>
      </div>`;
  } else {
    legend.innerHTML = baseLegend;
  }
}

// --- Ticker search dropdown ---
function renderDropdown(filter) {
  const query = filter.toLowerCase();
  const matches = TICKERS.filter(t =>
    t.symbol.toLowerCase().includes(query) ||
    t.name.toLowerCase().includes(query)
  );

  tickerDropdown.innerHTML = '';
  matches.forEach(t => {
    const div = document.createElement('div');
    div.className = 'ticker-option';
    const inPortfolio = state.portfolio.some(e => e.symbol === t.symbol);
    div.innerHTML = `<span class="ticker-symbol">${t.symbol}${inPortfolio ? ' \u2713' : ''}</span><span class="ticker-name">${t.name}</span>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectTicker(t);
    });
    tickerDropdown.appendChild(div);
  });

  if (matches.length > 0) {
    tickerDropdown.classList.add('open');
    tickerSearch.classList.add('has-focus');
  } else {
    tickerDropdown.classList.remove('open');
    tickerSearch.classList.remove('has-focus');
  }
}

function selectTicker(t) {
  pendingTicker = t;
  tickerSearch.value = `${t.symbol} - ${t.name}`;
  tickerDropdown.classList.remove('open');
  tickerSearch.classList.remove('has-focus');
  addTickerBtn.disabled = false;

  // If ticker already in portfolio, disable button
  if (state.portfolio.some(e => e.symbol === t.symbol)) {
    addTickerBtn.disabled = true;
  }
}

tickerSearch.addEventListener('focus', () => {
  tickerSearch.value = '';
  pendingTicker = null;
  addTickerBtn.disabled = true;
  renderDropdown('');
});

tickerSearch.addEventListener('input', () => {
  pendingTicker = null;
  addTickerBtn.disabled = true;
  renderDropdown(tickerSearch.value);
});

tickerSearch.addEventListener('blur', () => {
  tickerDropdown.classList.remove('open');
  tickerSearch.classList.remove('has-focus');
  if (pendingTicker) {
    tickerSearch.value = `${pendingTicker.symbol} - ${pendingTicker.name}`;
  } else {
    tickerSearch.value = '';
  }
});

// Handle Enter key in search to add ticker
tickerSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && pendingTicker && !addTickerBtn.disabled) {
    e.preventDefault();
    addTickerBtn.click();
  }
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ticker-search-wrapper')) {
    tickerDropdown.classList.remove('open');
    tickerSearch.classList.remove('has-focus');
  }
});

// Add ticker button
addTickerBtn.addEventListener('click', () => {
  if (!pendingTicker) return;
  addTickerToPortfolio(pendingTicker);
  pendingTicker = null;
  tickerSearch.value = '';
  addTickerBtn.disabled = true;
});

// Breakdown toggle
breakdownToggle.addEventListener('click', () => {
  breakdownToggle.classList.toggle('open');
  breakdownList.classList.toggle('open');
});

// --- Strategy dropdown ---
function renderStrategyDropdown() {
  strategyDropdown.innerHTML = '';
  for (const [key, cfg] of Object.entries(STRATEGIES)) {
    const div = document.createElement('div');
    div.className = 'strategy-option' + (key === state.style ? ' selected' : '');
    div.dataset.value = key;
    div.innerHTML = `<div class="so-name">${cfg.name}</div><div class="so-desc">${cfg.desc}</div>`;
    div.addEventListener('mousedown', (e) => {
      e.preventDefault();
      selectStrategy(key);
    });
    strategyDropdown.appendChild(div);
  }
}

function selectStrategy(key) {
  const cfg = STRATEGIES[key];
  state.style = key;
  strategyBtnText.textContent = cfg.name;
  amountLabel.textContent = cfg.amountLabel;
  amountHint.textContent = cfg.amountHint;
  amountInput.value = cfg.defaultAmount.toLocaleString();
  state.amount = cfg.defaultAmount;

  // Close dropdown
  strategyDropdown.classList.remove('open');
  strategySelectBtn.classList.remove('open');

  // Update selected state in dropdown
  strategyDropdown.querySelectorAll('.strategy-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.value === key);
  });

  updateResults();
}

strategySelectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = strategyDropdown.classList.contains('open');
  if (isOpen) {
    strategyDropdown.classList.remove('open');
    strategySelectBtn.classList.remove('open');
  } else {
    strategyDropdown.classList.add('open');
    strategySelectBtn.classList.add('open');
  }
});

// Close strategy dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.strategy-select-wrapper')) {
    strategyDropdown.classList.remove('open');
    strategySelectBtn.classList.remove('open');
  }
});

renderStrategyDropdown();

amountInput.addEventListener('input', (e) => {
  const value = e.target.value.replace(/[^0-9]/g, '');
  state.amount = parseInt(value) || 0;
  updateResults();
});

amountInput.addEventListener('blur', (e) => {
  if (state.amount > 0) {
    e.target.value = state.amount.toLocaleString();
  }
});

amountInput.addEventListener('focus', (e) => {
  e.target.value = state.amount || '';
});

yearsSlider.addEventListener('input', (e) => {
  state.years = parseInt(e.target.value);
  yearsDisplay.textContent = state.years;
  updateResults();
});

// Handle window resize for chart
window.addEventListener('resize', () => {
  if (state.mode === 'simulate') updateResults();
});

// === MODE SWITCHING ===
function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  document.getElementById('simulate-layout').style.display = mode === 'simulate' ? '' : 'none';
  document.getElementById('optimize-layout').style.display = mode === 'optimize' ? '' : 'none';
}

document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

// === OPTIMIZE MODE ===
const optimizeTargetInput = document.getElementById('optimize-target');
const optimizeYearsSlider = document.getElementById('optimize-years');
const optimizeYearsDisplay = document.getElementById('optimize-years-display');
const runOptimizeBtn = document.getElementById('run-optimize-btn');
const optimizeStatus = document.getElementById('optimize-status');
const optimizeStatusText = document.getElementById('optimize-status-text');
const optimizeProgressFill = document.getElementById('optimize-progress-fill');
const optimizeResultsContainer = document.getElementById('optimize-results-container');

optimizeTargetInput.addEventListener('input', (e) => {
  state.optimizeTargetReturn = parseFloat(e.target.value) || 0;
});
optimizeTargetInput.addEventListener('blur', (e) => {
  e.target.value = state.optimizeTargetReturn;
});
optimizeTargetInput.addEventListener('focus', (e) => {
  e.target.select();
});

optimizeYearsSlider.addEventListener('input', (e) => {
  state.optimizeYears = parseInt(e.target.value);
  optimizeYearsDisplay.textContent = state.optimizeYears;
});

document.querySelectorAll('.complexity-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.complexity-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.optimizeComplexity = parseInt(btn.dataset.complexity);
  });
});

let optimizeRunning = false;

runOptimizeBtn.addEventListener('click', async () => {
  if (optimizeRunning) return;
  optimizeRunning = true;
  runOptimizeBtn.disabled = true;
  runOptimizeBtn.textContent = 'Running...';
  optimizeStatus.classList.add('visible');
  optimizeResultsContainer.innerHTML = '<div class="optimize-empty">Searching...</div>';

  try {
    const results = await runOptimization(
      state.optimizeTargetReturn,
      state.optimizeYears,
      state.optimizeComplexity,
      (tested, total, statusMsg) => {
        if (statusMsg) {
          optimizeStatusText.textContent = statusMsg;
          optimizeProgressFill.style.width = '0%';
        } else {
          const pct = Math.round((tested / total) * 100);
          optimizeStatusText.textContent = `Testing portfolio ${tested} of ${total} (${pct}%)`;
          optimizeProgressFill.style.width = pct + '%';
        }
      }
    );
    renderOptimizeResults(results, state.optimizeTargetReturn);
  } catch (e) {
    optimizeResultsContainer.innerHTML = `<div class="optimize-empty">Error: ${e.message}</div>`;
  }

  optimizeRunning = false;
  runOptimizeBtn.disabled = false;
  runOptimizeBtn.textContent = 'Find Best Portfolios';
  optimizeStatus.classList.remove('visible');
  optimizeProgressFill.style.width = '0%';
});

// Initial load
renderPortfolioList();
loadPortfolioData();
