// ============================================================
// NIFTY AI TRADING ENGINE
// 5-minute strategy engine
// ============================================================

// Candle format:
// {
//   open: Number,
//   high: Number,
//   low: Number,
//   close: Number,
//   volume: Number
// }


// =========================
// BASIC HELPERS
// =========================

function last(arr, n = 1) {
    return arr[arr.length - n];
}

function average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}


// =========================
// EMA
// =========================

function calculateEMA(candles, period) {
    if (candles.length < period) return null;

    const closes = candles.map(c => c.close);
    const multiplier = 2 / (period + 1);

    let ema = average(closes.slice(0, period));

    for (let i = period; i < closes.length; i++) {
        ema = ((closes[i] - ema) * multiplier) + ema;
    }

    return ema;
}


// =========================
// RSI
// =========================

function calculateRSI(candles, period = 14) {
    if (candles.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = candles.length - period; i < candles.length; i++) {
        const change =
            candles[i].close - candles[i - 1].close;

        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }

    if (losses === 0) return 100;

    const rs = gains / losses;

    return 100 - (100 / (1 + rs));
}


// =========================
// ATR
// =========================

function calculateATR(candles, period = 14) {
    if (candles.length <= period) return null;

    const trs = [];

    for (let i = 1; i < candles.length; i++) {
        const current = candles[i];
        const previous = candles[i - 1];

        const tr = Math.max(
            current.high - current.low,
            Math.abs(current.high - previous.close),
            Math.abs(current.low - previous.close)
        );

        trs.push(tr);
    }

    return average(trs.slice(-period));
}


// =========================
// VWAP
// =========================

function calculateVWAP(candles) {
    if (!candles.length) return null;

    let totalPV = 0;
    let totalVolume = 0;

    candles.forEach(c => {
        const typicalPrice =
            (c.high + c.low + c.close) / 3;

        totalPV += typicalPrice * c.volume;
        totalVolume += c.volume;
    });

    if (!totalVolume) return null;

    return totalPV / totalVolume;
}


// =========================
// SWING HIGH / LOW
// =========================

function findSwingPoints(candles, strength = 2) {

    const highs = [];
    const lows = [];

    for (
        let i = strength;
        i < candles.length - strength;
        i++
    ) {

        let swingHigh = true;
        let swingLow = true;

        for (let j = 1; j <= strength; j++) {

            if (
                candles[i].high <= candles[i - j].high ||
                candles[i].high <= candles[i + j].high
            ) {
                swingHigh = false;
            }

            if (
                candles[i].low >= candles[i - j].low ||
                candles[i].low >= candles[i + j].low
            ) {
                swingLow = false;
            }
        }

        if (swingHigh) {
            highs.push({
                index: i,
                price: candles[i].high
            });
        }

        if (swingLow) {
            lows.push({
                index: i,
                price: candles[i].low
            });
        }
    }

    return { highs, lows };
}


// =========================
// HH / HL / LH / LL
// =========================

function marketStructure(candles) {

    const swings = findSwingPoints(candles);

    const highs = swings.highs;
    const lows = swings.lows;

    let signal = "NEUTRAL";
    let structure = [];

    if (highs.length >= 2) {

        const h1 = highs[highs.length - 2].price;
        const h2 = highs[highs.length - 1].price;

        structure.push(
            h2 > h1 ? "HH" : "LH"
        );
    }

    if (lows.length >= 2) {

        const l1 = lows[lows.length - 2].price;
        const l2 = lows[lows.length - 1].price;

        structure.push(
            l2 > l1 ? "HL" : "LL"
        );
    }

    const bullish =
        structure.includes("HH") &&
        structure.includes("HL");

    const bearish =
        structure.includes("LH") &&
        structure.includes("LL");

    if (bullish) signal = "BUY";
    if (bearish) signal = "SELL";

    return {
        signal,
        structure,
        swings
    };
}


// =========================
// BOS
// =========================

function detectBOS(candles) {

    if (candles.length < 10) {
        return "NONE";
    }

    const current = last(candles);

    const previousHigh = Math.max(
        ...candles
            .slice(-8, -1)
            .map(c => c.high)
    );

    const previousLow = Math.min(
        ...candles
            .slice(-8, -1)
            .map(c => c.low)
    );

    if (current.close > previousHigh) {
        return "BULLISH_BOS";
    }

    if (current.close < previousLow) {
        return "BEARISH_BOS";
    }

    return "NONE";
}


// =========================
// CHOCH
// =========================

function detectCHOCH(candles) {

    const structure = marketStructure(candles);

    if (structure.structure.includes("HH") &&
        structure.structure.includes("LL")) {
        return "POSSIBLE_BEARISH_CHOCH";
    }

    if (structure.structure.includes("LH") &&
        structure.structure.includes("HL")) {
        return "POSSIBLE_BULLISH_CHOCH";
    }

    return "NONE";
}


// =========================
// FAIR VALUE GAP
// =========================

function detectFVG(candles) {

    if (candles.length < 3) {
        return { type: "NONE" };
    }

    const a = candles[candles.length - 3];
    const b = candles[candles.length - 2];
    const c = candles[candles.length - 1];

    // Bullish FVG
    if (c.low > a.high) {

        return {
            type: "BULLISH_FVG",
            low: a.high,
            high: c.low
        };
    }

    // Bearish FVG
    if (c.high < a.low) {

        return {
            type: "BEARISH_FVG",
            low: c.high,
            high: a.low
        };
    }

    return {
        type: "NONE"
    };
}


// =========================
// LIQUIDITY ZONES
// =========================

function detectLiquidity(candles) {

    const recent = candles.slice(-20);

    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);

    const liquidityHigh = Math.max(...highs);
    const liquidityLow = Math.min(...lows);

    const current = last(candles);

    if (current.high > liquidityHigh &&
        current.close < liquidityHigh) {

        return "BUY_SIDE_LIQUIDITY_SWEEP";
    }

    if (current.low < liquidityLow &&
        current.close > liquidityLow) {

        return "SELL_SIDE_LIQUIDITY_SWEEP";
    }

    return "NONE";
}


// =========================
// FIBONACCI GOLDEN ZONE
// =========================

function fibonacciZone(candles) {

    const swings = findSwingPoints(candles);

    if (!swings.highs.length ||
        !swings.lows.length) {

        return {
            zone: "NONE"
        };
    }

    const high =
        swings.highs[swings.highs.length - 1].price;

    const low =
        swings.lows[swings.lows.length - 1].price;

    const range = high - low;

    if (range <= 0) {
        return { zone: "NONE" };
    }

    const fib618 = high - range * 0.618;
    const fib786 = high - range * 0.786;

    const price = last(candles).close;

    if (price <= fib618 && price >= fib786) {

        return {
            zone: "GOLDEN_ZONE",
            fib618,
            fib786
        };
    }

    return {
        zone: "OUTSIDE"
    };
}


// =========================
// PRICE RANGE
// =========================

function priceRange(candles, period = 20) {

    const data = candles.slice(-period);

    const high = Math.max(
        ...data.map(c => c.high)
    );

    const low = Math.min(
        ...data.map(c => c.low)
    );

    const current = last(candles).close;

    if (current > high) {
        return "BREAKOUT";
    }

    if (current < low) {
        return "BREAKDOWN";
    }

    return "RANGE";
}


// =========================
// VOLUME CONFIRMATION
// =========================

function volumeSignal(candles, period = 20) {

    if (candles.length < period + 1) {
        return "NONE";
    }

    const volumes = candles
        .slice(-(period + 1), -1)
        .map(c => c.volume);

    const avgVolume = average(volumes);

    const currentVolume = last(candles).volume;

    if (currentVolume > avgVolume * 1.5) {
        return "HIGH_VOLUME";
    }

    return "NORMAL_VOLUME";
}


// =========================
// TREND FILTER
// =========================

function trendFilter(candles) {

    const ema9 = calculateEMA(candles, 9);
    const ema21 = calculateEMA(candles, 21);

    if (!ema9 || !ema21) {
        return "UNKNOWN";
    }

    if (ema9 > ema21) return "BULLISH";
    if (ema9 < ema21) return "BEARISH";

    return "SIDEWAYS";
}


// =========================
// MASTER AI SCORE
// =========================

function analyzeNifty(candles) {

    if (!candles || candles.length < 50) {

        return {
            signal: "WAIT",
            confidence: 0,
            reason: "Not enough candle data"
        };
    }

    let buyScore = 0;
    let sellScore = 0;

    const reasons = [];

    // Market structure
    const structure = marketStructure(candles);

    if (structure.structure.includes("HH")) {
        buyScore++;
        reasons.push("HH");
    }

    if (structure.structure.includes("HL")) {
        buyScore++;
        reasons.push("HL");
    }

    if (structure.structure.includes("LH")) {
        sellScore++;
        reasons.push("LH");
    }

    if (structure.structure.includes("LL")) {
        sellScore++;
        reasons.push("LL");
    }


    // BOS
    const bos = detectBOS(candles);

    if (bos === "BULLISH_BOS") {
        buyScore += 2;
        reasons.push("Bullish BOS");
    }

    if (bos === "BEARISH_BOS") {
        sellScore += 2;
        reasons.push("Bearish BOS");
    }


    // FVG
    const fvg = detectFVG(candles);

    if (fvg.type === "BULLISH_FVG") {
        buyScore++;
        reasons.push("Bullish FVG");
    }

    if (fvg.type === "BEARISH_FVG") {
        sellScore++;
        reasons.push("Bearish FVG");
    }


    // Liquidity
    const liquidity = detectLiquidity(candles);

    if (liquidity === "SELL_SIDE_LIQUIDITY_SWEEP") {
        buyScore += 2;
        reasons.push("Sell-side liquidity sweep");
    }

    if (liquidity === "BUY_SIDE_LIQUIDITY_SWEEP") {
        sellScore += 2;
        reasons.push("Buy-side liquidity sweep");
    }


    // Fibonacci
    const fib = fibonacciZone(candles);

    if (fib.zone === "GOLDEN_ZONE") {
        buyScore++;
        sellScore++;
        reasons.push("Fib Golden Zone");
    }


    // Price range
    const range = priceRange(candles);

    if (range === "BREAKOUT") {
        buyScore++;
        reasons.push("Range breakout");
    }

    if (range === "BREAKDOWN") {
        sellScore++;
        reasons.push("Range breakdown");
    }


    // EMA
    const trend = trendFilter(candles);

    if (trend === "BULLISH") {
        buyScore++;
        reasons.push("EMA bullish");
    }

    if (trend === "BEARISH") {
        sellScore++;
        reasons.push("EMA bearish");
    }


    // RSI
    const rsi = calculateRSI(candles);

    if (rsi !== null) {

        if (rsi >= 50 && rsi <= 70) {
            buyScore++;
            reasons.push("RSI bullish");
        }

        if (rsi >= 30 && rsi < 50) {
            sellScore++;
            reasons.push("RSI bearish");
        }
    }


    // VWAP
    const vwap = calculateVWAP(candles);
    const price = last(candles).close;

    if (vwap !== null) {

        if (price > vwap) {
            buyScore++;
            reasons.push("Above VWAP");
        }

        if (price < vwap) {
            sellScore++;
            reasons.push("Below VWAP");
        }
    }


    // Volume
    const volume = volumeSignal(candles);

    if (volume === "HIGH_VOLUME") {

        if (buyScore > sellScore) {
            buyScore++;
            reasons.push("High volume");
        }

        if (sellScore > buyScore) {
            sellScore++;
            reasons.push("High volume");
        }
    }


    // =========================
    // FINAL DECISION
    // =========================

    const totalPossible = 15;

    let signal = "WAIT";
    let winningScore = Math.max(
        buyScore,
        sellScore
    );

    if (
        buyScore >= 7 &&
        buyScore > sellScore
    ) {
        signal = "BUY";
    }

    if (
        sellScore >= 7 &&
        sellScore > buyScore
    ) {
        signal = "SELL";
    }


    const confidence =
        Math.min(
            Math.round(
                (winningScore / totalPossible) * 100
            ),
            100
        );


    // =========================
    // SL / TARGET
    // =========================

    const atr = calculateATR(candles);

    let stopLoss = null;
    let target = null;

    if (atr) {

        if (signal === "BUY") {

            stopLoss = price - (atr * 1.5);
            target = price + (atr * 3);

        }

        if (signal === "SELL") {

            stopLoss = price + (atr * 1.5);
            target = price - (atr * 3);

        }
    }


    return {

        market: "NIFTY",
        timeframe: "5m",

        signal,

        confidence,

        buyScore,
        sellScore,

        entry: price,

        stopLoss,
        target,

        trend,
        rsi,
        vwap,
        atr,

        marketStructure:
            structure.structure,

        bos,

        choch:
            detectCHOCH(candles),

        fvg,

        liquidity,

        fibonacci:
            fib,

        priceRange:
            range,

        volume,

        reasons
    };
}
// ================================
// EXPORT MASTER STRATEGY ENGINE
// ================================

window.SHIV_AI_STRATEGY = {
    analyzeNifty
};

console.log("SHIV AI Strategy Engine Loaded");
