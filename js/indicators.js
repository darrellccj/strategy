// Calculate EMA from daily price data for any period
function calculateEMA(dailyData, period) {
  if (dailyData.length < period) return [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += dailyData[i].price;
  }
  const emaValues = new Array(period - 1).fill(null);
  let ema = sum / period;
  emaValues.push(ema);

  for (let i = period; i < dailyData.length; i++) {
    ema = (dailyData[i].price - ema) * multiplier + ema;
    emaValues.push(ema);
  }
  return emaValues;
}

// Calculate RSI (Wilder's smoothed)
function calculateRSI(dailyData, period = 14) {
  if (dailyData.length < period + 1) return [];
  const rsiValues = new Array(period).fill(null);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = dailyData[i].price - dailyData[i - 1].price;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs)));

  for (let i = period + 1; i < dailyData.length; i++) {
    const change = dailyData[i].price - dailyData[i - 1].price;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(avgLoss === 0 ? 100 : 100 - (100 / (1 + rs2)));
  }
  return rsiValues;
}

// Calculate MACD
function calculateMACD(dailyData, fast = 12, slow = 26, signal = 9) {
  const fastEMA = calculateEMA(dailyData, fast);
  const slowEMA = calculateEMA(dailyData, slow);
  if (fastEMA.length === 0 || slowEMA.length === 0) return null;

  // MACD line = fast EMA - slow EMA
  const macdLine = [];
  for (let i = 0; i < dailyData.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  // Signal line = EMA of MACD line
  // Build temp array of non-null MACD values for EMA calculation
  const macdNonNull = [];
  const macdIndices = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      macdNonNull.push({ price: macdLine[i] });
      macdIndices.push(i);
    }
  }

  const signalRaw = calculateEMA(macdNonNull, signal);
  const signalLine = new Array(dailyData.length).fill(null);
  for (let i = 0; i < signalRaw.length; i++) {
    if (signalRaw[i] !== null) {
      signalLine[macdIndices[i]] = signalRaw[i];
    }
  }

  // Histogram
  const histogram = [];
  for (let i = 0; i < dailyData.length; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram.push(macdLine[i] - signalLine[i]);
    } else {
      histogram.push(null);
    }
  }

  return { macdLine, signalLine, histogram };
}
