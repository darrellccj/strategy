// Backtest DCA strategy with daily data
function backtestDCA(dailyData, monthlyAmount, yearsAgo) {
  const relevantData = sliceDailyFromYearsAgo(dailyData, yearsAgo);
  if (relevantData.length < 2) return null;

  let totalShares = 0;
  let totalInvested = 0;
  const portfolioValues = [];
  let lastBuyMonth = -1;
  let lastBuyYear = -1;

  for (let i = 0; i < relevantData.length; i++) {
    const d = relevantData[i].date;
    const price = relevantData[i].price;
    const month = d.getUTCMonth();
    const year = d.getUTCFullYear();

    // Buy on first trading day of each new calendar month
    if (month !== lastBuyMonth || year !== lastBuyYear) {
      const sharesBought = monthlyAmount / price;
      totalShares += sharesBought;
      totalInvested += monthlyAmount;
      lastBuyMonth = month;
      lastBuyYear = year;
    }

    portfolioValues.push({
      date: d,
      value: totalShares * price,
      invested: totalInvested
    });
  }

  const finalPrice = relevantData[relevantData.length - 1].price;
  const finalValue = totalShares * finalPrice;
  const profit = finalValue - totalInvested;
  const returnPercent = ((finalValue - totalInvested) / totalInvested) * 100;

  return {
    totalInvested,
    finalValue,
    profit,
    returnPercent,
    totalShares,
    avgCostPerShare: totalInvested / totalShares,
    maxDrawdown: computeMaxDrawdown(portfolioValues),
    portfolioValues,
    investedValues: portfolioValues.map(v => v.invested)
  };
}

// Backtest lump sum strategy with daily data
function backtestLumpSum(dailyData, amount, yearsAgo) {
  const relevantData = sliceDailyFromYearsAgo(dailyData, yearsAgo);
  if (relevantData.length < 2) return null;

  const buyPrice = relevantData[0].price;
  const shares = amount / buyPrice;
  const portfolioValues = [];

  for (let i = 0; i < relevantData.length; i++) {
    portfolioValues.push({
      date: relevantData[i].date,
      value: shares * relevantData[i].price,
      invested: amount
    });
  }

  const finalPrice = relevantData[relevantData.length - 1].price;
  const finalValue = shares * finalPrice;

  return {
    totalInvested: amount,
    finalValue,
    profit: finalValue - amount,
    returnPercent: ((finalValue - amount) / amount) * 100,
    totalShares: shares,
    avgCostPerShare: buyPrice,
    maxDrawdown: computeMaxDrawdown(portfolioValues),
    portfolioValues,
    investedValues: portfolioValues.map(() => amount)
  };
}

// Backtest EMA touch strategy (daily tracking)
function backtestEMA(dailyData, buyAmount, yearsAgo, period = 200) {
  if (!dailyData || dailyData.length < period) return null;

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsAgo);

  const prefetchDays = period + 100;
  const prefetchDate = new Date(cutoffDate);
  prefetchDate.setDate(prefetchDate.getDate() - prefetchDays);

  let prefetchIdx = 0;
  for (let i = 0; i < dailyData.length; i++) {
    if (dailyData[i].date >= prefetchDate) { prefetchIdx = i; break; }
  }

  const slicedDaily = dailyData.slice(prefetchIdx);
  const emaValues = calculateEMA(slicedDaily, period);
  if (emaValues.length === 0) return null;

  let rangeStartIdx = 0;
  for (let i = 0; i < slicedDaily.length; i++) {
    if (slicedDaily[i].date >= cutoffDate) { rangeStartIdx = i; break; }
  }
  if (rangeStartIdx < 1 || rangeStartIdx >= emaValues.length) return null;

  let totalShares = 0;
  let totalInvested = 0;
  let buyCount = 0;
  const buySignals = [];
  const portfolioValues = [];

  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (emaValues[i] !== null && emaValues[i - 1] !== null) {
      const prevPrice = slicedDaily[i - 1].price;
      const prevEMA = emaValues[i - 1];
      const currentPrice = slicedDaily[i].price;
      const currentEMA = emaValues[i];

      if (prevPrice > prevEMA && currentPrice <= currentEMA) {
        totalShares += buyAmount / currentPrice;
        totalInvested += buyAmount;
        buyCount++;
        buySignals.push({ date: slicedDaily[i].date, price: currentPrice });
      }
    }

    portfolioValues.push({
      date: slicedDaily[i].date,
      value: totalShares * slicedDaily[i].price,
      invested: totalInvested
    });
  }

  if (buyCount === 0) return { noSignals: true };

  const lastPrice = slicedDaily[slicedDaily.length - 1].price;
  const finalValue = totalShares * lastPrice;

  const chartEmaData = [];
  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (emaValues[i] !== null) {
      chartEmaData.push({ date: slicedDaily[i].date, price: slicedDaily[i].price, ema: emaValues[i] });
    }
  }

  return {
    totalInvested,
    finalValue,
    profit: finalValue - totalInvested,
    returnPercent: totalInvested > 0 ? ((finalValue - totalInvested) / totalInvested) * 100 : 0,
    totalShares,
    avgCostPerShare: totalInvested / totalShares,
    maxDrawdown: computeMaxDrawdown(portfolioValues),
    portfolioValues,
    investedValues: portfolioValues.map(v => v.invested),
    buyCount,
    buySignals,
    emaData: chartEmaData,
    isEma: true,
    emaPeriod: period
  };
}

// Backtest EMA Crossover (golden cross: short EMA crosses above long EMA)
function backtestEMACrossover(dailyData, buyAmount, yearsAgo, shortPeriod = 50, longPeriod = 200) {
  if (!dailyData || dailyData.length < longPeriod) return null;

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsAgo);

  const prefetchDays = longPeriod + 100;
  const prefetchDate = new Date(cutoffDate);
  prefetchDate.setDate(prefetchDate.getDate() - prefetchDays);

  let prefetchIdx = 0;
  for (let i = 0; i < dailyData.length; i++) {
    if (dailyData[i].date >= prefetchDate) { prefetchIdx = i; break; }
  }

  const slicedDaily = dailyData.slice(prefetchIdx);
  const shortEMA = calculateEMA(slicedDaily, shortPeriod);
  const longEMA = calculateEMA(slicedDaily, longPeriod);
  if (shortEMA.length === 0 || longEMA.length === 0) return null;

  let rangeStartIdx = 0;
  for (let i = 0; i < slicedDaily.length; i++) {
    if (slicedDaily[i].date >= cutoffDate) { rangeStartIdx = i; break; }
  }
  if (rangeStartIdx < 1 || rangeStartIdx >= shortEMA.length || rangeStartIdx >= longEMA.length) return null;

  let totalShares = 0;
  let totalInvested = 0;
  let buyCount = 0;
  const buySignals = [];
  const portfolioValues = [];

  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (shortEMA[i] !== null && longEMA[i] !== null && shortEMA[i - 1] !== null && longEMA[i - 1] !== null) {
      // Golden cross: short was below long, now above
      if (shortEMA[i - 1] <= longEMA[i - 1] && shortEMA[i] > longEMA[i]) {
        totalShares += buyAmount / slicedDaily[i].price;
        totalInvested += buyAmount;
        buyCount++;
        buySignals.push({ date: slicedDaily[i].date, price: slicedDaily[i].price });
      }
    }

    portfolioValues.push({
      date: slicedDaily[i].date,
      value: totalShares * slicedDaily[i].price,
      invested: totalInvested
    });
  }

  if (buyCount === 0) return { noSignals: true };

  const lastPrice = slicedDaily[slicedDaily.length - 1].price;
  const finalValue = totalShares * lastPrice;

  // Build overlay data with both EMAs
  const chartEmaData = [];
  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (shortEMA[i] !== null && longEMA[i] !== null) {
      chartEmaData.push({
        date: slicedDaily[i].date,
        price: slicedDaily[i].price,
        emaShort: shortEMA[i],
        emaLong: longEMA[i]
      });
    }
  }

  return {
    totalInvested,
    finalValue,
    profit: finalValue - totalInvested,
    returnPercent: totalInvested > 0 ? ((finalValue - totalInvested) / totalInvested) * 100 : 0,
    totalShares,
    avgCostPerShare: totalInvested / totalShares,
    maxDrawdown: computeMaxDrawdown(portfolioValues),
    portfolioValues,
    investedValues: portfolioValues.map(v => v.invested),
    buyCount,
    buySignals,
    emaData: chartEmaData,
    isEmaCrossover: true
  };
}

// Backtest RSI Mean Reversion
function backtestRSI(dailyData, buyAmount, yearsAgo, period = 14, threshold = 30) {
  if (!dailyData || dailyData.length < period + 1) return null;

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsAgo);

  const prefetchDays = period + 50;
  const prefetchDate = new Date(cutoffDate);
  prefetchDate.setDate(prefetchDate.getDate() - prefetchDays);

  let prefetchIdx = 0;
  for (let i = 0; i < dailyData.length; i++) {
    if (dailyData[i].date >= prefetchDate) { prefetchIdx = i; break; }
  }

  const slicedDaily = dailyData.slice(prefetchIdx);
  const rsiValues = calculateRSI(slicedDaily, period);
  if (rsiValues.length === 0) return null;

  let rangeStartIdx = 0;
  for (let i = 0; i < slicedDaily.length; i++) {
    if (slicedDaily[i].date >= cutoffDate) { rangeStartIdx = i; break; }
  }
  if (rangeStartIdx < 1 || rangeStartIdx >= rsiValues.length) return null;

  let totalShares = 0;
  let totalInvested = 0;
  let buyCount = 0;
  const buySignals = [];
  const portfolioValues = [];
  let cooldown = 0;

  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (cooldown > 0) cooldown--;

    if (rsiValues[i] !== null && rsiValues[i - 1] !== null && cooldown === 0) {
      // Buy when RSI first crosses below threshold
      if (rsiValues[i - 1] >= threshold && rsiValues[i] < threshold) {
        totalShares += buyAmount / slicedDaily[i].price;
        totalInvested += buyAmount;
        buyCount++;
        buySignals.push({ date: slicedDaily[i].date, price: slicedDaily[i].price });
        cooldown = 5; // 5-day cooldown between signals
      }
    }

    portfolioValues.push({
      date: slicedDaily[i].date,
      value: totalShares * slicedDaily[i].price,
      invested: totalInvested
    });
  }

  if (buyCount === 0) return { noSignals: true };

  const lastPrice = slicedDaily[slicedDaily.length - 1].price;
  const finalValue = totalShares * lastPrice;

  // Build RSI overlay data
  const chartRsiData = [];
  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (rsiValues[i] !== null) {
      chartRsiData.push({
        date: slicedDaily[i].date,
        price: slicedDaily[i].price,
        rsi: rsiValues[i]
      });
    }
  }

  return {
    totalInvested,
    finalValue,
    profit: finalValue - totalInvested,
    returnPercent: totalInvested > 0 ? ((finalValue - totalInvested) / totalInvested) * 100 : 0,
    totalShares,
    avgCostPerShare: totalInvested / totalShares,
    maxDrawdown: computeMaxDrawdown(portfolioValues),
    portfolioValues,
    investedValues: portfolioValues.map(v => v.invested),
    buyCount,
    buySignals,
    rsiData: chartRsiData,
    isRsi: true
  };
}

// Backtest MACD Divergence
function backtestMACD(dailyData, buyAmount, yearsAgo, fast = 12, slow = 26, signal = 9) {
  if (!dailyData || dailyData.length < slow + signal) return null;

  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsAgo);

  const prefetchDays = slow + signal + 50;
  const prefetchDate = new Date(cutoffDate);
  prefetchDate.setDate(prefetchDate.getDate() - prefetchDays);

  let prefetchIdx = 0;
  for (let i = 0; i < dailyData.length; i++) {
    if (dailyData[i].date >= prefetchDate) { prefetchIdx = i; break; }
  }

  const slicedDaily = dailyData.slice(prefetchIdx);
  const macdResult = calculateMACD(slicedDaily, fast, slow, signal);
  if (!macdResult) return null;

  const { macdLine, signalLine } = macdResult;

  let rangeStartIdx = 0;
  for (let i = 0; i < slicedDaily.length; i++) {
    if (slicedDaily[i].date >= cutoffDate) { rangeStartIdx = i; break; }
  }
  if (rangeStartIdx < 1 || rangeStartIdx >= macdLine.length) return null;

  let totalShares = 0;
  let totalInvested = 0;
  let buyCount = 0;
  const buySignals = [];
  const portfolioValues = [];

  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null && macdLine[i - 1] !== null && signalLine[i - 1] !== null) {
      // Bullish crossover: MACD crosses above signal
      if (macdLine[i - 1] <= signalLine[i - 1] && macdLine[i] > signalLine[i]) {
        totalShares += buyAmount / slicedDaily[i].price;
        totalInvested += buyAmount;
        buyCount++;
        buySignals.push({ date: slicedDaily[i].date, price: slicedDaily[i].price });
      }
    }

    portfolioValues.push({
      date: slicedDaily[i].date,
      value: totalShares * slicedDaily[i].price,
      invested: totalInvested
    });
  }

  if (buyCount === 0) return { noSignals: true };

  const lastPrice = slicedDaily[slicedDaily.length - 1].price;
  const finalValue = totalShares * lastPrice;

  // Build MACD overlay data
  const chartMacdData = [];
  for (let i = rangeStartIdx; i < slicedDaily.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      chartMacdData.push({
        date: slicedDaily[i].date,
        price: slicedDaily[i].price,
        macd: macdLine[i],
        signal: signalLine[i]
      });
    }
  }

  return {
    totalInvested,
    finalValue,
    profit: finalValue - totalInvested,
    returnPercent: totalInvested > 0 ? ((finalValue - totalInvested) / totalInvested) * 100 : 0,
    totalShares,
    avgCostPerShare: totalInvested / totalShares,
    maxDrawdown: computeMaxDrawdown(portfolioValues),
    portfolioValues,
    investedValues: portfolioValues.map(v => v.invested),
    buyCount,
    buySignals,
    macdData: chartMacdData,
    isMacd: true
  };
}

// Run backtest for a single ticker entry
function backtestSingle(entry, amount) {
  const data = entry.data;
  if (!data || !data.dailyData || data.dailyData.length === 0) return null;

  switch (state.style) {
    case 'dca':
      return backtestDCA(data.dailyData, amount, state.years);
    case 'lump':
      return backtestLumpSum(data.dailyData, amount, state.years);
    case 'ema50':
      return backtestEMA(data.dailyData, amount, state.years, 50);
    case 'ema100':
      return backtestEMA(data.dailyData, amount, state.years, 100);
    case 'ema200':
      return backtestEMA(data.dailyData, amount, state.years, 200);
    case 'emaCrossover':
      return backtestEMACrossover(data.dailyData, amount, state.years);
    case 'rsi':
      return backtestRSI(data.dailyData, amount, state.years);
    case 'macd':
      return backtestMACD(data.dailyData, amount, state.years);
    default:
      return null;
  }
}

// Calculate aggregate portfolio results
function calculate() {
  const portfolio = state.portfolio;
  if (portfolio.length === 0) return null;

  const totalAlloc = getTotalAllocation();
  if (totalAlloc === 0) return null;

  const perTickerResults = [];
  let anyData = false;
  let allNoSignals = true;

  for (const entry of portfolio) {
    const tickerAmount = state.amount * (entry.allocation / totalAlloc);
    const result = backtestSingle(entry, tickerAmount);
    perTickerResults.push({
      symbol: entry.symbol,
      name: entry.name,
      allocation: entry.allocation,
      currentPrice: entry.data ? entry.data.currentPrice : 0,
      priceChange: entry.data ? entry.data.priceChange : 0,
      percentChange: entry.data ? entry.data.percentChange : 0,
      result
    });
    if (result && !result.noSignals) {
      anyData = true;
      allNoSignals = false;
    }
  }

  if (!anyData) {
    if (allNoSignals && perTickerResults.some(p => p.result && p.result.noSignals)) {
      return { noSignals: true, perTickerResults };
    }
    return null;
  }

  // Find shortest common timeline length
  let minLen = Infinity;
  for (const ptr of perTickerResults) {
    if (ptr.result && ptr.result.portfolioValues && !ptr.result.noSignals) {
      minLen = Math.min(minLen, ptr.result.portfolioValues.length);
    }
  }
  if (minLen === Infinity || minLen === 0) return null;

  // Aggregate portfolio values
  const aggregateValues = [];
  let aggregateTotalInvested = 0;
  let aggregateFinalValue = 0;

  for (let i = 0; i < minLen; i++) {
    let sumValue = 0;
    let sumInvested = 0;
    let date = null;
    for (const ptr of perTickerResults) {
      if (ptr.result && ptr.result.portfolioValues && !ptr.result.noSignals) {
        const pv = ptr.result.portfolioValues[i];
        sumValue += pv.value;
        sumInvested += pv.invested;
        if (!date) date = pv.date;
      }
    }
    aggregateValues.push({ date, value: sumValue, invested: sumInvested });
  }

  for (const ptr of perTickerResults) {
    if (ptr.result && !ptr.result.noSignals) {
      aggregateTotalInvested += ptr.result.totalInvested;
      aggregateFinalValue += ptr.result.finalValue;
    }
  }

  const profit = aggregateFinalValue - aggregateTotalInvested;
  const returnPercent = aggregateTotalInvested > 0 ? ((aggregateFinalValue - aggregateTotalInvested) / aggregateTotalInvested) * 100 : 0;

  // Aggregate max drawdown
  const maxDrawdown = computeMaxDrawdown(aggregateValues);

  // For single-ticker portfolios, pass through overlay data
  let overlayData = {};
  if (portfolio.length === 1 && perTickerResults[0].result) {
    const r = perTickerResults[0].result;
    if (r.isEma) {
      overlayData = { emaData: r.emaData, isEma: true, emaPeriod: r.emaPeriod, buySignals: r.buySignals, buyCount: r.buyCount };
    } else if (r.isEmaCrossover) {
      overlayData = { emaData: r.emaData, isEmaCrossover: true, buySignals: r.buySignals, buyCount: r.buyCount };
    } else if (r.isRsi) {
      overlayData = { rsiData: r.rsiData, isRsi: true, buySignals: r.buySignals, buyCount: r.buyCount };
    } else if (r.isMacd) {
      overlayData = { macdData: r.macdData, isMacd: true, buySignals: r.buySignals, buyCount: r.buyCount };
    }
  }

  return {
    totalInvested: aggregateTotalInvested,
    finalValue: aggregateFinalValue,
    profit,
    returnPercent,
    maxDrawdown,
    portfolioValues: aggregateValues,
    perTickerResults,
    ...overlayData
  };
}

// Portfolio management
function getTotalAllocation() {
  return state.portfolio.reduce((sum, e) => sum + e.allocation, 0);
}
