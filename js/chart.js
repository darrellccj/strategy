// Draw the chart
function drawChart(results) {
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const height = rect.height || 200;
  canvas.width = rect.width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  if (!results || !results.portfolioValues || results.portfolioValues.length === 0) {
    ctx.fillStyle = '#9a8d79';
    ctx.font = '14px "Times New Roman", Times, serif';
    ctx.textAlign = 'center';
    ctx.fillText('No historical data available', width / 2, height / 2);
    return;
  }

  // Sample for performance
  const values = sampleForChart(results.portfolioValues);
  const allValues = values.map(v => v.value).concat(values.map(v => v.invested));
  const maxValue = Math.max(...allValues);
  const minValue = 0;

  const scaleX = (i) => padding.left + (i / (values.length - 1)) * chartWidth;
  const scaleY = (v) => padding.top + chartHeight - ((v - minValue) / (maxValue - minValue)) * chartHeight;

  // Grid lines
  ctx.strokeStyle = '#e5e0d5';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = '#9a8d79';
  ctx.font = '11px "Times New Roman", Times, serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const value = minValue + ((4 - i) / 4) * (maxValue - minValue);
    const y = padding.top + (i / 4) * chartHeight;
    ctx.fillText(formatCurrency(value), padding.left - 8, y);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const labelCount = Math.min(5, values.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i / (labelCount - 1)) * (values.length - 1));
    const x = scaleX(idx);
    const date = values[idx].date;
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    ctx.fillText(label, x, height - padding.bottom + 8);
  }

  // Invested line (dashed)
  ctx.strokeStyle = '#d4cfc4';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = scaleX(i);
    const y = scaleY(v.invested);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Portfolio value line
  ctx.strokeStyle = '#a08c6d';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = scaleX(i);
    const y = scaleY(v.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill area between lines
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = scaleX(i);
    const y = scaleY(v.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  for (let i = values.length - 1; i >= 0; i--) {
    ctx.lineTo(scaleX(i), scaleY(values[i].invested));
  }
  ctx.closePath();
  ctx.fillStyle = results.returnPercent >= 0 ? 'rgba(90, 122, 90, 0.15)' : 'rgba(139, 90, 90, 0.15)';
  ctx.fill();

  // --- Overlays (single-ticker only) ---
  if (state.portfolio.length !== 1) return;

  // Helper to draw sampled overlay line
  function drawOverlayLine(data, getY, color, dashed) {
    const sampled = sampleForChart(data);
    const oScaleX = (i) => padding.left + (i / (sampled.length - 1)) * chartWidth;

    let oMin = Infinity, oMax = -Infinity;
    for (const d of sampled) {
      const v = getY(d);
      if (v < oMin) oMin = v;
      if (v > oMax) oMax = v;
    }
    const range = oMax - oMin;
    oMin -= range * 0.05;
    oMax += range * 0.05;
    const oScaleY = (v) => padding.top + chartHeight - ((v - oMin) / (oMax - oMin)) * chartHeight;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([6, 4]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(getY(sampled[i]));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    return { oScaleX, oScaleY, sampled, oMin, oMax };
  }

  // Helper for dual-scale overlay (price + indicator on same scale)
  function drawPriceOverlay(data, getPrice, extras) {
    const sampled = sampleForChart(data);
    let pMin = Infinity, pMax = -Infinity;
    for (const d of sampled) {
      const p = getPrice(d);
      if (p < pMin) pMin = p;
      if (p > pMax) pMax = p;
      for (const fn of extras) {
        const v = fn(d);
        if (v < pMin) pMin = v;
        if (v > pMax) pMax = v;
      }
    }
    const range = pMax - pMin;
    pMin -= range * 0.05;
    pMax += range * 0.05;

    const oScaleX = (i) => padding.left + (i / (sampled.length - 1)) * chartWidth;
    const oScaleY = (v) => padding.top + chartHeight - ((v - pMin) / (pMax - pMin)) * chartHeight;

    // Stock price
    ctx.strokeStyle = '#8b9dc3';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(getPrice(sampled[i]));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    return { oScaleX, oScaleY, sampled };
  }

  // EMA Touch overlay
  if (results.isEma && results.emaData && results.emaData.length > 0) {
    const { oScaleX, oScaleY, sampled } = drawPriceOverlay(results.emaData, d => d.price, [d => d.ema]);

    // EMA line (dashed orange)
    ctx.strokeStyle = '#c4713b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(sampled[i].ema);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // EMA Crossover overlay
  if (results.isEmaCrossover && results.emaData && results.emaData.length > 0) {
    const { oScaleX, oScaleY, sampled } = drawPriceOverlay(results.emaData, d => d.price, [d => d.emaShort, d => d.emaLong]);

    // Short EMA (orange)
    ctx.strokeStyle = '#c4713b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(sampled[i].emaShort);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Long EMA (purple, dashed)
    ctx.strokeStyle = '#7a5c8a';
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(sampled[i].emaLong);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // RSI overlay
  if (results.isRsi && results.rsiData && results.rsiData.length > 0) {
    // Price line
    drawPriceOverlay(results.rsiData, d => d.price, []);

    // RSI on its own scale (0-100)
    const sampled = sampleForChart(results.rsiData);
    const oScaleX = (i) => padding.left + (i / (sampled.length - 1)) * chartWidth;
    const oScaleY = (v) => padding.top + chartHeight - ((v - 0) / (100 - 0)) * chartHeight;

    // RSI line
    ctx.strokeStyle = '#c4713b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(sampled[i].rsi);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Threshold line at RSI 30
    ctx.strokeStyle = 'rgba(139, 90, 90, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const threshY = oScaleY(30);
    ctx.beginPath();
    ctx.moveTo(padding.left, threshY);
    ctx.lineTo(width - padding.right, threshY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // MACD overlay
  if (results.isMacd && results.macdData && results.macdData.length > 0) {
    // Price line
    drawPriceOverlay(results.macdData, d => d.price, []);

    // MACD and signal on their own scale
    const sampled = sampleForChart(results.macdData);
    let mMin = Infinity, mMax = -Infinity;
    for (const d of sampled) {
      if (d.macd < mMin) mMin = d.macd;
      if (d.macd > mMax) mMax = d.macd;
      if (d.signal < mMin) mMin = d.signal;
      if (d.signal > mMax) mMax = d.signal;
    }
    const range = mMax - mMin;
    mMin -= range * 0.05;
    mMax += range * 0.05;

    const oScaleX = (i) => padding.left + (i / (sampled.length - 1)) * chartWidth;
    const oScaleY = (v) => padding.top + chartHeight - ((v - mMin) / (mMax - mMin)) * chartHeight;

    // MACD line
    ctx.strokeStyle = '#c4713b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(sampled[i].macd);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Signal line (purple, dashed)
    ctx.strokeStyle = '#7a5c8a';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < sampled.length; i++) {
      const x = oScaleX(i);
      const y = oScaleY(sampled[i].signal);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
