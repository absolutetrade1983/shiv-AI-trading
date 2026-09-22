// ============================================================
// SHIV AI TRADING - APP CONTROLLER
// Connects app.js with the Master strategy.js engine
// ============================================================

(function () {
  "use strict";

  // ------------------------------------------------------------
  // CHECK MASTER ENGINE
  // ------------------------------------------------------------

  function getEngine() {
    if (
      typeof window !== "undefined" &&
      window.SHIV_AI_STRATEGY &&
      typeof window.SHIV_AI_STRATEGY.analyzeNifty === "function"
    ) {
      return window.SHIV_AI_STRATEGY;
    }

    return null;
  }

  // ------------------------------------------------------------
  // ANALYZE MARKET
  // ------------------------------------------------------------

  function analyzeMarket(candles) {
    const engine = getEngine();

    if (!engine) {
      return {
        signal: "WAIT",
        confidence: 0,
        error:
          "Master strategy engine not loaded. Load strategy.js before app.js."
      };
    }

    if (!Array.isArray(candles) || candles.length < 50) {
      return {
        signal: "WAIT",
        confidence: 0,
        error: "Minimum 50 candles required."
      };
    }

    try {
      return engine.analyzeNifty(candles);
    } catch (error) {
      return {
        signal: "WAIT",
        confidence: 0,
        error: error.message
      };
    }
  }

  // ------------------------------------------------------------
  // FORMAT RESULT
  // ------------------------------------------------------------

  function formatResult(result) {
    if (!result) {
      return "No result";
    }

    return {
      market: result.market || "NIFTY",
      timeframe: result.timeframe || "5m",

      signal: result.signal || "WAIT",

      confidence: result.confidence || 0,

      entry: result.entry ?? null,

      stopLoss: result.stopLoss ?? null,

      target: result.target ?? null,

      buyScore: result.buyScore || 0,

      sellScore: result.sellScore || 0,

      buyAgreement: result.buyAgreement || 0,

      sellAgreement: result.sellAgreement || 0,

      trend: result.trend || "NEUTRAL",

      rsi: result.rsi ?? null,

      vwap: result.vwap ?? null,

      atr: result.atr ?? null,

      marketStructure:
        result.marketStructure || "NEUTRAL",

      bos: result.bos || "NONE",

      choch: result.choch || "NONE",

      fvg: result.fvg || "NONE",

      liquidity:
        result.liquidity || "NONE",

      fibonacci:
        result.fibonacci || "NONE",

      priceRange:
        result.priceRange || "NONE",

      volume:
        result.volume || "NORMAL",

      emaFast:
        result.emaFast ?? null,

      emaSlow:
        result.emaSlow ?? null,

      reasons:
        result.reasons || [],

      votes:
        result.votes || [],

      timestamp:
        result.timestamp || new Date().toISOString()
    };
  }

  // ------------------------------------------------------------
  // TEST CANDLE GENERATOR
  // ------------------------------------------------------------

  function generateTestCandles(count = 100) {
    const candles = [];

    let price = 24000;

    for (let i = 0; i < count; i++) {
      const movement =
        Math.sin(i / 5) * 25 +
        (Math.random() - 0.45) * 35;

      const open = price;

      const close =
        price + movement;

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
        time:
          Date.now() -
          (count - i) * 5 * 60 * 1000,

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

  // ------------------------------------------------------------
  // RUN TEST
  // ------------------------------------------------------------

  function runTest() {
    const candles =
      generateTestCandles(100);

    const result =
      analyzeMarket(candles);

    const formatted =
      formatResult(result);

    console.log(
      "========================================"
    );

    console.log(
      "       SHIV AI TRADING TEST"
    );

    console.log(
      "========================================"
    );

    console.log(
      "Signal:",
      formatted.signal
    );

    console.log(
      "Confidence:",
      formatted.confidence + "%"
    );

    console.log(
      "Entry:",
      formatted.entry
    );

    console.log(
      "Stop Loss:",
      formatted.stopLoss
    );

    console.log(
      "Target:",
      formatted.target
    );

    console.log(
      "Buy Score:",
      formatted.buyScore
    );

    console.log(
      "Sell Score:",
      formatted.sellScore
    );

    console.log(
      "Buy Agreement:",
      formatted.buyAgreement
    );

    console.log(
      "Sell Agreement:",
      formatted.sellAgreement
    );

    console.log(
      "Trend:",
      formatted.trend
    );

    console.log(
      "Market Structure:",
      formatted.marketStructure
    );

    console.log(
      "BOS:",
      formatted.bos
    );

    console.log(
      "CHOCH:",
      formatted.choch
    );

    console.log(
      "FVG:",
      formatted.fvg
    );

    console.log(
      "Liquidity:",
      formatted.liquidity
    );

    console.log(
      "Fibonacci:",
      formatted.fibonacci
    );

    console.log(
      "Price Range:",
      formatted.priceRange
    );

    console.log(
      "Volume:",
      formatted.volume
    );

    console.log(
      "RSI:",
      formatted.rsi
    );

    console.log(
      "VWAP:",
      formatted.vwap
    );

    console.log(
      "========================================"
    );

    console.log(
      "Reasons:",
      formatted.reasons
    );

    console.log(
      "Votes:",
      formatted.votes
    );

    console.log(
      "========================================"
    );

    return formatted;
  }

  // ------------------------------------------------------------
  // PROCESS LIVE CANDLES
  // ------------------------------------------------------------

  function processCandles(candles) {
    const result =
      analyzeMarket(candles);

    return formatResult(result);
  }

  // ------------------------------------------------------------
  // BROWSER EXPORT
  // ------------------------------------------------------------

  if (typeof window !== "undefined") {
    window.SHIV_AI_TRADING = {
      analyzeMarket,
      processCandles,
      generateTestCandles,
      runTest,
      formatResult
    };
  }

  // ------------------------------------------------------------
  // NODE EXPORT
  // ------------------------------------------------------------

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = {
      analyzeMarket,
      processCandles,
      generateTestCandles,
      runTest,
      formatResult
    };
  }

  // ------------------------------------------------------------
  // READY MESSAGE
  // ------------------------------------------------------------

  if (typeof window !== "undefined") {
    console.log(
      "SHIV AI Trading App loaded."
    );

    console.log(
      "Master strategy:",
      getEngine()
        ? "CONNECTED"
        : "NOT LOADED"
    );
  }

})();
