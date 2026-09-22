// SHIV AI TRADING
// Multi-Strategy Consensus Engine
// Strategy 1: EMA Trend
// Strategy 2: RSI Momentum
// Strategy 3: VWAP / Volume
//
// IMPORTANT:
// This file currently works as the strategy engine.
// Live NIFTY/BANKNIFTY data will be connected separately.

"use strict";

/* =========================
   SETTINGS
========================= */

const SETTINGS = {
  minimumAgreement: 2,

  emaFast: 9,
  emaSlow: 21,

  rsiPeriod: 14,
  rsiBuyLevel: 55,
  rsiSellLevel: 45,

  volumeMultiplier: 1.2
};


/* =========================
   BASIC HELPERS
========================= */

function average(values) {
  if (!values.length) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


function calculateEMA(values, period) {
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);

  let ema = average(values.slice(0, period));

  for (let i = period; i < values.length; i++) {
    ema = ((values[i] - ema) * multiplier) + ema;
  }

  return ema;
}


function calculateRSI(closes, period = 14) {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];

    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];

    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    averageGain =
      ((averageGain * (period - 1)) + gain) / period;

    averageLoss =
      ((averageLoss * (period - 1)) + loss) / period;
  }

  if (averageLoss === 0) return 100;

  const relativeStrength = averageGain / averageLoss;

  return 100 - (100 / (1 + relativeStrength));
}


/* =========================
   STRATEGY 1
   EMA TREND
========================= */

function strategyEMA(closes) {

  const fastEMA = calculateEMA(
    closes,
    SETTINGS.emaFast
  );

  const slowEMA = calculateEMA(
    closes,
    SETTINGS.emaSlow
  );

  if (fastEMA === null || slowEMA === null) {
    return {
      name: "EMA Trend",
      signal: "WAIT",
      reason: "Not enough data"
    };
  }

  if (fastEMA > slowEMA) {
    return {
      name: "EMA Trend",
      signal: "BUY",
      reason: "9 EMA above 21 EMA",
      fastEMA,
      slowEMA
    };
  }

  if (fastEMA < slowEMA) {
    return {
      name: "EMA Trend",
      signal: "SELL",
      reason: "9 EMA below 21 EMA",
      fastEMA,
      slowEMA
    };
  }

  return {
    name: "EMA Trend",
    signal: "WAIT",
    reason: "EMA crossover not confirmed"
  };
}


/* =========================
   STRATEGY 2
   RSI MOMENTUM
========================= */

function strategyRSI(closes) {

  const rsi = calculateRSI(
    closes,
    SETTINGS.rsiPeriod
  );

  if (rsi === null) {
    return {
      name: "RSI Momentum",
      signal: "WAIT",
      reason: "Not enough data"
    };
  }

  if (rsi >= SETTINGS.rsiBuyLevel && rsi < 70) {
    return {
      name: "RSI Momentum",
      signal: "BUY",
      reason: `RSI momentum positive`,
      rsi
    };
  }

  if (rsi <= SETTINGS.rsiSellLevel && rsi > 30) {
    return {
      name: "RSI Momentum",
      signal: "SELL",
      reason: `RSI momentum negative`,
      rsi
    };
  }

  return {
    name: "RSI Momentum",
    signal: "WAIT",
    reason: "RSI neutral",
    rsi
  };
}


/* =========================
   STRATEGY 3
   VWAP + VOLUME
========================= */

function strategyVWAP(candles) {

  if (!candles || candles.length < 5) {
    return {
      name: "VWAP + Volume",
      signal: "WAIT",
      reason: "Not enough data"
    };
  }

  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {

    const typicalPrice =
      (candle.high + candle.low + candle.close) / 3;

    cumulativePriceVolume +=
      typicalPrice * candle.volume;

    cumulativeVolume += candle.volume;
  }

  if (cumulativeVolume === 0) {
    return {
      name: "VWAP + Volume",
      signal: "WAIT",
      reason: "Volume unavailable"
    };
  }

  const vwap =
    cumulativePriceVolume / cumulativeVolume;

  const latest = candles[candles.length - 1];

  const recentVolumes =
    candles.slice(-6, -1).map(c => c.volume);

  const averageVolume =
    average(recentVolumes);

  const strongVolume =
    latest.volume >=
    averageVolume * SETTINGS.volumeMultiplier;

  if (latest.close > vwap && strongVolume) {
    return {
      name: "VWAP + Volume",
      signal: "BUY",
      reason: "Price above VWAP with strong volume",
      vwap,
      volume: latest.volume
    };
  }

  if (latest.close < vwap && strongVolume) {
    return {
      name: "VWAP + Volume",
      signal: "SELL",
      reason: "Price below VWAP with strong volume",
      vwap,
      volume: latest.volume
    };
  }

  return {
    name: "VWAP + Volume",
    signal: "WAIT",
    reason: "VWAP/volume confirmation missing",
    vwap
  };
}


/* =========================
   CONSENSUS ENGINE
========================= */

function getConsensus(results) {

  const buyCount =
    results.filter(r => r.signal === "BUY").length;

  const sellCount =
    results.filter(r => r.signal === "SELL").length;

  if (buyCount >= SETTINGS.minimumAgreement) {

    return {
      signal: "BUY",
      agreement: buyCount,
      confidence: Math.round(
        (buyCount / results.length) * 100
      )
    };
  }

  if (sellCount >= SETTINGS.minimumAgreement) {

    return {
      signal: "SELL",
      agreement: sellCount,
      confidence: Math.round(
        (sellCount / results.length) * 100
      )
    };
  }

  return {
    signal: "NO TRADE",
    agreement: Math.max(
      buyCount,
      sellCount
    ),
    confidence: 0
  };
}


/* =========================
   MAIN ANALYSIS
========================= */

function analyzeMarket(candles) {

  if (!candles || candles.length < 30) {

    return {
      signal: "NO TRADE",
      reason: "Waiting for sufficient market data",
      strategies: []
    };
  }

  const closes =
    candles.map(c => Number(c.close));

  const emaResult =
    strategyEMA(closes);

  const rsiResult =
    strategyRSI(closes);

  const vwapResult =
    strategyVWAP(candles);

  const strategies = [
    emaResult,
    rsiResult,
    vwapResult
  ];

  const consensus =
    getConsensus(strategies);

  return {
    signal: consensus.signal,
    agreement: consensus.agreement,
    confidence: consensus.confidence,
    strategies
  };
}


/* =========================
   EXAMPLE TEST DATA
========================= */

function generateTestCandles() {

  const candles = [];

  let price = 25000;

  for (let i = 0; i < 60; i++) {

    const change =
      (Math.random() - 0.45) * 40;

    const open = price;

    const close =
      price + change;

    const high =
      Math.max(open, close) +
      Math.random() * 20;

    const low =
      Math.min(open, close) -
      Math.random() * 20;

    const volume =
      100000 +
      Math.random() * 50000;

    candles.push({
      open,
      high,
      low,
      close,
      volume
    });

    price = close;
  }

  return candles;
}


/* =========================
   TEST ENGINE
========================= */

function runTest() {

  const candles =
    generateTestCandles();

  const result =
    analyzeMarket(candles);

  console.log(
    "========== SHIV AI TRADING =========="
  );

  console.log(
    "FINAL SIGNAL:",
    result.signal
  );

  console.log(
    "AGREEMENT:",
    result.agreement
  );

  console.log(
    "CONFIDENCE:",
    result.confidence + "%"
  );

  console.log(
    "STRATEGIES:",
    result.strategies
  );

  return result;
}


/* =========================
   EXPORT FOR BROWSER
========================= */

window.SHIV_AI_TRADING = {

  analyzeMarket,
  strategyEMA,
  strategyRSI,
  strategyVWAP,
  getConsensus,
  runTest

};

console.log(
  "SHIV AI Trading Engine Loaded"
);
