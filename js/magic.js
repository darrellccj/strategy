// Magic Formula (Greenblatt) — loads fundamentals and renders ranking table

let magicFormulaData = null;
let magicFormulaPromise = null;
let magicFormulaLoaded = false;

async function loadMagicFormula() {
  if (magicFormulaLoaded) return magicFormulaData;
  if (magicFormulaPromise) return magicFormulaPromise;

  magicFormulaPromise = (async () => {
    try {
      const res = await fetch('data/fundamentals.json');
      if (!res.ok) throw new Error('fundamentals.json not found');
      const json = await res.json();
      magicFormulaData = json;
    } catch (e) {
      console.log('Magic Formula data not available:', e.message);
      magicFormulaData = { updated: '', rankings: [] };
    }
    magicFormulaLoaded = true;
    return magicFormulaData;
  })();

  return magicFormulaPromise;
}

// Returns array of top N ticker symbols by Magic Formula ranking
function getMagicFormulaTop(n) {
  if (!magicFormulaData || !magicFormulaData.rankings) return [];
  return magicFormulaData.rankings.slice(0, n).map(r => r.symbol);
}

// Get full rankings, optionally filtered
function getMagicFormulaRankings(sectorFilter, marketCapFilter) {
  if (!magicFormulaData || !magicFormulaData.rankings) return [];
  let rankings = magicFormulaData.rankings;

  if (sectorFilter && sectorFilter !== 'all') {
    rankings = rankings.filter(r => r.sector === sectorFilter);
  }

  if (marketCapFilter && marketCapFilter !== 'all') {
    if (marketCapFilter === 'large') {
      rankings = rankings.filter(r => r.marketCap >= 10e9);
    } else if (marketCapFilter === 'mid') {
      rankings = rankings.filter(r => r.marketCap >= 2e9 && r.marketCap < 10e9);
    } else if (marketCapFilter === 'small') {
      rankings = rankings.filter(r => r.marketCap < 2e9);
    }
  }

  return rankings;
}

// Get unique sectors from rankings
function getMagicFormulaSectors() {
  if (!magicFormulaData || !magicFormulaData.rankings) return [];
  const sectors = new Set(magicFormulaData.rankings.map(r => r.sector).filter(Boolean));
  return Array.from(sectors).sort();
}

async function renderMagicFormulaTab() {
  const container = document.getElementById('magic-results-container');
  if (!container) return;

  if (!magicFormulaLoaded) {
    container.innerHTML = '<div class="magic-loading">Loading Magic Formula data...</div>';
    await loadMagicFormula();
  }

  const sectorSelect = document.getElementById('magic-sector-filter');
  const capSelect = document.getElementById('magic-cap-filter');
  const sectorFilter = sectorSelect ? sectorSelect.value : 'all';
  const capFilter = capSelect ? capSelect.value : 'all';

  // Populate sector filter
  if (sectorSelect && sectorSelect.options.length <= 1) {
    const sectors = getMagicFormulaSectors();
    sectors.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sectorSelect.appendChild(opt);
    });
  }

  const rankings = getMagicFormulaRankings(sectorFilter, capFilter);

  if (rankings.length === 0) {
    container.innerHTML = '<div class="magic-empty">No Magic Formula data available. Run the update script with FMP_API_KEY to fetch fundamentals.</div>';
    return;
  }

  let html = `<div class="magic-updated">Last updated: ${magicFormulaData.updated ? new Date(magicFormulaData.updated).toLocaleDateString() : 'N/A'}</div>`;
  html += '<div class="magic-table-wrap"><table class="magic-table">';
  html += '<thead><tr><th>Rank</th><th>Symbol</th><th>Name</th><th>Sector</th><th>Earnings Yield</th><th>Return on Capital</th><th>Combined Score</th></tr></thead>';
  html += '<tbody>';

  rankings.forEach((r, i) => {
    html += `<tr>
      <td class="magic-rank">${i + 1}</td>
      <td class="magic-symbol">${r.symbol}</td>
      <td class="magic-name">${r.name || ''}</td>
      <td class="magic-sector">${r.sector || ''}</td>
      <td class="magic-ey">${(r.earningsYield * 100).toFixed(1)}%</td>
      <td class="magic-roc">${(r.returnOnCapital * 100).toFixed(1)}%</td>
      <td class="magic-combined">${r.combinedRank}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// Add top N Magic Formula tickers to portfolio with equal allocation
function addMagicFormulaToPortfolio(n) {
  const topSymbols = getMagicFormulaTop(n);
  if (topSymbols.length === 0) return;

  const allocation = Math.floor(100 / topSymbols.length);
  let remainder = 100 - (allocation * topSymbols.length);

  state.portfolio = [];
  topSymbols.forEach((sym, i) => {
    const ticker = TICKERS.find(t => t.symbol === sym);
    if (ticker) {
      const alloc = allocation + (i === 0 ? remainder : 0);
      state.portfolio.push({
        symbol: ticker.symbol,
        yahoo: ticker.yahoo,
        name: ticker.name,
        allocation: alloc,
        data: null
      });
    }
  });

  renderPortfolioList();
  switchMode('simulate');
  loadPortfolioData();
}

// Set optimizer pool to Magic Formula top N and switch to optimize tab
function useMagicFormulaInOptimizer(n) {
  state.optimizePool = 'magic' + n;
  // Update pool button UI
  document.querySelectorAll('.pool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pool === state.optimizePool);
  });
  switchMode('optimize');
}
