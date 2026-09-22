// ============================================================
// SHIV AI TRADING - MASTER STRATEGY ENGINE
// NIFTY | 5 MIN
// HH HL LH LL + BOS + CHOCH + FVG + LIQUIDITY
// FIB GOLDEN ZONE + PRICE RANGE + EMA + RSI + VWAP + VOLUME
// ============================================================

const SETTINGS = {
  market: "NIFTY",
  timeframe: "5m",

  minimumScore: 7,
  minimumAgreement: 3,

  emaFast: 9,
  emaSlow: 21,
  rsiPeriod: 14,

  volumePeriod: 20,
  volumeMultiplier: 1.5,

  liquidityLookback: 20,
  rangeLookback: 20,
  atrPeriod: 14,

  stopATR: 1.5,
  targetATR: 3,

  swingStrength: 2
};

// ============================================================
// BASIC HELPERS
// ============================================================

function last(arr) {
  return arr && arr.length ? arr[arr.length - 1] : null;
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function normalizeCandles(candles) {
  return (candles || [])
    .map(c => ({
      time: c.time ?? c.timestamp ?? null,
      open: number(c.open),
      high: number(c.high),
      low: number(c.low),
      close: number(c.close),
      volume: number(c.volume)
    }))
    .filter(c => c.high >= c.low && c.close > 0);
}

// ============================================================
// EMA
// ============================================================

function calculateEMA(candles, period) {
  const data = normalizeCandles(candles);

  if (data.length < period) return null;

  const closes = data.map(c => c.close);

  let ema = average(closes.slice(0, period));

  const multiplier = 2 / (period + 1);

  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
  }

  return ema;
}

// ============================================================
// RSI
// ============================================================

function calculateRSI(candles, period = 14) {
  const data = normalizeCandles(candles);

  if (data.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close;

    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;

    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgLoss === 0) {
    return avgGain > 0 ? 100 : 50;
  }

  const rs = avgGain / avgLoss;

  return 100 - (100 / (1 + rs));
}

// ============================================================
// ATR
// ============================================================

function calculateATR(candles, period = 14) {
  const data = normalizeCandles(candles);

  if (data.length < period + 1) return 0;

  const trs = [];

  for (let i = 1; i < data.length; i++) {
    const current = data[i];
    const previous = data[i - 1];

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    trs.push(tr);
  }

  return average(trs.slice(-period));
}

// ============================================================
// VWAP
// ============================================================

function calculateVWAP(candles) {
  const data = normalizeCandles(candles);

  if (!data.length) return 0;

  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (const candle of data) {
    const typicalPrice =
      (candle.high + candle.low + candle.close) / 3;

    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }

  if (cumulativeVolume === 0) {
    return last(data).close;
  }

  return cumulativePV / cumulativeVolume;
}

// ============================================================
// SWING POINTS
// ============================================================

function findSwingPoints(candles, strength = 2) {
  const data = normalizeCandles(candles);

  const highs = [];
  const lows = [];

  for (let i = strength; i < data.length - strength; i++) {
    let swingHigh = true;
    let swingLow = true;

    for (let j = 1; j <= strength; j++) {
      if (
        data[i].high <= data[i - j].high ||
        data[i].high <= data[i + j].high
      ) {
        swingHigh = false;
      }

      if (
        data[i].low >= data[i - j].low ||
        data[i].low >= data[i + j].low
      ) {
        swingLow = false;
      }
    }

    if (swingHigh) {
      highs.push({
        index: i,
        price: data[i].high
      });
    }

    if (swingLow) {
      lows.push({
        index: i,
        price: data[i].low
      });
    }
  }

  return { highs, lows };
}

// ============================================================
// MARKET STRUCTURE
// HH / HL / LH / LL
// ============================================================

function detectMarketStructure(candles) {
  const data = normalizeCandles(candles);

  const swings = findSwingPoints(
    data,
    SETTINGS.swingStrength
  );

  let structure = "NEUTRAL";
  let bullish = 0;
  let bearish = 0;

  let lastHH = null;
  let lastHL = null;
  let lastLH = null;
  let lastLL = null;

  if (swings.highs.length >= 2) {
    const h1 = swings.highs[swings.highs.length - 2];
    const h2 = swings.highs[swings.highs.length - 1];

    if (h2.price > h1.price) {
      lastHH = h2.price;
      bullish++;
    } else if (h2.price < h1.price) {
      lastLH = h2.price;
      bearish++;
    }
  }

  if (swings.lows.length >= 2) {
    const l1 = swings.lows[swings.lows.length - 2];
    const l2 = swings.lows[swings.lows.length - 1];

    if (l2.price > l1.price) {
      lastHL = l2.price;
      bullish++;
    } else if (l2.price < l1.price) {
      lastLL = l2.price;
      bearish++;
    }
  }

  if (bullish >= 2) structure = "BULLISH";
  else if (bearish >= 2) structure = "BEARISH";

  return {
    structure,
    bullish,
    bearish,
    HH: lastHH,
    HL: lastHL,
    LH: lastLH,
    LL: lastLL,
    swings
  };
}

// ============================================================
// BOS
// ============================================================

function detectBOS(candles, structure) {
  const data = normalizeCandles(candles);

  if (data.length < 3) {
    return {
      signal: "NONE",
      direction: null
    };
  }

  const current = last(data);

  const previous = data.slice(
    0,
    Math.max(0, data.length - 1)
  );

  const recentHigh = Math.max(
    ...previous.slice(-20).map(c => c.high)
  );

  const recentLow = Math.min(
    ...previous.slice(-20).map(c => c.low)
  );

  if (
    current.close > recentHigh &&
    structure.structure !== "BEARISH"
  ) {
    return {
      signal: "BULLISH_BOS",
      direction: "BUY"
    };
  }

  if (
    current.close < recentLow &&
    structure.structure !== "BULLISH"
  ) {
    return {
      signal: "BEARISH_BOS",
      direction: "SELL"
    };
  }

  return {
    signal: "NONE",
    direction: null
  };
}

// ============================================================
// CHOCH
// ============================================================

function detectCHOCH(candles, structure) {
  const data = normalizeCandles(candles);

  if (data.length < 10) {
    return {
      signal: "NONE",
      direction: null
    };
  }

  const current = last(data);

  const recent = data.slice(-10, -1);

  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));

  if (
    structure.structure === "BEARISH" &&
    current.close > high
  ) {
    return {
      signal: "BULLISH_CHOCH",
      direction: "BUY"
    };
  }

  if (
    structure.structure === "BULLISH" &&
    current.close < low
  ) {
    return {
      signal: "BEARISH_CHOCH",
      direction: "SELL"
    };
  }

  return {
    signal: "NONE",
    direction: null
  };
}

// ============================================================
// FAIR VALUE GAP
// ============================================================

function detectFVG(candles) {
  const data = normalizeCandles(candles);

  if (data.length < 3) {
    return {
      signal: "NONE",
      direction: null,
      gap: null
    };
  }

  const a = data[data.length - 3];
  const b = data[data.length - 2];
  const c = data[data.length - 1];

  // Bullish FVG
  if (c.low > a.high) {
    return {
      signal: "BULLISH_FVG",
      direction: "BUY",
      gap: {
        low: a.high,
        high: c.low
      }
    };
  }

  // Bearish FVG
  if (c.high < a.low) {
    return {
      signal: "BEARISH_FVG",
      direction: "SELL",
      gap: {
        low: c.high,
        high: a.low
      }
    };
  }

  return {
    signal: "NONE",
    direction: null,
    gap: null
  };
}

// ============================================================
// LIQUIDITY SWEEP
// IMPORTANT: CURRENT CANDLE EXCLUDED
// ============================================================

function detectLiquidity(candles) {
  const data = normalizeCandles(candles);

  if (data.length < SETTINGS.liquidityLookback + 1) {
    return {
      signal: "NONE",
      direction: null
    };
  }

  const current = last(data);

  const previous = data.slice(
    -(SETTINGS.liquidityLookback + 1),
    -1
  );

  const liquidityHigh = Math.max(
    ...previous.map(c => c.high)
  );

  const liquidityLow = Math.min(
    ...previous.map(c => c.low)
  );

  // Sell-side liquidity swept
  // Price breaks below low and closes back above it
  if (
    current.low < liquidityLow &&
    current.close > liquidityLow
  ) {
    return {
      signal: "SELL_SIDE_LIQUIDITY_SWEEP",
      direction: "BUY",
      level: liquidityLow
    };
  }

  // Buy-side liquidity swept
  // Price breaks above high and closes back below it
  if (
    current.high > liquidityHigh &&
    current.close < liquidityHigh
  ) {
    return {
      signal: "BUY_SIDE_LIQUIDITY_SWEEP",
      direction: "SELL",
      level: liquidityHigh
    };
  }

  return {
    signal: "NONE",
    direction: null
  };
}

// ============================================================
// FIBONACCI GOLDEN ZONE
// 0.618 - 0.786
// ============================================================

function fibonacciZone(candles, structureData) {
  const data = normalizeCandles(candles);
  const swings = structureData.swings;

  if (
    !swings.highs.length ||
    !swings.lows.length
  ) {
    return {
      signal: "NONE",
      direction: null
    };
  }

  const high =
    swings.highs[swings.highs.length - 1];

  const low =
    swings.lows[swings.lows.length - 1];

  const current = last(data).close;

  let top;
  let bottom;
  let direction;

  if (low.index < high.index) {
    // Bullish leg
    const range = high.price - low.price;

    top = high.price - range * 0.618;
    bottom = high.price - range * 0.786;

    direction = "BUY";
  } else {
    // Bearish leg
    const range = high.price - low.price;

    top = low.price + range * 0.786;
    bottom = low.price + range * 0.618;

    direction = "SELL";
  }

  const inZone =
    current >= Math.min(bottom, top) &&
    current <= Math.max(bottom, top);

  if (!inZone) {
    return {
      signal: "NONE",
      direction: null,
      zone: {
        top,
        bottom
      }
    };
  }

  return {
    signal:
      direction === "BUY"
        ? "BULLISH_GOLDEN_ZONE"
        : "BEARISH_GOLDEN_ZONE",
    direction,
    zone: {
      top,
      bottom
    }
  };
}

// ============================================================
// PRICE RANGE
// CURRENT CANDLE EXCLUDED
// ============================================================

function priceRange(candles) {
  const data = normalizeCandles(candles);

  if (data.length < SETTINGS.rangeLookback + 1) {
    return {
      signal: "NONE",
      direction: null
    };
  }

  const current = last(data);

  const previous = data.slice(
    -(SETTINGS.rangeLookback + 1),
    -1
  );

  const high = Math.max(
    ...previous.map(c => c.high)
  );

  const low = Math.min(
    ...previous.map(c => c.low)
  );

  if (current.close > high) {
    return {
      signal: "RANGE_BREAKOUT",
      direction: "BUY",
      high,
      low
    };
  }

  if (current.close < low) {
    return {
      signal: "RANGE_BREAKDOWN",
      direction: "SELL",
      high,
      low
    };
  }

  return {
    signal: "RANGE",
    direction: null,
    high,
    low
  };
}

// ============================================================
// VOLUME
// ============================================================

function volumeSignal(candles) {
  const data = normalizeCandles(candles);

  if (data.length < SETTINGS.volumePeriod + 1) {
    return {
      signal: "NORMAL",
      direction: null
    };
  }

  const current = last(data);

  const previous = data.slice(
    -(SETTINGS.volumePeriod + 1),
    -1
  );

  const avgVolume = average(
    previous.map(c => c.volume)
  );

  if (
    avgVolume > 0 &&
    current.volume >=
      avgVolume * SETTINGS.volumeMultiplier
  ) {
    if (current.close > current.open) {
      return {
        signal: "HIGH_VOLUME_BULLISH",
        direction: "BUY"
      };
    }

    if (current.close < current.open) {
      return {
        signal: "HIGH_VOLUME_BEARISH",
        direction: "SELL"
      };
    }
  }

  return {
    signal: "NORMAL",
    direction: null
  };
}

// ============================================================
// TREND
// ============================================================

function trendFilter(candles) {
  const data = normalizeCandles(candles);

  const fastEMA = calculateEMA(
    data,
    SETTINGS.emaFast
  );

  const slowEMA = calculateEMA(
    data,
    SETTINGS.emaSlow
  );

  const current = last(data);

  if (
    fastEMA === null ||
    slowEMA === null ||
    !current
  ) {
    return {
      trend: "NEUTRAL",
      direction: null,
      fastEMA,
      slowEMA
    };
  }

  if (
    fastEMA > slowEMA &&
    current.close > fastEMA
  ) {
    return {
      trend: "BULLISH",
      direction: "BUY",
      fastEMA,
      slowEMA
    };
  }

  if (
    fastEMA < slowEMA &&
    current.close < fastEMA
  ) {
    return {
      trend: "BEARISH",
      direction: "SELL",
      fastEMA,
      slowEMA
    };
  }

  return {
    trend: "NEUTRAL",
    direction: null,
    fastEMA,
    slowEMA
  };
}

// ============================================================
// UNIQUE STRATEGY AGREEMENT
// ============================================================

function countAgreement(votes, direction) {
  const names = new Set();

  for (const vote of votes) {
    if (
      vote.direction === direction &&
      vote.strategy
    ) {
      names.add(vote.strategy);
    }
  }

  return names.size;
}

// ============================================================
// MASTER ANALYSIS
// ============================================================

function analyzeNifty(candles) {
  const data = normalizeCandles(candles);

  if (data.length < 50) {
    return {
      market: SETTINGS.market,
      timeframe: SETTINGS.timeframe,
      signal: "WAIT",
      confidence: 0,
      reason: "Not enough candle data"
    };
  }

  const current = last(data);
  const entry = current.close;

  let buyScore = 0;
  let sellScore = 0;

  const votes = [];
  const reasons = [];

  // ----------------------------------------------------------
  // MARKET STRUCTURE
  // ----------------------------------------------------------

  const structure = detectMarketStructure(data);

  if (structure.HH !== null) {
    buyScore += 1;

    votes.push({
      strategy: "MARKET_STRUCTURE_HH",
      direction: "BUY"
    });

    reasons.push("Higher High");
  }

  if (structure.HL !== null) {
    buyScore += 1;

    votes.push({
      strategy: "MARKET_STRUCTURE_HL",
      direction: "BUY"
    });

    reasons.push("Higher Low");
  }

  if (structure.LH !== null) {
    sellScore += 1;

    votes.push({
      strategy: "MARKET_STRUCTURE_LH",
      direction: "SELL"
    });

    reasons.push("Lower High");
  }

  if (structure.LL !== null) {
    sellScore += 1;

    votes.push({
      strategy: "MARKET_STRUCTURE_LL",
      direction: "SELL"
    });

    reasons.push("Lower Low");
  }

  // ----------------------------------------------------------
  // BOS
  // ----------------------------------------------------------

  const bos = detectBOS(data, structure);

  if (bos.direction === "BUY") {
    buyScore += 2;

    votes.push({
      strategy: "BOS",
      direction: "BUY"
    });

    reasons.push("Bullish BOS");
  }

  if (bos.direction === "SELL") {
    sellScore += 2;

    votes.push({
      strategy: "BOS",
      direction: "SELL"
    });

    reasons.push("Bearish BOS");
  }

  // ----------------------------------------------------------
  // CHOCH
  // ----------------------------------------------------------

  const choch = detectCHOCH(data, structure);

  if (choch.direction === "BUY") {
    buyScore += 2;

    votes.push({
      strategy: "CHOCH",
      direction: "BUY"
    });

    reasons.push("Bullish CHOCH");
  }

  if (choch.direction === "SELL") {
    sellScore += 2;

    votes.push({
      strategy: "CHOCH",
      direction: "SELL"
    });

    reasons.push("Bearish CHOCH");
  }

  // ----------------------------------------------------------
  // FVG
  // ----------------------------------------------------------

  const fvg = detectFVG(data);

  if (fvg.direction === "BUY") {
    buyScore += 1;

    votes.push({
      strategy: "FVG",
      direction: "BUY"
    });

    reasons.push("Bullish FVG");
  }

  if (fvg.direction === "SELL") {
    sellScore += 1;

    votes.push({
      strategy: "FVG",
      direction: "SELL"
    });

    reasons.push("Bearish FVG");
  }

  // ----------------------------------------------------------
  // LIQUIDITY
  // ----------------------------------------------------------

  const liquidity = detectLiquidity(data);

  if (liquidity.direction === "BUY") {
    buyScore += 2;

    votes.push({
      strategy: "LIQUIDITY",
      direction: "BUY"
    });

    reasons.push("Sell-side liquidity sweep");
  }

  if (liquidity.direction === "SELL") {
    sellScore += 2;

    votes.push({
      strategy: "LIQUIDITY",
      direction: "SELL"
    });

    reasons.push("Buy-side liquidity sweep");
  }

  // ----------------------------------------------------------
  // FIBONACCI
  // ----------------------------------------------------------

  const fibonacci = fibonacciZone(
    data,
    structure
  );

  if (fibonacci.direction === "BUY") {
    buyScore += 1;

    votes.push({
      strategy: "FIB_GOLDEN_ZONE",
      direction: "BUY"
    });

    reasons.push("Price in bullish Fibonacci golden zone");
  }

  if (fibonacci.direction === "SELL") {
    sellScore += 1;

    votes.push({
      strategy: "FIB_GOLDEN_ZONE",
      direction: "SELL"
    });

    reasons.push("Price in bearish Fibonacci golden zone");
  }

  // ----------------------------------------------------------
  // PRICE RANGE
  // ----------------------------------------------------------

  const range = priceRange(data);

  if (range.direction === "BUY") {
    buyScore += 1;

    votes.push({
      strategy: "PRICE_RANGE",
      direction: "BUY"
    });

    reasons.push("Range breakout");
  }

  if (range.direction === "SELL") {
    sellScore += 1;

    votes.push({
      strategy: "PRICE_RANGE",
      direction: "SELL"
    });

    reasons.push("Range breakdown");
  }

  // ----------------------------------------------------------
  // EMA TREND
  // ----------------------------------------------------------

  const trend = trendFilter(data);

  if (trend.direction === "BUY") {
    buyScore += 1;

    votes.push({
      strategy: "EMA_TREND",
      direction: "BUY"
    });

    reasons.push("EMA bullish trend");
  }

  if (trend.direction === "SELL") {
    sellScore += 1;

    votes.push({
      strategy: "EMA_TREND",
      direction: "SELL"
    });

    reasons.push("EMA bearish trend");
  }

  // ----------------------------------------------------------
  // RSI
  // ----------------------------------------------------------

  const rsi = calculateRSI(
    data,
    SETTINGS.rsiPeriod
  );

  if (rsi >= 50 && rsi <= 70) {
    buyScore += 1;

    votes.push({
      strategy: "RSI",
      direction: "BUY"
    });

    reasons.push("RSI bullish zone");
  }

  if (rsi >= 30 && rsi < 50) {
    sellScore += 1;

    votes.push({
      strategy: "RSI",
      direction: "SELL"
    });

    reasons.push("RSI bearish zone");
  }

  // ----------------------------------------------------------
  // VWAP
  // ----------------------------------------------------------

  const vwap = calculateVWAP(data);

  if (entry > vwap) {
    buyScore += 1;

    votes.push({
      strategy: "VWAP",
      direction: "BUY"
    });

    reasons.push("Price above VWAP");
  }

  if (entry < vwap) {
    sellScore += 1;

    votes.push({
      strategy: "VWAP",
      direction: "SELL"
    });

    reasons.push("Price below VWAP");
  }

  // ----------------------------------------------------------
  // VOLUME
  // ----------------------------------------------------------

  const volume = volumeSignal(data);

  if (volume.direction === "BUY") {
    buyScore += 1;

    votes.push({
      strategy: "VOLUME",
      direction: "BUY"
    });

    reasons.push("Bullish volume confirmation");
  }

  if (volume.direction === "SELL") {
    sellScore += 1;

    votes.push({
      strategy: "VOLUME",
      direction: "SELL"
    });

    reasons.push("Bearish volume confirmation");
  }

  // ==========================================================
  // FINAL DECISION
  // ==========================================================

  let signal = "WAIT";

  const buyAgreement =
    countAgreement(votes, "BUY");

  const sellAgreement =
    countAgreement(votes, "SELL");

  if (
    buyScore >= SETTINGS.minimumScore &&
    buyScore > sellScore &&
    buyAgreement >= SETTINGS.minimumAgreement &&
    buyScore - sellScore >= 2
  ) {
    signal = "BUY";
  }

  if (
    sellScore >= SETTINGS.minimumScore &&
    sellScore > buyScore &&
    sellAgreement >= SETTINGS.minimumAgreement &&
    sellScore - buyScore >= 2
  ) {
    signal = "SELL";
  }

  // ==========================================================
  // ATR
  // ==========================================================

  const atr = calculateATR(
    data,
    SETTINGS.atrPeriod
  );

  let stopLoss = null;
  let target = null;

  if (signal === "BUY" && atr > 0) {
    stopLoss =
      entry - atr * SETTINGS.stopATR;

    target =
      entry + atr * SETTINGS.targetATR;
  }

  if (signal === "SELL" && atr > 0) {
    stopLoss =
      entry + atr * SETTINGS.stopATR;

    target =
      entry - atr * SETTINGS.targetATR;
  }

  // ==========================================================
  // CONFIDENCE
  // ==========================================================

  const winningScore =
    signal === "BUY"
      ? buyScore
      : signal === "SELL"
        ? sellScore
        : Math.max(buyScore, sellScore);

  const confidence = Math.min(
    100,
    Math.round((winningScore / 15) * 100)
  );

  // ==========================================================
  // RESULT
  // ==========================================================

  return {
    market: SETTINGS.market,
    timeframe: SETTINGS.timeframe,

    signal,
    confidence,

    entry,

    stopLoss,
    target,

    buyScore,
    sellScore,

    buyAgreement,
    sellAgreement,

    trend: trend.trend,

    rsi,
    vwap,
    atr,

    marketStructure: structure.structure,

    bos: bos.signal,
    choch: choch.signal,

    fvg: fvg.signal,
    liquidity: liquidity.signal,

    fibonacci: fibonacci.signal,

    priceRange: range.signal,

    volume: volume.signal,

    emaFast: trend.fastEMA,
    emaSlow: trend.slowEMA,

    reasons,

    votes,

    timestamp: new Date().toISOString()
  };
}

// ============================================================
// EXPORTS
// ============================================================

// Browser
if (typeof window !== "undefined") {
  window.SHIV_AI_STRATEGY = {
    analyzeNifty,
    calculateEMA,
    calculateRSI,
    calculateATR,
    calculateVWAP,
    detectMarketStructure,
    detectBOS,
    detectCHOCH,
    detectFVG,
    detectLiquidity,
    fibonacciZone,
    priceRange,
    volumeSignal,
    trendFilter
  };
}

// Node.js
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    analyzeNifty,
    calculateEMA,
    calculateRSI,
    calculateATR,
    calculateVWAP,
    detectMarketStructure,
    detectBOS,
    detectCHOCH,
    detectFVG,
    detectLiquidity,
    fibonacciZone,
    priceRange,
    volumeSignal,
    trendFilter
  };
}
