// ============================================================
// SHIV AI TRADING — FINAL MASTER STRATEGY ENGINE
// NIFTY | 5 MIN
// ============================================================

const SETTINGS = {
    market: "NIFTY",
    timeframe: "5m",

    // FINAL SIGNAL FILTER
    minimumConfluence: 95,
    minimumAgreement: 3,

    // Indicators
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    atrPeriod: 14,
    volumePeriod: 20,

    // Structure
    swingStrength: 2,
    liquidityLookback: 20,
    rangeLookback: 20,

    // Trade management
    stopATR: 1.5,
    targetATR: 3.0,

    // NIFTY option strike interval
    strikeStep: 50
};

// ============================================================
// BASIC HELPERS
// ============================================================

function last(arr) {
    return arr[arr.length - 1];
}

function previous(arr) {
    return arr[arr.length - 2];
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function roundTo(value, step) {
    return Math.round(value / step) * step;
}

function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
}

function isValidNumber(x) {
    return Number.isFinite(Number(x));
}

// ============================================================
// NORMALIZE CANDLE DATA
// ============================================================

function normalizeCandles(candles) {
    return (candles || [])
        .map((c, i) => ({
            time: c.time ?? c.timestamp ?? i,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume ?? 0)
        }))
        .filter(c =>
            isValidNumber(c.open) &&
            isValidNumber(c.high) &&
            isValidNumber(c.low) &&
            isValidNumber(c.close)
        );
}

// ============================================================
// EMA
// ============================================================

function ema(values, period) {
    if (!values.length) return [];

    const result = [];
    const multiplier = 2 / (period + 1);

    let current = values[0];
    result.push(current);

    for (let i = 1; i < values.length; i++) {
        current =
            (values[i] - current) * multiplier + current;

        result.push(current);
    }

    return result;
}

// ============================================================
// RSI
// ============================================================

function rsi(values, period = 14) {
    if (values.length <= period) {
        return values.map(() => 50);
    }

    const result = new Array(values.length).fill(50);

    let gain = 0;
    let loss = 0;

    for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];

        if (change >= 0) gain += change;
        else loss += Math.abs(change);
    }

    let avgGain = gain / period;
    let avgLoss = loss / period;

    result[period] =
        avgLoss === 0 ? 100 :
        100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];

        const currentGain = change > 0 ? change : 0;
        const currentLoss = change < 0 ? Math.abs(change) : 0;

        avgGain =
            ((avgGain * (period - 1)) + currentGain) / period;

        avgLoss =
            ((avgLoss * (period - 1)) + currentLoss) / period;

        result[i] =
            avgLoss === 0
                ? 100
                : 100 - 100 / (1 + avgGain / avgLoss);
    }

    return result;
}

// ============================================================
// ATR
// ============================================================

function atr(candles, period = 14) {
    if (!candles.length) return [];

    const tr = candles.map((c, i) => {
        if (i === 0) return c.high - c.low;

        const prevClose = candles[i - 1].close;

        return Math.max(
            c.high - c.low,
            Math.abs(c.high - prevClose),
            Math.abs(c.low - prevClose)
        );
    });

    const result = new Array(candles.length).fill(0);

    let current = avg(tr.slice(0, Math.min(period, tr.length)));

    for (let i = 0; i < candles.length; i++) {
        if (i < period) {
            result[i] = current;
        } else {
            current =
                ((current * (period - 1)) + tr[i]) / period;

            result[i] = current;
        }
    }

    return result;
}

// ============================================================
// VWAP
// ============================================================

function vwap(candles) {
    let cumulativePV = 0;
    let cumulativeVolume = 0;

    return candles.map(c => {
        const typical =
            (c.high + c.low + c.close) / 3;

        const volume = c.volume || 1;

        cumulativePV += typical * volume;
        cumulativeVolume += volume;

        return cumulativePV / cumulativeVolume;
    });
}

// ============================================================
// SWING STRUCTURE
// ============================================================

function findSwings(candles, strength = 2) {
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

// ============================================================
// HH / HL / LH / LL
// ============================================================

function marketStructure(candles) {
    const swings = findSwings(
        candles,
        SETTINGS.swingStrength
    );

    const highs = swings.highs;
    const lows = swings.lows;

    let highStructure = "NONE";
    let lowStructure = "NONE";

    if (highs.length >= 2) {
        const a = highs[highs.length - 2].price;
        const b = highs[highs.length - 1].price;

        highStructure =
            b > a ? "HH" : "LH";
    }

    if (lows.length >= 2) {
        const a = lows[lows.length - 2].price;
        const b = lows[lows.length - 1].price;

        lowStructure =
            b > a ? "HL" : "LL";
    }

    let direction = "NEUTRAL";

    if (
        highStructure === "HH" &&
        lowStructure === "HL"
    ) {
        direction = "BULLISH";
    }

    if (
        highStructure === "LH" &&
        lowStructure === "LL"
    ) {
        direction = "BEARISH";
    }

    return {
        highStructure,
        lowStructure,
        direction,
        highs,
        lows
    };
}

// ============================================================
// BOS
// ============================================================

function detectBOS(candles, structure) {
    const price = last(candles).close;

    const recentHigh =
        structure.highs.length
            ? last(structure.highs).price
            : null;

    const recentLow =
        structure.lows.length
            ? last(structure.lows).price
            : null;

    if (recentHigh && price > recentHigh) {
        return "BULLISH_BOS";
    }

    if (recentLow && price < recentLow) {
        return "BEARISH_BOS";
    }

    return "NONE";
}

// ============================================================
// CHOCH
// ============================================================

function detectCHOCH(structure, bos) {
    if (
        structure.direction === "BEARISH" &&
        bos === "BULLISH_BOS"
    ) {
        return "BULLISH_CHOCH";
    }

    if (
        structure.direction === "BULLISH" &&
        bos === "BEARISH_BOS"
    ) {
        return "BEARISH_CHOCH";
    }

    return "NONE";
}

// ============================================================
// FVG
// ============================================================

function detectFVG(candles) {
    if (candles.length < 3) {
        return "NONE";
    }

    const a = candles[candles.length - 3];
    const c = candles[candles.length - 1];

    // Bullish FVG
    if (c.low > a.high) {
        return "BULLISH_FVG";
    }

    // Bearish FVG
    if (c.high < a.low) {
        return "BEARISH_FVG";
    }

    return "NONE";
}

// ============================================================
// LIQUIDITY
// ============================================================

function detectLiquidity(candles) {
    const lookback =
        Math.min(
            SETTINGS.liquidityLookback,
            candles.length - 1
        );

    if (lookback < 3) {
        return "NONE";
    }

    const current = last(candles);

    const previousCandles =
        candles.slice(-lookback - 1, -1);

    const previousHigh =
        Math.max(...previousCandles.map(c => c.high));

    const previousLow =
        Math.min(...previousCandles.map(c => c.low));

    // Sweep previous high and close back below
    if (
        current.high > previousHigh &&
        current.close < previousHigh
    ) {
        return "BUY_SIDE_LIQUIDITY_SWEPT";
    }

    // Sweep previous low and close back above
    if (
        current.low < previousLow &&
        current.close > previousLow
    ) {
        return "SELL_SIDE_LIQUIDITY_SWEPT";
    }

    return "NONE";
}

// ============================================================
// FIBONACCI GOLDEN ZONE
// ============================================================

function fibonacciZone(candles, structure) {
    if (
        !structure.highs.length ||
        !structure.lows.length
    ) {
        return "NONE";
    }

    const high =
        last(structure.highs).price;

    const low =
        last(structure.lows).price;

    if (high <= low) return "NONE";

    const range = high - low;

    const fib618 = high - range * 0.618;
    const fib786 = high - range * 0.786;

    const price = last(candles).close;

    if (
        price <= fib618 &&
        price >= fib786
    ) {
        return "GOLDEN_ZONE";
    }

    return "NONE";
}

// ============================================================
// PRICE RANGE
// ============================================================

function priceRange(candles) {
    const lookback =
        Math.min(
            SETTINGS.rangeLookback,
            candles.length
        );

    const data =
        candles.slice(-lookback);

    const high =
        Math.max(...data.map(c => c.high));

    const low =
        Math.min(...data.map(c => c.low));

    const price = last(candles).close;

    const range = high - low;

    if (!range) {
        return {
            state: "NONE",
            high,
            low
        };
    }

    const position =
        (price - low) / range;

    if (position > 0.8) {
        return {
            state: "UPPER_RANGE",
            high,
            low
        };
    }

    if (position < 0.2) {
        return {
            state: "LOWER_RANGE",
            high,
            low
        };
    }

    return {
        state: "RANGE",
        high,
        low
    };
}

// ============================================================
// VOLUME
// ============================================================

function volumeSignal(candles) {
    if (candles.length < SETTINGS.volumePeriod) {
        return "NORMAL";
    }

    const current = last(candles).volume;

    const previousVolumes =
        candles
            .slice(-SETTINGS.volumePeriod - 1, -1)
            .map(c => c.volume);

    const average = avg(previousVolumes);

    if (
        average > 0 &&
        current >= average * 1.5
    ) {
        return "HIGH_VOLUME";
    }

    return "NORMAL";
}

// ============================================================
// EMA / RSI / VWAP SIGNALS
// ============================================================

function technicalSignals(candles) {
    const closes =
        candles.map(c => c.close);

    const emaFast =
        ema(closes, SETTINGS.emaFast);

    const emaSlow =
        ema(closes, SETTINGS.emaSlow);

    const rsiValues =
        rsi(closes, SETTINGS.rsiPeriod);

    const vwapValues =
        vwap(candles);

    const price = last(candles).close;

    const fast = last(emaFast);
    const slow = last(emaSlow);
    const currentRSI = last(rsiValues);
    const currentVWAP = last(vwapValues);

    let emaSignal = "NEUTRAL";

    if (fast > slow && price > fast) {
        emaSignal = "BULLISH";
    }

    if (fast < slow && price < fast) {
        emaSignal = "BEARISH";
    }

    let rsiSignal = "NEUTRAL";

    if (
        currentRSI >= 55 &&
        currentRSI <= 75
    ) {
        rsiSignal = "BULLISH";
    }

    if (
        currentRSI <= 45 &&
        currentRSI >= 25
    ) {
        rsiSignal = "BEARISH";
    }

    let vwapSignal = "NEUTRAL";

    if (price > currentVWAP) {
        vwapSignal = "BULLISH";
    }

    if (price < currentVWAP) {
        vwapSignal = "BEARISH";
    }

    return {
        emaFast: fast,
        emaSlow: slow,
        rsi: currentRSI,
        vwap: currentVWAP,
        emaSignal,
        rsiSignal,
        vwapSignal
    };
}

// ============================================================
// TREND FILTER
// ============================================================

function trendFilter(structure, technical) {
    let bullish = 0;
    let bearish = 0;

    if (structure.direction === "BULLISH") bullish++;
    if (structure.direction === "BEARISH") bearish++;

    if (technical.emaSignal === "BULLISH") bullish++;
    if (technical.emaSignal === "BEARISH") bearish++;

    if (technical.vwapSignal === "BULLISH") bullish++;
    if (technical.vwapSignal === "BEARISH") bearish++;

    if (bullish >= 2) return "BULLISH";
    if (bearish >= 2) return "BEARISH";

    return "NEUTRAL";
}

// ============================================================
// SIDEWAYS FILTER
// ============================================================

function sidewaysFilter(candles, atrValue) {
    if (!atrValue) return true;

    const recent =
        candles.slice(-10);

    const high =
        Math.max(...recent.map(c => c.high));

    const low =
        Math.min(...recent.map(c => c.low));

    const range = high - low;

    // Very compressed range
    return range <= atrValue * 2;
}

// ============================================================
// STRATEGY SIGNALS
// ============================================================

function generateStrategySignals(data) {
    const {
        structure,
        bos,
        choch,
        fvg,
        liquidity,
        fibonacci,
        range,
        technical,
        volume,
        trend
    } = data;

    const strategies = [];

    // 1. MARKET STRUCTURE
    if (structure.direction === "BULLISH") {
        strategies.push({
            name: "MARKET_STRUCTURE",
            direction: "BUY",
            score: 100,
            reason: "HH + HL structure"
        });
    }

    if (structure.direction === "BEARISH") {
        strategies.push({
            name: "MARKET_STRUCTURE",
            direction: "SELL",
            score: 100,
            reason: "LH + LL structure"
        });
    }

    // 2. BOS
    if (bos === "BULLISH_BOS") {
        strategies.push({
            name: "BOS",
            direction: "BUY",
            score: 100,
            reason: "Bullish break of structure"
        });
    }

    if (bos === "BEARISH_BOS") {
        strategies.push({
            name: "BOS",
            direction: "SELL",
            score: 100,
            reason: "Bearish break of structure"
        });
    }

    // 3. CHOCH
    if (choch === "BULLISH_CHOCH") {
        strategies.push({
            name: "CHOCH",
            direction: "BUY",
            score: 100,
            reason: "Bullish change of character"
        });
    }

    if (choch === "BEARISH_CHOCH") {
        strategies.push({
            name: "CHOCH",
            direction: "SELL",
            score: 100,
            reason: "Bearish change of character"
        });
    }

    // 4. FVG
    if (fvg === "BULLISH_FVG") {
        strategies.push({
            name: "FVG",
            direction: "BUY",
            score: 95,
            reason: "Bullish fair value gap"
        });
    }

    if (fvg === "BEARISH_FVG") {
        strategies.push({
            name: "FVG",
            direction: "SELL",
            score: 95,
            reason: "Bearish fair value gap"
        });
    }

    // 5. LIQUIDITY
    if (liquidity === "SELL_SIDE_LIQUIDITY_SWEPT") {
        strategies.push({
            name: "LIQUIDITY",
            direction: "BUY",
            score: 100,
            reason: "Sell-side liquidity swept"
        });
    }

    if (liquidity === "BUY_SIDE_LIQUIDITY_SWEPT") {
        strategies.push({
            name: "LIQUIDITY",
            direction: "SELL",
            score: 100,
            reason: "Buy-side liquidity swept"
        });
    }

    // 6. FIBONACCI
    if (fibonacci === "GOLDEN_ZONE") {
        if (trend === "BULLISH") {
            strategies.push({
                name: "FIBONACCI",
                direction: "BUY",
                score: 95,
                reason: "Price inside Fibonacci golden zone"
            });
        }

        if (trend === "BEARISH") {
            strategies.push({
                name: "FIBONACCI",
                direction: "SELL",
                score: 95,
                reason: "Price inside Fibonacci golden zone"
            });
        }
    }

    // 7. EMA
    if (technical.emaSignal === "BULLISH") {
        strategies.push({
            name: "EMA",
            direction: "BUY",
            score: 95,
            reason: "EMA 9 above EMA 21 with price above EMA"
        });
    }

    if (technical.emaSignal === "BEARISH") {
        strategies.push({
            name: "EMA",
            direction: "SELL",
            score: 95,
            reason: "EMA 9 below EMA 21 with price below EMA"
        });
    }

    // 8. VWAP
    if (technical.vwapSignal === "BULLISH") {
        strategies.push({
            name: "VWAP",
            direction: "BUY",
            score: 95,
            reason: "Price above VWAP"
        });
    }

    if (technical.vwapSignal === "BEARISH") {
        strategies.push({
            name: "VWAP",
            direction: "SELL",
            score: 95,
            reason: "Price below VWAP"
        });
    }

    // 9. RSI
    if (technical.rsiSignal === "BULLISH") {
        strategies.push({
            name: "RSI",
            direction: "BUY",
            score: 95,
            reason: "RSI bullish momentum"
        });
    }

    if (technical.rsiSignal === "BEARISH") {
        strategies.push({
            name: "RSI",
            direction: "SELL",
            score: 95,
            reason: "RSI bearish momentum"
        });
    }

    // 10. VOLUME
    if (volume === "HIGH_VOLUME") {
        if (trend === "BULLISH") {
            strategies.push({
                name: "VOLUME",
                direction: "BUY",
                score: 95,
                reason: "High volume with bullish trend"
            });
        }

        if (trend === "BEARISH") {
            strategies.push({
                name: "VOLUME",
                direction: "SELL",
                score: 95,
                reason: "High volume with bearish trend"
            });
        }
    }

    // 11. PRICE RANGE
    if (
        range.state === "LOWER_RANGE" &&
        trend === "BULLISH"
    ) {
        strategies.push({
            name: "PRICE_RANGE",
            direction: "BUY",
            score: 95,
            reason: "Price in lower range with bullish trend"
        });
    }

    if (
        range.state === "UPPER_RANGE" &&
        trend === "BEARISH"
    ) {
        strategies.push({
            name: "PRICE_RANGE",
            direction: "SELL",
            score: 95,
            reason: "Price in upper range with bearish trend"
        });
    }

    return strategies;
}

// ============================================================
// CONFLUENCE ENGINE
// ============================================================

function calculateConfluence(strategies) {
    const buy = strategies.filter(
        s => s.direction === "BUY"
    );

    const sell = strategies.filter(
        s => s.direction === "SELL"
    );

    const uniqueBuy =
        [...new Set(buy.map(s => s.name))];

    const uniqueSell =
        [...new Set(sell.map(s => s.name))];

    const buyAgreement =
        uniqueBuy.length;

    const sellAgreement =
        uniqueSell.length;

    /*
     * Score is based on:
     * - number of independent confirmations
     * - average quality
     * - capped at 100
     */

    function score(list) {
        if (!list.length) return 0;

        const unique =
            [...new Set(list.map(s => s.name))];

        const average =
            avg(list.map(s => s.score));

        const agreementBonus =
            Math.min(unique.length * 5, 25);

        return Math.round(
            clamp(
                average + agreementBonus,
                0,
                100
            )
        );
    }

    const buyScore = score(buy);
    const sellScore = score(sell);

    let decision = "WAIT";
    let confidence = Math.max(
        buyScore,
        sellScore
    );

    if (
        buyAgreement >= SETTINGS.minimumAgreement &&
        buyScore >= SETTINGS.minimumConfluence &&
        buyScore > sellScore
    ) {
        decision = "BUY";
    }

    if (
        sellAgreement >= SETTINGS.minimumAgreement &&
        sellScore >= SETTINGS.minimumConfluence &&
        sellScore > buyScore
    ) {
        decision = "SELL";
    }

    return {
        decision,
        confidence,
        buyScore,
        sellScore,
        buyAgreement,
        sellAgreement,
        buyStrategies: uniqueBuy,
        sellStrategies: uniqueSell
    };
}

// ============================================================
// TRADE PLAN
// ============================================================

function createTradePlan(
    candles,
    atrValue,
    decision
) {
    const price = last(candles).close;

    if (
        decision !== "BUY" &&
        decision !== "SELL"
    ) {
        return {
            entry: null,
            stopLoss: null,
            target: null,
            riskReward: null,
            optionType: null,
            suggestedStrike: null
        };
    }

    const risk =
        atrValue * SETTINGS.stopATR;

    const reward =
        atrValue * SETTINGS.targetATR;

    let stopLoss;
    let target;

    if (decision === "BUY") {
        stopLoss = price - risk;
        target = price + reward;
    } else {
        stopLoss = price + risk;
        target = price - reward;
    }

    const riskReward =
        reward / risk;

    const optionType =
        decision === "BUY" ? "CE" : "PE";

    const suggestedStrike =
        roundTo(
            price,
            SETTINGS.strikeStep
        );

    return {
        entry: Number(price.toFixed(2)),
        stopLoss: Number(stopLoss.toFixed(2)),
        target: Number(target.toFixed(2)),
        riskReward: Number(riskReward.toFixed(2)),
        optionType,
        suggestedStrike,

        /*
         * IMPORTANT:
         * Actual option premium entry requires
         * live option-chain data.
         */
        optionPremium: null
    };
}

// ============================================================
// MASTER ANALYSIS
// ============================================================

function analyzeMarket(inputCandles) {
    const candles =
        normalizeCandles(inputCandles);

    if (candles.length < 50) {
        return {
            success: false,
            error: "At least 50 candles are required."
        };
    }

    const structure =
        marketStructure(candles);

    const bos =
        detectBOS(
            candles,
            structure
        );

    const choch =
        detectCHOCH(
            structure,
            bos
        );

    const fvg =
        detectFVG(candles);

    const liquidity =
        detectLiquidity(candles);

    const fibonacci =
        fibonacciZone(
            candles,
            structure
        );

    const range =
        priceRange(candles);

    const atrValues =
        atr(
            candles,
            SETTINGS.atrPeriod
        );

    const currentATR =
        last(atrValues);

    const technical =
        technicalSignals(candles);

    const volume =
        volumeSignal(candles);

    const trend =
        trendFilter(
            structure,
            technical
        );

    const sideways =
        sidewaysFilter(
            candles,
            currentATR
        );

    const strategyData = {
        structure,
        bos,
        choch,
        fvg,
        liquidity,
        fibonacci,
        range,
        technical,
        volume,
        trend
    };

    const strategies =
        generateStrategySignals(
            strategyData
        );

    let confluence =
        calculateConfluence(strategies);

    /*
     * Sideways market protection.
     * Even if indicators agree, do not fire
     * a final trade signal in an extremely
     * compressed range.
     */
    if (sideways) {
        confluence.decision = "WAIT";
    }

    const trade =
        createTradePlan(
            candles,
            currentATR,
            confluence.decision
        );

    return {
        success: true,

        market: SETTINGS.market,
        timeframe: SETTINGS.timeframe,

        timestamp: new Date().toISOString(),

        decision: confluence.decision,
        confidence: confluence.confidence,

        entry: trade.entry,
        stopLoss: trade.stopLoss,
        target: trade.target,
        riskReward: trade.riskReward,

        optionType: trade.optionType,
        suggestedStrike: trade.suggestedStrike,
        optionPremium: trade.optionPremium,

        atr: Number(
            currentATR.toFixed(2)
        ),

        scores: {
            buy: confluence.buyScore,
            sell: confluence.sellScore,

            buyAgreement:
                confluence.buyAgreement,

            sellAgreement:
                confluence.sellAgreement
        },

        strategies: {
            buy:
                confluence.buyStrategies,

            sell:
                confluence.sellStrategies,

            details: strategies
        },

        marketAnalysis: {
            trend,
            structure:
                structure.direction,

            highStructure:
                structure.highStructure,

            lowStructure:
                structure.lowStructure,

            bos,
            choch,
            fvg,
            liquidity,
            fibonacci,
            priceRange:
                range.state,

            sideways
        },

        indicators: {
            ema9:
                Number(
                    technical.emaFast.toFixed(2)
                ),

            ema21:
                Number(
                    technical.emaSlow.toFixed(2)
                ),

            rsi:
                Number(
                    technical.rsi.toFixed(2)
                ),

            vwap:
                Number(
                    technical.vwap.toFixed(2)
                ),

            atr:
                Number(
                    currentATR.toFixed(2)
                ),

            volumeSignal:
                volume
        }
    };
}

// ============================================================
// EXPORTS
// ============================================================

// Browser
if (typeof window !== "undefined") {
    window.SHIV_AI_STRATEGY = {
        SETTINGS,
        analyzeMarket,
        normalizeCandles,
        ema,
        rsi,
        atr,
        vwap,
        marketStructure,
        detectBOS,
        detectCHOCH,
        detectFVG,
        detectLiquidity,
        fibonacciZone,
        priceRange,
        technicalSignals
    };
}

// Node / server
if (typeof module !== "undefined") {
    module.exports = {
        SETTINGS,
        analyzeMarket,
        normalizeCandles,
        ema,
        rsi,
        atr,
        vwap,
        marketStructure,
        detectBOS,
        detectCHOCH,
        detectFVG,
        detectLiquidity,
        fibonacciZone,
        priceRange,
        technicalSignals
    };
}
