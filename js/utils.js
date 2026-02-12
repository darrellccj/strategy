// Format currency
function formatCurrency(value) {
  if (value >= 1000000) {
    return '$' + (value / 1000000).toFixed(2) + 'M';
  }
  return '$' + Math.round(value).toLocaleString();
}

// Format percentage
function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

// Slice daily data from cutoff
function sliceDailyFromYearsAgo(dailyData, yearsAgo) {
  const now = new Date();
  const cutoffDate = new Date(now);
  cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsAgo);
  let startIdx = 0;
  for (let i = 0; i < dailyData.length; i++) {
    if (dailyData[i].date >= cutoffDate) {
      startIdx = i;
      break;
    }
  }
  return dailyData.slice(startIdx);
}

// Max drawdown helper
function computeMaxDrawdown(portfolioValues) {
  let peak = 0;
  let maxDrawdown = 0;
  for (const pv of portfolioValues) {
    if (pv.value > peak) peak = pv.value;
    if (peak > 0) {
      const dd = (pv.value - peak) / peak;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }
  }
  return maxDrawdown * 100;
}

// Chart sampling utility
function sampleForChart(portfolioValues, targetPoints = 120) {
  if (portfolioValues.length <= targetPoints) return portfolioValues;
  const sampled = [];
  for (let i = 0; i < targetPoints; i++) {
    const idx = Math.round((i / (targetPoints - 1)) * (portfolioValues.length - 1));
    sampled.push(portfolioValues[idx]);
  }
  return sampled;
}
