function calculateRiskScore(maxDrawdown, volatility) {
  return Math.abs(maxDrawdown) * 0.6 + volatility * 0.4;
}

// Time-Weighted Return: chain-links sub-period returns between cash flows
// This eliminates the bias of when capital is deployed (fair across DCA vs Lump Sum)
function calculateTWR(portfolioValues) {
  if (!portfolioValues || portfolioValues.length < 2) return 0;
  let twr = 1;
  for (let i = 1; i < portfolioValues.length; i++) {
    const prevVal = portfolioValues[i - 1].value;
    const currVal = portfolioValues[i].value;
    const cashFlow = portfolioValues[i].invested - portfolioValues[i - 1].invested;
    // Sub-period return: growth of existing assets before new cash flow
    const startVal = prevVal + cashFlow;
    if (startVal > 0) {
      twr *= (currVal / startVal);
    }
  }
  return (twr - 1) * 100; // total TWR as percentage
}

// Backtest a single ticker with explicit strategy and years (doesn't use state)
function backtestSingleWithParams(tickerData, amount, strategy, years) {
  if (!tickerData || !tickerData.dailyData || tickerData.dailyData.length === 0) return null;
  switch (strategy) {
    case 'dca': return backtestDCA(tickerData.dailyData, amount, years);
    case 'lump': return backtestLumpSum(tickerData.dailyData, amount, years);
    case 'ema50': return backtestEMA(tickerData.dailyData, amount, years, 50);
    case 'ema100': return backtestEMA(tickerData.dailyData, amount, years, 100);
    case 'ema200': return backtestEMA(tickerData.dailyData, amount, years, 200);
    case 'emaCrossover': return backtestEMACrossover(tickerData.dailyData, amount, years);
    case 'rsi': return backtestRSI(tickerData.dailyData, amount, years);
    case 'macd': return backtestMACD(tickerData.dailyData, amount, years);
    default: return null;
  }
}

async function ensureAllTickersLoaded() {
  if (!bundledDataLoaded) {
    if (!bundledDataPromise) bundledDataPromise = loadBundledData();
    await bundledDataPromise;
  }
  if (!dailyDataLoaded) {
    if (!dailyDataPromise) dailyDataPromise = loadDailyData();
    await dailyDataPromise;
  }
  const missing = TICKERS.filter(t => !dataCache[t.yahoo] || !dataCache[t.yahoo].dailyData || dataCache[t.yahoo].dailyData.length === 0);
  if (missing.length > 0) {
    await Promise.all(missing.map(t => fetchStockData(t.yahoo)));
  }
}

// Compute drawdown + volatility in one pass from a flat Float64Array
function computeRiskFromValues(values, len) {
  let peak = 0, maxDD = 0, prevVal = 0;
  let sumRet = 0, sumRetSq = 0, retCount = 0;
  for (let i = 0; i < len; i++) {
    const val = values[i];
    if (val > peak) peak = val;
    if (peak > 0) {
      const dd = (val - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
    if (i > 0 && prevVal > 0) {
      const r = (val - prevVal) / prevVal;
      sumRet += r;
      sumRetSq += r * r;
      retCount++;
    }
    prevVal = val;
  }
  const maxDrawdown = maxDD * 100;
  const meanRet = retCount > 0 ? sumRet / retCount : 0;
  const variance = retCount > 0 ? (sumRetSq / retCount) - (meanRet * meanRet) : 0;
  const volatility = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252) * 100;
  return { maxDrawdown, volatility };
}

async function runOptimization(targetReturn, years, complexity, progressCallback) {
  await ensureAllTickersLoaded();

  const strategyKeys = Object.keys(STRATEGIES);
  const defaultAmount = 1000;

  // Phase 1: Pre-compute all (ticker, strategy) backtests with amount=1
  // Store as flat Float64Arrays for fast inner-loop access
  progressCallback(0, 1, 'Pre-computing backtests...');
  const btCache = {};
  const validTickers = [];

  for (const t of TICKERS) {
    const tickerData = dataCache[t.yahoo];
    if (!tickerData || !tickerData.dailyData || tickerData.dailyData.length === 0) continue;
    btCache[t.yahoo] = {};
    let hasAnyResult = false;
    for (const stratKey of strategyKeys) {
      const result = backtestSingleWithParams(tickerData, 1, stratKey, years);
      if (result && !result.noSignals && result.portfolioValues && result.portfolioValues.length > 0 && result.totalInvested > 0) {
        const pv = result.portfolioValues;
        const len = pv.length;
        const values = new Float64Array(len);
        const invested = new Float64Array(len);
        for (let i = 0; i < len; i++) {
          values[i] = pv[i].value;
          invested[i] = pv[i].invested;
        }
        const twrPct = calculateTWR(pv);
        btCache[t.yahoo][stratKey] = {
          totalInvested: result.totalInvested,
          finalValue: result.finalValue,
          twrPct,
          values,
          invested,
          len
        };
        hasAnyResult = true;
      }
    }
    if (hasAnyResult) validTickers.push(t);
  }

  if (validTickers.length === 0) {
    progressCallback(1, 1);
    return [];
  }

  await new Promise(resolve => setTimeout(resolve, 0));

  // Maintain a bounded top-10 list sorted by distance to target
  const results = [];
  let worstDist = Infinity; // distance threshold for 10th best result

  function addResult(entry) {
    const dist = Math.abs(entry.annualizedReturn - targetReturn);
    if (results.length >= 10 && dist >= worstDist) return;
    entry._dist = dist;
    results.push(entry);
    results.sort((a, b) => a._dist - b._dist);
    if (results.length > 10) results.length = 10;
    worstDist = results[results.length - 1]._dist;
  }

  const qt = validTickers;

  if (complexity === 1) {
    // Single asset: use cached scalars, compute risk once per (ticker, strategy)
    const total = qt.length * strategyKeys.length;
    let tested = 0;
    for (const t of qt) {
      for (const stratKey of strategyKeys) {
        tested++;
        const c = btCache[t.yahoo] && btCache[t.yahoo][stratKey];
        if (!c) continue;
        const annRet = c.twrPct / years;
        const risk = computeRiskFromValues(c.values, c.len);
        const riskScore = calculateRiskScore(risk.maxDrawdown, risk.volatility);
        addResult({
          strategy: stratKey,
          strategyName: STRATEGIES[stratKey].name,
          allocations: [{ symbol: t.symbol, allocation: 100 }],
          annualizedReturn: annRet,
          maxDrawdown: risk.maxDrawdown,
          volatility: risk.volatility,
          riskScore,
          totalInvested: c.totalInvested * defaultAmount,
          finalValue: c.finalValue * defaultAmount
        });
      }
    }
    progressCallback(total, total);

  } else if (complexity === 2) {
    // 2-asset: batch all 9 allocation splits per (pair, strategy) in one array pass
    const allocSteps = [90, 80, 70, 60, 50, 40, 30, 20, 10];
    const numSplits = allocSteps.length;
    let pairsDone = 0;
    const totalPairs = (qt.length * (qt.length - 1)) / 2;

    for (let i = 0; i < qt.length; i++) {
      for (let j = i + 1; j < qt.length; j++) {
        pairsDone++;

        for (const stratKey of strategyKeys) {
          const cA = btCache[qt[i].yahoo] && btCache[qt[i].yahoo][stratKey];
          const cB = btCache[qt[j].yahoo] && btCache[qt[j].yahoo][stratKey];
          if (!cA || !cB) continue;

          // Quick skip: if no blend of these two can be closer than current top 10
          const retA = cA.twrPct / years, retB = cB.twrPct / years;
          const blendMin = Math.min(retA, retB), blendMax = Math.max(retA, retB);
          const closestPossible = targetReturn < blendMin ? blendMin - targetReturn
            : targetReturn > blendMax ? targetReturn - blendMax : 0;
          if (results.length >= 10 && closestPossible >= worstDist) continue;

          const minLen = Math.min(cA.len, cB.len);
          const vA = cA.values, vB = cB.values;
          const iA = cA.invested, iB = cB.invested;

          // Pre-compute scales — all splits share the same scale factors
          const scalesA = new Float64Array(numSplits);
          const scalesB = new Float64Array(numSplits);
          for (let s = 0; s < numSplits; s++) {
            scalesA[s] = defaultAmount * allocSteps[s] / 100;
            scalesB[s] = defaultAmount * (100 - allocSteps[s]) / 100;
          }

          // Single pass: compute TWR, drawdown, volatility for all splits
          const twrs = new Float64Array(numSplits).fill(1);
          const peaks = new Float64Array(numSplits);
          const maxDDs = new Float64Array(numSplits);
          const prevVals = new Float64Array(numSplits);
          const prevInvs = new Float64Array(numSplits);
          const sumRets = new Float64Array(numSplits);
          const sumRetSqs = new Float64Array(numSplits);
          let retCount = 0;

          for (let k = 0; k < minLen; k++) {
            const va = vA[k], vb = vB[k];
            const ia = iA[k], ib = iB[k];
            for (let s = 0; s < numSplits; s++) {
              const val = va * scalesA[s] + vb * scalesB[s];
              const inv = ia * scalesA[s] + ib * scalesB[s];

              // TWR: chain-link sub-period returns accounting for cash flows
              if (k > 0) {
                const cashFlow = inv - prevInvs[s];
                const startVal = prevVals[s] + cashFlow;
                if (startVal > 0) twrs[s] *= (val / startVal);
              }

              if (val > peaks[s]) peaks[s] = val;
              if (peaks[s] > 0) {
                const dd = (val - peaks[s]) / peaks[s];
                if (dd < maxDDs[s]) maxDDs[s] = dd;
              }
              if (k > 0 && prevVals[s] > 0) {
                const r = (val - prevVals[s]) / prevVals[s];
                sumRets[s] += r;
                sumRetSqs[s] += r * r;
              }
              prevVals[s] = val;
              prevInvs[s] = inv;
            }
            if (k > 0) retCount++;
          }

          for (let s = 0; s < numSplits; s++) {
            const annRet = ((twrs[s] - 1) * 100) / years;
            const maxDrawdown = maxDDs[s] * 100;
            const meanRet = retCount > 0 ? sumRets[s] / retCount : 0;
            const variance = retCount > 0 ? (sumRetSqs[s] / retCount) - (meanRet * meanRet) : 0;
            const vol = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252) * 100;
            const riskScore = calculateRiskScore(maxDrawdown, vol);
            addResult({
              strategy: stratKey,
              strategyName: STRATEGIES[stratKey].name,
              allocations: [
                { symbol: qt[i].symbol, allocation: allocSteps[s] },
                { symbol: qt[j].symbol, allocation: 100 - allocSteps[s] }
              ],
              annualizedReturn: annRet,
              maxDrawdown,
              volatility: vol,
              riskScore,
              totalInvested: cA.totalInvested * scalesA[s] + cB.totalInvested * scalesB[s],
              finalValue: cA.finalValue * scalesA[s] + cB.finalValue * scalesB[s]
            });
          }
        }

        if (pairsDone % 10 === 0) {
          progressCallback(pairsDone, totalPairs);
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
    progressCallback(totalPairs, totalPairs);

  } else if (complexity === 3) {
    // 3-asset: batch all allocation splits per (triplet, strategy) in one array pass
    const allocSplits = [];
    for (let a = 60; a >= 20; a -= 10) {
      for (let b = Math.min(80 - a, a); b >= 10; b -= 10) {
        const c = 100 - a - b;
        if (c >= 10 && c <= b) allocSplits.push([a, b, c]);
      }
    }
    const numSplits = allocSplits.length;
    let tripletsDone = 0;
    const totalTriplets = qt.length * (qt.length - 1) * (qt.length - 2) / 6;

    for (let i = 0; i < qt.length; i++) {
      for (let j = i + 1; j < qt.length; j++) {
        for (let m = j + 1; m < qt.length; m++) {
          tripletsDone++;

          for (const stratKey of strategyKeys) {
            const cA = btCache[qt[i].yahoo] && btCache[qt[i].yahoo][stratKey];
            const cB = btCache[qt[j].yahoo] && btCache[qt[j].yahoo][stratKey];
            const cC = btCache[qt[m].yahoo] && btCache[qt[m].yahoo][stratKey];
            if (!cA || !cB || !cC) continue;

            // Quick skip: if no blend of these three can be closer than current top 10
            const retA3 = cA.twrPct / years, retB3 = cB.twrPct / years, retC3 = cC.twrPct / years;
            const blendMin3 = Math.min(retA3, retB3, retC3), blendMax3 = Math.max(retA3, retB3, retC3);
            const closestPossible3 = targetReturn < blendMin3 ? blendMin3 - targetReturn
              : targetReturn > blendMax3 ? targetReturn - blendMax3 : 0;
            if (results.length >= 10 && closestPossible3 >= worstDist) continue;

            const minLen = Math.min(cA.len, cB.len, cC.len);
            const vA = cA.values, vB = cB.values, vC = cC.values;
            const iA = cA.invested, iB = cB.invested, iC = cC.invested;

            const scalesA = new Float64Array(numSplits);
            const scalesB = new Float64Array(numSplits);
            const scalesC = new Float64Array(numSplits);
            for (let s = 0; s < numSplits; s++) {
              scalesA[s] = defaultAmount * allocSplits[s][0] / 100;
              scalesB[s] = defaultAmount * allocSplits[s][1] / 100;
              scalesC[s] = defaultAmount * allocSplits[s][2] / 100;
            }

            const twrs = new Float64Array(numSplits).fill(1);
            const peaks = new Float64Array(numSplits);
            const maxDDs = new Float64Array(numSplits);
            const prevVals = new Float64Array(numSplits);
            const prevInvs = new Float64Array(numSplits);
            const sumRets = new Float64Array(numSplits);
            const sumRetSqs = new Float64Array(numSplits);
            let retCount = 0;

            for (let k = 0; k < minLen; k++) {
              const va = vA[k], vb = vB[k], vc = vC[k];
              const ia = iA[k], ib = iB[k], ic = iC[k];
              for (let s = 0; s < numSplits; s++) {
                const val = va * scalesA[s] + vb * scalesB[s] + vc * scalesC[s];
                const inv = ia * scalesA[s] + ib * scalesB[s] + ic * scalesC[s];

                if (k > 0) {
                  const cashFlow = inv - prevInvs[s];
                  const startVal = prevVals[s] + cashFlow;
                  if (startVal > 0) twrs[s] *= (val / startVal);
                }

                if (val > peaks[s]) peaks[s] = val;
                if (peaks[s] > 0) {
                  const dd = (val - peaks[s]) / peaks[s];
                  if (dd < maxDDs[s]) maxDDs[s] = dd;
                }
                if (k > 0 && prevVals[s] > 0) {
                  const r = (val - prevVals[s]) / prevVals[s];
                  sumRets[s] += r;
                  sumRetSqs[s] += r * r;
                }
                prevVals[s] = val;
                prevInvs[s] = inv;
              }
              if (k > 0) retCount++;
            }

            for (let s = 0; s < numSplits; s++) {
              const annRet = ((twrs[s] - 1) * 100) / years;
              if (annRet < targetReturn) continue;
              const maxDrawdown = maxDDs[s] * 100;
              const meanRet = retCount > 0 ? sumRets[s] / retCount : 0;
              const variance = retCount > 0 ? (sumRetSqs[s] / retCount) - (meanRet * meanRet) : 0;
              const vol = Math.sqrt(Math.max(0, variance)) * Math.sqrt(252) * 100;
              const riskScore = calculateRiskScore(maxDrawdown, vol);
              addResult({
                strategy: stratKey,
                strategyName: STRATEGIES[stratKey].name,
                allocations: [
                  { symbol: qt[i].symbol, allocation: allocSplits[s][0] },
                  { symbol: qt[j].symbol, allocation: allocSplits[s][1] },
                  { symbol: qt[m].symbol, allocation: allocSplits[s][2] }
                ],
                annualizedReturn: annRet,
                maxDrawdown,
                volatility: vol,
                riskScore,
                totalInvested: cA.totalInvested * scalesA[s] + cB.totalInvested * scalesB[s] + cC.totalInvested * scalesC[s],
                finalValue: cA.finalValue * scalesA[s] + cB.finalValue * scalesB[s] + cC.finalValue * scalesC[s]
              });
            }
          }

          if (tripletsDone % 10 === 0) {
            progressCallback(tripletsDone, totalTriplets);
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
      }
    }
    progressCallback(totalTriplets, totalTriplets);
  }

  // Already sorted by closest match via addResult()
  return results;
}

function renderOptimizeResults(results, targetReturn) {
  const container = optimizeResultsContainer;

  if (!results || results.length === 0) {
    container.innerHTML = `<div class="optimize-empty">No valid portfolios found for this period</div>`;
    return;
  }

  container.innerHTML = '';
  results.forEach((r, idx) => {
    const div = document.createElement('div');
    div.className = 'optimize-result-item';

    const returnClass = r.annualizedReturn >= 0 ? 'positive' : 'negative';
    const diff = r.annualizedReturn - targetReturn;
    const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%';
    const diffClass = Math.abs(diff) < 1 ? 'positive' : (Math.abs(diff) < 3 ? '' : 'negative');
    const chips = r.allocations.map(a => `<span class="ori-chip">${a.symbol} ${a.allocation}%</span>`).join('');

    div.innerHTML = `
      <div class="ori-header">
        <div class="ori-rank">${idx + 1}</div>
        <div class="ori-strategy">${r.strategyName}</div>
        <span class="ori-diff ${diffClass}">${diffStr} from target</span>
      </div>
      <div class="ori-metrics">
        <div class="ori-metric">
          <div class="ori-metric-label">Annual Return</div>
          <div class="ori-metric-value ${returnClass}">${formatPercent(r.annualizedReturn)}/yr</div>
        </div>
        <div class="ori-metric">
          <div class="ori-metric-label">Risk Score</div>
          <div class="ori-metric-value">${r.riskScore.toFixed(1)}</div>
        </div>
        <div class="ori-metric">
          <div class="ori-metric-label">Max Drawdown</div>
          <div class="ori-metric-value negative">${r.maxDrawdown.toFixed(1)}%</div>
        </div>
        <div class="ori-metric">
          <div class="ori-metric-label">Volatility</div>
          <div class="ori-metric-value">${r.volatility.toFixed(1)}%</div>
        </div>
      </div>
      <div class="ori-allocations">${chips}</div>
    `;
    container.appendChild(div);
  });
}
