// NIFTY AI Trading System
// Strategy engine - Phase 1

function calculateEMA(prices, period) {
    if (prices.length < period) return null;

    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
}

function calculateRSI(prices, period = 14) {
    if (prices.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];

        if (change > 0) {
            gains += change;
        } else {
            losses += Math.abs(change);
        }
    }

    if (losses === 0) return 100;

    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
}


// Strategy 1: EMA Trend
function emaStrategy(prices) {
    const ema9 = calculateEMA(prices, 9);
    const ema21 = calculateEMA(prices, 21);

    if (!ema9 || !ema21) return "WAIT";

    if (ema9 > ema21) return "BUY";
    if (ema9 < ema21) return "SELL";

    return "WAIT";
}


// Strategy 2: RSI
function rsiStrategy(prices) {
    const rsi = calculateRSI(prices);

    if (rsi === null) return "WAIT";

    if (rsi < 30) return "BUY";
    if (rsi > 70) return "SELL";

    return "WAIT";
}


// AI-style decision engine
function aiDecision(prices) {
    const emaSignal = emaStrategy(prices);
    const rsiSignal = rsiStrategy(prices);

    let buyScore = 0;
    let sellScore = 0;

    if (emaSignal === "BUY") buyScore++;
    if (emaSignal === "SELL") sellScore++;

    if (rsiSignal === "BUY") buyScore++;
    if (rsiSignal === "SELL") sellScore++;

    if (buyScore >= 2) {
        return {
            signal: "BUY",
            confidence: 80
        };
    }

    if (sellScore >= 2) {
        return {
            signal: "SELL",
            confidence: 80
        };
    }

    return {
        signal: "WAIT",
        confidence: 0
    };
}
