// ============================================================
// SHIV AI TRADING — FINAL MASTER STRATEGY ENGINE
// NIFTY | 5 MIN
// ============================================================

const SETTINGS = {
    market: "NIFTY",
    timeframe: "5m",

    minimumConfluence: 95,
    minimumAgreement: 3,

    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    atrPeriod: 14,
    volumePeriod: 20,

    adxPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    stochasticPeriod: 14,
    stochasticSignal: 3,
    cciPeriod: 20,
    bbPeriod: 20,
    bbStdDev: 2,
    rocPeriod: 12,
    mfiPeriod: 14,
    williamsPeriod: 14,
    supertrendMultiplier: 3,

    swingStrength: 2,
    liquidityLookback: 20,
    rangeLookback: 20,
    supportResistanceLookback: 50,

    stopATR: 1.5,
    targetATR: 3.0,

    strikeStep: 50,

    orbCandles: 3
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
// NORMALIZE CANDLES
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
// SMA
// ============================================================

function sma(values, period) {
    const out = new Array(values.length).fill(null);

    if (!values.length) return out;

    let rolling = 0;

    for (let i = 0; i < values.length; i++) {
        rolling += values[i];

        if (i >= period) {
            rolling -= values[i - period];
        }

        if (i >= period - 1) {
            out[i] = rolling / period;
        }
    }

    return out;
}

// ============================================================
// STANDARD DEVIATION
// ============================================================

function stddev(values, period) {
    const out = new Array(values.length).fill(null);

    for (let i = period - 1; i < values.length; i++) {
        const w = values.slice(i - period + 1, i + 1);
        const m = avg(w);

        out[i] = Math.sqrt(
            avg(w.map(v => (v - m) * (v - m)))
        );
    }

    return out;
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

    const result =
        new Array(values.length).fill(50);

    let gain = 0;
    let loss = 0;

    for (let i = 1; i <= period; i++) {
        const change =
            values[i] - values[i - 1];

        if (change >= 0) {
            gain += change;
        } else {
            loss += Math.abs(change);
        }
    }

    let avgGain = gain / period;
    let avgLoss = loss / period;

    result[period] =
        avgLoss === 0
            ? 100
            : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < values.length; i++) {
        const change =
            values[i] - values[i - 1];

        const currentGain =
            change > 0 ? change : 0;

        const currentLoss =
            change < 0 ? Math.abs(change) : 0;

        avgGain =
            ((avgGain * (period - 1)) +
                currentGain) / period;

        avgLoss =
            ((avgLoss * (period - 1)) +
                currentLoss) / period;

        result[i] =
            avgLoss === 0
                ? 100
                : 100 - 100 /
                    (1 + avgGain / avgLoss);
    }

    return result;
}

// ============================================================
// ATR
// ============================================================

function atr(candles, period = 14) {
    if (!candles.length) return [];

    const tr = candles.map((c, i) => {
        if (i === 0) {
            return c.high - c.low;
        }

        const previousClose =
            candles[i - 1].close;

        return Math.max(
            c.high - c.low,
            Math.abs(c.high - previousClose),
            Math.abs(c.low - previousClose)
        );
    });

    const result =
        new Array(candles.length).fill(0);

    let current =
        avg(
            tr.slice(
                0,
                Math.min(period, tr.length)
            )
        );

    for (let i = 0; i < candles.length; i++) {
        if (i < period) {
            result[i] = current;
        } else {
            current =
                (
                    (current * (period - 1)) +
                    tr[i]
                ) / period;

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

        const volume =
            c.volume || 1;

        cumulativePV +=
            typical * volume;

        cumulativeVolume += volume;

        return cumulativePV /
            cumulativeVolume;
    });
}

// ============================================================
// SWINGS
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

        for (
            let j = 1;
            j <= strength;
            j++
        ) {
            if (
                candles[i].high <=
                    candles[i - j].high ||
                candles[i].high <=
                    candles[i + j].high
            ) {
                swingHigh = false;
            }

            if (
                candles[i].low >=
                    candles[i - j].low ||
                candles[i].low >=
                    candles[i + j].low
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

    return {
        highs,
        lows
    };
}

// ============================================================
// MARKET STRUCTURE
// ============================================================

function marketStructure(candles) {
    const swings =
        findSwings(
            candles,
            SETTINGS.swingStrength
        );

    const highs = swings.highs;
    const lows = swings.lows;

    let highStructure = "NONE";
    let lowStructure = "NONE";

    if (highs.length >= 2) {
        highStructure =
            last(highs).price >
                highs[highs.length - 2].price
                ? "HH"
                : "LH";
    }

    if (lows.length >= 2) {
        lowStructure =
            last(lows).price >
                lows[lows.length - 2].price
                ? "HL"
                : "LL";
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
    const price =
        last(candles).close;

    const recentHigh =
        structure.highs.length
            ? last(structure.highs).price
            : null;

    const recentLow =
        structure.lows.length
            ? last(structure.lows).price
            : null;

    if (
        recentHigh &&
        price > recentHigh
    ) {
        return "BULLISH_BOS";
    }

    if (
        recentLow &&
        price < recentLow
    ) {
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

    const a =
        candles[candles.length - 3];

    const c =
        last(candles);

    if (c.low > a.high) {
        return "BULLISH_FVG";
    }

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

    const current =
        last(candles);

    const previousCandles =
        candles.slice(
            -lookback - 1,
            -1
        );

    const previousHigh =
        Math.max(
            ...previousCandles.map(
                c => c.high
            )
        );

    const previousLow =
        Math.min(
            ...previousCandles.map(
                c => c.low
            )
        );

    if (
        current.high > previousHigh &&
        current.close < previousHigh
    ) {
        return "BUY_SIDE_LIQUIDITY_SWEPT";
    }

    if (
        current.low < previousLow &&
        current.close > previousLow
    ) {
        return "SELL_SIDE_LIQUIDITY_SWEPT";
    }

    return "NONE";
}

// ============================================================
// FIBONACCI
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

    if (high <= low) {
        return "NONE";
    }

    const range = high - low;

    const fib618 =
        high - range * 0.618;

    const fib786 =
        high - range * 0.786;

    const price =
        last(candles).close;

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
        Math.max(
            ...data.map(c => c.high)
        );

    const low =
        Math.min(
            ...data.map(c => c.low)
        );

    const price =
        last(candles).close;

    const range =
        high - low;

    if (!range) {
        return {
            state: "NONE",
            high,
            low,
            position: 0.5
        };
    }

    const position =
        (price - low) / range;

    if (position > 0.8) {
        return {
            state: "UPPER_RANGE",
            high,
            low,
            position
        };
    }

    if (position < 0.2) {
        return {
            state: "LOWER_RANGE",
            high,
            low,
            position
        };
    }

    return {
        state: "RANGE",
        high,
        low,
        position
    };
}

// ============================================================
// VOLUME
// ============================================================

function volumeSignal(candles) {
    if (
        candles.length <
        SETTINGS.volumePeriod
    ) {
        return "NORMAL";
    }

    const current =
        last(candles).volume;

    const previousVolumes =
        candles
            .slice(
                -SETTINGS.volumePeriod - 1,
                -1
            )
            .map(c => c.volume);

    const average =
        avg(previousVolumes);

    if (
        average > 0 &&
        current >= average * 1.5
    ) {
        return "HIGH_VOLUME";
    }

    return "NORMAL";
}

// ============================================================
// MACD
// ============================================================

function macd(
    values,
    fast = 12,
    slow = 26,
    signal = 9
) {
    const fastEMA =
        ema(values, fast);

    const slowEMA =
        ema(values, slow);

    const line =
        values.map(
            (_, i) =>
                fastEMA[i] - slowEMA[i]
        );

    const signalLine =
        ema(line, signal);

    const histogram =
        line.map(
            (v, i) =>
                v - signalLine[i]
        );

    return {
        line,
        signal: signalLine,
        histogram
    };
}

// ============================================================
// STOCHASTIC
// ============================================================

function stochastic(
    candles,
    period = 14,
    signalPeriod = 3
) {
    const k =
        new Array(candles.length)
            .fill(50);

    for (
        let i = period - 1;
        i < candles.length;
        i++
    ) {
        const w =
            candles.slice(
                i - period + 1,
                i + 1
            );

        const high =
            Math.max(
                ...w.map(c => c.high)
            );

        const low =
            Math.min(
                ...w.map(c => c.low)
            );

        k[i] =
            high === low
                ? 50
                : (
                    (candles[i].close - low) /
                    (high - low)
                ) * 100;
    }

    const d =
        ema(k, signalPeriod);

    return {
        k,
        d
    };
}

// ============================================================
// CCI
// ============================================================

function cci(candles, period = 20) {
    const tp =
        candles.map(
            c =>
                (c.high +
                    c.low +
                    c.close) / 3
        );

    const ma =
        sma(tp, period);

    const out =
        new Array(candles.length)
            .fill(0);

    for (
        let i = period - 1;
        i < candles.length;
        i++
    ) {
        const w =
            tp.slice(
                i - period + 1,
                i + 1
            );

        const mean =
            ma[i];

        const deviation =
            avg(
                w.map(
                    v =>
                        Math.abs(
                            v - mean
                        )
                )
            );

        out[i] =
            deviation === 0
                ? 0
                : (
                    (tp[i] - mean) /
                    (0.015 * deviation)
                );
    }

    return out;
}

// ============================================================
// ADX
// ============================================================

function adx(candles, period = 14) {
    const n =
        candles.length;

    const tr =
        new Array(n).fill(0);

    const plusDM =
        new Array(n).fill(0);

    const minusDM =
        new Array(n).fill(0);

    for (
        let i = 1;
        i < n;
        i++
    ) {
        const up =
            candles[i].high -
            candles[i - 1].high;

        const down =
            candles[i - 1].low -
            candles[i].low;

        tr[i] =
            Math.max(
                candles[i].high -
                    candles[i].low,

                Math.abs(
                    candles[i].high -
                    candles[i - 1].close
                ),

                Math.abs(
                    candles[i].low -
                    candles[i - 1].close
                )
            );

        if (
            up > down &&
            up > 0
        ) {
            plusDM[i] = up;
        }

        if (
            down > up &&
            down > 0
        ) {
            minusDM[i] = down;
        }
    }

    const atrValues =
        atr(candles, period);

    const dx =
        new Array(n).fill(0);

    for (
        let i = period;
        i < n;
        i++
    ) {
        const plus =
            100 *
            (
                plusDM
                    .slice(
                        i - period + 1,
                        i + 1
                    )
                    .reduce(
                        (a, b) => a + b,
                        0
                    ) /
                (
                    atrValues[i] *
                    period || 1
                )
            );

        const minus =
            100 *
            (
                minusDM
                    .slice(
                        i - period + 1,
                        i + 1
                    )
                    .reduce(
                        (a, b) => a + b,
                        0
                    ) /
                (
                    atrValues[i] *
                    period || 1
                )
            );

        dx[i] =
            plus + minus === 0
                ? 0
                : 100 *
                    Math.abs(
                        plus - minus
                    ) /
                    (plus + minus);
    }

    const result =
        sma(dx, period);

    return {
        adx:
            result.map(
                x => x ?? 0
            ),
        plusDI: plusDM,
        minusDI: minusDM
    };
}

// ============================================================
// BOLLINGER BANDS
// ============================================================

function bollinger(
    values,
    period = 20,
    multiplier = 2
) {
    const middle =
        sma(values, period);

    const sd =
        stddev(values, period);

    const upper =
        values.map(
            (_, i) =>
                middle[i] == null
                    ? null
                    : middle[i] +
                        multiplier * sd[i]
        );

    const lower =
        values.map(
            (_, i) =>
                middle[i] == null
                    ? null
                    : middle[i] -
                        multiplier * sd[i]
        );

    return {
        middle,
        upper,
        lower
    };
}

// ============================================================
// SUPERTREND
// ============================================================

function supertrend(
    candles,
    period = 14,
    multiplier = 3
) {
    const atrValues =
        atr(candles, period);

    const upper = [];
    const lower = [];
    const trend = [];
    const direction = [];

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {
        const hl2 =
            (
                candles[i].high +
                candles[i].low
            ) / 2;

        upper[i] =
            hl2 +
            multiplier *
                atrValues[i];

        lower[i] =
            hl2 -
            multiplier *
                atrValues[i];

        if (i === 0) {
            trend[i] = upper[i];
            direction[i] = 1;
            continue;
        }

        const previousTrend =
            trend[i - 1];

        if (
            candles[i].close >
            upper[i - 1]
        ) {
            direction[i] = 1;
        } else if (
            candles[i].close <
            lower[i - 1]
        ) {
            direction[i] = -1;
        } else {
            direction[i] =
                direction[i - 1];
        }

        if (
            direction[i] === 1
        ) {
            trend[i] =
                Math.max(
                    lower[i],
                    previousTrend ===
                        upper[i - 1]
                        ? lower[i]
                        : previousTrend
                );
        } else {
            trend[i] =
                Math.min(
                    upper[i],
                    previousTrend ===
                        lower[i - 1]
                        ? upper[i]
                        : previousTrend
                );
        }
    }

    return {
        value: trend,
        direction
    };
}

// ============================================================
// ROC
// ============================================================

function roc(values, period = 12) {
    const result =
        new Array(values.length)
            .fill(0);

    for (
        let i = period;
        i < values.length;
        i++
    ) {
        result[i] =
            values[i - period] === 0
                ? 0
                : (
                    (values[i] -
                        values[i - period]) /
                    values[i - period]
                ) * 100;
    }

    return result;
}

// ============================================================
// MFI
// ============================================================

function mfi(candles, period = 14) {
    const result =
        new Array(candles.length)
            .fill(50);

    for (
        let i = period;
        i < candles.length;
        i++
    ) {
        let positive = 0;
        let negative = 0;

        for (
            let j =
                i - period + 1;
            j <= i;
            j++
        ) {
            const typical =
                (
                    candles[j].high +
                    candles[j].low +
                    candles[j].close
                ) / 3;

            const previousTypical =
                (
                    candles[j - 1].high +
                    candles[j - 1].low +
                    candles[j - 1].close
                ) / 3;

            const flow =
                typical *
                (candles[j].volume || 1);

            if (
                typical >
                previousTypical
            ) {
                positive += flow;
            } else if (
                typical <
                previousTypical
            ) {
                negative += flow;
            }
        }

        result[i] =
            negative === 0
                ? 100
                : 100 -
                    100 /
                        (
                            1 +
                            positive /
                                negative
                        );
    }

    return result;
}

// ============================================================
// WILLIAMS %R
// ============================================================

function williamsR(
    candles,
    period = 14
) {
    const result =
        new Array(candles.length)
            .fill(-50);

    for (
        let i = period - 1;
        i < candles.length;
        i++
    ) {
        const w =
            candles.slice(
                i - period + 1,
                i + 1
            );

        const high =
            Math.max(
                ...w.map(c => c.high)
            );

        const low =
            Math.min(
                ...w.map(c => c.low)
            );

        result[i] =
            high === low
                ? -50
                : (
                    (high -
                        candles[i].close) /
                    (high - low)
                ) * -100;
    }

    return result;
}

// ============================================================
// SUPPORT / RESISTANCE
// ============================================================

function supportResistance(
    candles,
    lookback = 50
) {
    const data =
        candles.slice(
            -Math.min(
                lookback,
                candles.length
            )
        );

    const highs =
        data.map(c => c.high);

    const lows =
        data.map(c => c.low);

    return {
        resistance:
            Math.max(...highs),
        support:
            Math.min(...lows)
    };
}

// ============================================================
// ORDER BLOCK
// ============================================================

function orderBlock(candles) {
    if (candles.length < 5) {
        return "NONE";
    }

    const current =
        last(candles);

    const previousCandle =
        candles[candles.length - 2];

    const previous2 =
        candles[candles.length - 3];

    const bullishImpulse =
        current.close >
            previousCandle.high &&
        previousCandle.close <
            previousCandle.open;

    const bearishImpulse =
        current.close <
            previousCandle.low &&
        previousCandle.close >
            previousCandle.open;

    if (
        bullishImpulse ||
        (
            current.close >
                previousCandle.high &&
            previous2.close <
                previous2.open
        )
    ) {
        return "BULLISH_OB";
    }

    if (
        bearishImpulse ||
        (
            current.close <
                previousCandle.low &&
            previous2.close >
                previous2.open
        )
    ) {
        return "BEARISH_OB";
    }

    return "NONE";
}

// ============================================================
// BREAKER BLOCK
// ============================================================

function breakerBlock(candles) {
    if (candles.length < 4) {
        return "NONE";
    }

    const previousCandle =
        candles[candles.length - 2];

    const current =
        last(candles);

    if (
        previousCandle.close <
            previousCandle.open &&
        current.close >
            previousCandle.high
    ) {
        return "BULLISH_BREAKER";
    }

    if (
        previousCandle.close >
            previousCandle.open &&
        current.close <
            previousCandle.low
    ) {
        return "BEARISH_BREAKER";
    }

    return "NONE";
}

// ============================================================
// BREAKOUT + RETEST
// ============================================================

function breakoutRetest(candles) {
    if (candles.length < 8) {
        return "NONE";
    }

    const previousCandles =
        candles.slice(-7, -1);

    const resistance =
        Math.max(
            ...previousCandles.map(
                c => c.high
            )
        );

    const support =
        Math.min(
            ...previousCandles.map(
                c => c.low
            )
        );

    const previousCandle =
        candles[candles.length - 2];

    const current =
        last(candles);

    if (
        previousCandle.close >
            resistance &&
        current.low <= resistance &&
        current.close > resistance
    ) {
        return "BULLISH_RETEST";
    }

    if (
        previousCandle.close <
            support &&
        current.high >= support &&
        current.close < support
    ) {
        return "BEARISH_RETEST";
    }

    return "NONE";
}

// ============================================================
// ORB
// ============================================================

function orb(candles, n = 3) {
    if (candles.length <= n) {
        return "NONE";
    }

    const opening =
        candles.slice(0, n);

    const high =
        Math.max(
            ...opening.map(c => c.high)
        );

    const low =
        Math.min(
            ...opening.map(c => c.low)
        );

    const current =
        last(candles);

    if (current.close > high) {
        return "BULLISH_ORB";
    }

    if (current.close < low) {
        return "BEARISH_ORB";
    }

    return "NONE";
}

// ============================================================
// PIVOT
// ============================================================

function pivotLevels(candles) {
    if (candles.length < 2) {
        return {
            pivot: null,
            r1: null,
            s1: null
        };
    }

    const previousCandle =
        candles[candles.length - 2];

    const pivot =
        (
            previousCandle.high +
            previousCandle.low +
            previousCandle.close
        ) / 3;

    return {
        pivot,
        r1:
            2 * pivot -
            previousCandle.low,

        s1:
            2 * pivot -
            previousCandle.high
    };
}

// ============================================================
// PRICE ACTION
// ============================================================

function candlePriceAction(candles) {
    const current =
        last(candles);

    const previousCandle =
        previous(candles);

    if (!previousCandle) {
        return "NONE";
    }

    const body =
        Math.abs(
            current.close -
            current.open
        );

    const range =
        current.high -
        current.low;

    if (range <= 0) {
        return "NONE";
    }

    const upperWick =
        current.high -
        Math.max(
            current.open,
            current.close
        );

    const lowerWick =
        Math.min(
            current.open,
            current.close
        ) -
        current.low;

    if (
        lowerWick >= body * 2 &&
        current.close > current.open
    ) {
        return "BULLISH_REJECTION";
    }

    if (
        upperWick >= body * 2 &&
        current.close < current.open
    ) {
        return "BEARISH_REJECTION";
    }

    if (
        current.close >
            current.open &&
        current.open <=
            previousCandle.close &&
        current.close >=
            previousCandle.open
    ) {
        return "BULLISH_ENGULFING";
    }

    if (
        current.close <
            current.open &&
        current.open >=
            previousCandle.close &&
        current.close <=
            previousCandle.open
    ) {
        return "BEARISH_ENGULFING";
    }

    return "NONE";
}

// ============================================================
// EQUAL HIGH / LOW
// ============================================================

function equalHighLow(
    candles,
    toleranceFactor = 0.15
) {
    if (candles.length < 6) {
        return "NONE";
    }

    const a =
        candles[candles.length - 2];

    const b =
        candles[candles.length - 4];

    const atrValue =
        last(
            atr(
                candles,
                SETTINGS.atrPeriod
            )
        ) || 1;

    const tolerance =
        atrValue * toleranceFactor;

    if (
        Math.abs(
            a.high - b.high
        ) <= tolerance
    ) {
        return "EQUAL_HIGH";
    }

    if (
        Math.abs(
            a.low - b.low
        ) <= tolerance
    ) {
        return "EQUAL_LOW";
    }

    return "NONE";
}

// ============================================================
// PREMIUM / DISCOUNT
// ============================================================

function premiumDiscount(
    candles,
    structure
) {
    if (
        !structure.highs.length ||
        !structure.lows.length
    ) {
        return "NONE";
    }

    const high =
        last(
            structure.highs
        ).price;

    const low =
        last(
            structure.lows
        ).price;

    if (high <= low) {
        return "NONE";
    }

    const middle =
        (high + low) / 2;

    const price =
        last(candles).close;

    if (price < middle) {
        return "DISCOUNT";
    }

    if (price > middle) {
        return "PREMIUM";
    }

    return "EQUILIBRIUM";
}

// ============================================================
// TECHNICAL SIGNALS
// ============================================================

function technicalSignals(candles) {
    const closes =
        candles.map(
            c => c.close
        );

    const emaFastValues =
        ema(
            closes,
            SETTINGS.emaFast
        );

    const emaSlowValues =
        ema(
            closes,
            SETTINGS.emaSlow
        );

    const rsiValues =
        rsi(
            closes,
            SETTINGS.rsiPeriod
        );

    const vwapValues =
        vwap(candles);

    const macdValues =
        macd(
            closes,
            SETTINGS.macdFast,
            SETTINGS.macdSlow,
            SETTINGS.macdSignal
        );

    const stochasticValues =
        stochastic(
            candles,
            SETTINGS.stochasticPeriod,
            SETTINGS.stochasticSignal
        );

    const cciValues =
        cci(
            candles,
            SETTINGS.cciPeriod
        );

    const adxValues =
        adx(
            candles,
            SETTINGS.adxPeriod
        );

    const bb =
        bollinger(
            closes,
            SETTINGS.bbPeriod,
            SETTINGS.bbStdDev
        );

    const supertrendValues =
        supertrend(
            candles,
            SETTINGS.atrPeriod,
            SETTINGS.supertrendMultiplier
        );

    const rocValues =
        roc(
            closes,
            SETTINGS.rocPeriod
        );

    const mfiValues =
        mfi(
            candles,
            SETTINGS.mfiPeriod
        );

    const williamsValues =
        williamsR(
            candles,
            SETTINGS.williamsPeriod
        );

    const price =
        last(candles).close;

    const current = {
        emaFast:
            last(emaFastValues),

        emaSlow:
            last(emaSlowValues),

        rsi:
            last(rsiValues),

        vwap:
            last(vwapValues),

        macd:
            last(macdValues.line),

        macdSignal:
            last(macdValues.signal),

        macdHist:
            last(macdValues.histogram),

        stochasticK:
            last(stochasticValues.k),

        stochasticD:
            last(stochasticValues.d),

        cci:
            last(cciValues),

        adx:
            last(adxValues.adx),

        bbMid:
            last(bb.middle),

        bbUpper:
            last(bb.upper),

        bbLower:
            last(bb.lower),

        supertrend:
            last(supertrendValues.value),

        supertrendDirection:
            last(
                supertrendValues.direction
            ),

        roc:
            last(rocValues),

        mfi:
            last(mfiValues),

        williamsR:
            last(williamsValues)
    };

    let emaSignal =
        "NEUTRAL";

    if (
        current.emaFast >
            current.emaSlow &&
        price >
            current.emaFast
    ) {
        emaSignal =
            "BULLISH";
    }

    if (
        current.emaFast <
            current.emaSlow &&
        price <
            current.emaFast
    ) {
        emaSignal =
            "BEARISH";
    }

    let rsiSignal =
        "NEUTRAL";

    if (
        current.rsi >= 55 &&
        current.rsi <= 75
    ) {
        rsiSignal =
            "BULLISH";
    }

    if (
        current.rsi <= 45 &&
        current.rsi >= 25
    ) {
        rsiSignal =
            "BEARISH";
    }

    let vwapSignal =
        "NEUTRAL";

    if (
        price >
        current.vwap
    ) {
        vwapSignal =
            "BULLISH";
    }

    if (
        price <
        current.vwap
    ) {
        vwapSignal =
            "BEARISH";
    }

    return {
        ...current,

        emaSignal,
        rsiSignal,
        vwapSignal
    };
}

// ============================================================
// TREND FILTER
// ============================================================

function trendFilter(
    structure,
    technical
) {
    let bullish = 0;
    let bearish = 0;

    if (
        structure.direction ===
        "BULLISH"
    ) {
        bullish++;
    }

    if (
        structure.direction ===
        "BEARISH"
    ) {
        bearish++;
    }

    if (
        technical.emaSignal ===
        "BULLISH"
    ) {
        bullish++;
    }

    if (
        technical.emaSignal ===
        "BEARISH"
    ) {
        bearish++;
    }

    if (
        technical.vwapSignal ===
        "BULLISH"
    ) {
        bullish++;
    }

    if (
        technical.vwapSignal ===
        "BEARISH"
    ) {
        bearish++;
    }

    if (
        technical.supertrendDirection ===
        1
    ) {
        bullish++;
    }

    if (
        technical.supertrendDirection ===
        -1
    ) {
        bearish++;
    }

    if (
        technical.adx >= 20 &&
        technical.macdHist > 0
    ) {
        bullish++;
    }

    if (
        technical.adx >= 20 &&
        technical.macdHist < 0
    ) {
        bearish++;
    }

    if (bullish >= 3) {
        return "BULLISH";
    }

    if (bearish >= 3) {
        return "BEARISH";
    }

    return "NEUTRAL";
}

// ============================================================
// SIDEWAYS FILTER
// ============================================================

function sidewaysFilter(
    candles,
    atrValue
) {
    if (!atrValue) {
        return true;
    }

    const recent =
        candles.slice(-10);

    const high =
        Math.max(
            ...recent.map(
                c => c.high
            )
        );

    const low =
        Math.min(
            ...recent.map(
                c => c.low
            )
        );

    return (
        high - low <=
        atrValue * 2
    );
}

// ============================================================
// TECHNICAL STRATEGY SIGNALS
// ============================================================

function signalFromTechnical(t) {
    const out = [];

    if (t.macdHist > 0) {
        out.push([
            "MACD",
            "BUY",
            8,
            "MACD histogram positive"
        ]);
    }

    if (t.macdHist < 0) {
        out.push([
            "MACD",
            "SELL",
            8,
            "MACD histogram negative"
        ]);
    }

    if (
        t.stochasticK >
            t.stochasticD &&
        t.stochasticK < 80
    ) {
        out.push([
            "STOCHASTIC",
            "BUY",
            5,
            "%K above %D"
        ]);
    }

    if (
        t.stochasticK <
            t.stochasticD &&
        t.stochasticK > 20
    ) {
        out.push([
            "STOCHASTIC",
            "SELL",
            5,
            "%K below %D"
        ]);
    }

    if (t.cci > 100) {
        out.push([
            "CCI",
            "BUY",
            5,
            "CCI above +100"
        ]);
    }

    if (t.cci < -100) {
        out.push([
            "CCI",
            "SELL",
            5,
            "CCI below -100"
        ]);
    }

    if (
        t.adx >= 20 &&
        t.macdHist > 0
    ) {
        out.push([
            "ADX",
            "BUY",
            6,
            "Trend strength with positive momentum"
        ]);
    }

    if (
        t.adx >= 20 &&
        t.macdHist < 0
    ) {
        out.push([
            "ADX",
            "SELL",
            6,
            "Trend strength with negative momentum"
        ]);
    }

    if (
        t.supertrendDirection === 1
    ) {
        out.push([
            "SUPERTREND",
            "BUY",
            8,
            "Supertrend bullish"
        ]);
    }

    if (
        t.supertrendDirection === -1
    ) {
        out.push([
            "SUPERTREND",
            "SELL",
            8,
            "Supertrend bearish"
        ]);
    }

    if (t.roc > 0) {
        out.push([
            "ROC",
            "BUY",
            4,
            "Rate of change positive"
        ]);
    }

    if (t.roc < 0) {
        out.push([
            "ROC",
            "SELL",
            4,
            "Rate of change negative"
        ]);
    }

    if (
        t.mfi >= 55 &&
        t.mfi <= 80
    ) {
        out.push([
            "MFI",
            "BUY",
            4,
            "Money flow bullish"
        ]);
    }

    if (
        t.mfi <= 45 &&
        t.mfi >= 20
    ) {
        out.push([
            "MFI",
            "SELL",
            4,
            "Money flow bearish"
        ]);
    }

    if (t.williamsR > -50) {
        out.push([
            "WILLIAMS_R",
            "BUY",
            3,
            "Williams %R bullish side"
        ]);
    }

    if (t.williamsR < -50) {
        out.push([
            "WILLIAMS_R",
            "SELL",
            3,
            "Williams %R bearish side"
        ]);
    }

    if (
        t.bbUpper != null &&
        t.bbLower != null &&
        t.bbUpper > t.bbLower
    ) {
        if (t.macdHist > 0) {
            out.push([
                "BOLLINGER",
                "BUY",
                4,
                "Momentum aligned with Bollinger regime"
            ]);
        }

        if (t.macdHist < 0) {
            out.push([
                "BOLLINGER",
                "SELL",
                4,
                "Momentum aligned with Bollinger regime"
            ]);
        }
    }

    return out;
}

// ============================================================
// STRATEGY SIGNALS
// ============================================================

function generateStrategySignals(data) {
    const {
        candles,
        structure,
        bos,
        choch,
        fvg,
        liquidity,
        fibonacci,
        range,
        technical,
        volume,
        trend,
        orderBlock,
        breaker,
        retest,
        orbSignal,
        sr,
        pivots,
        priceAction,
        equalHL,
        pd
    } = data;

    const strategies = [];

    function push(
        name,
        direction,
        score,
        reason
    ) {
        strategies.push({
            name,
            direction,
            score,
            reason
        });
    }

    // ========================================================
    // EXISTING STRATEGIES
    // ========================================================

    if (
        structure.direction ===
        "BULLISH"
    ) {
        push(
            "MARKET_STRUCTURE",
            "BUY",
            100,
            "HH + HL structure"
        );
    }

    if (
        structure.direction ===
        "BEARISH"
    ) {
        push(
            "MARKET_STRUCTURE",
            "SELL",
            100,
            "LH + LL structure"
        );
    }

    if (
        bos ===
        "BULLISH_BOS"
    ) {
        push(
            "BOS",
            "BUY",
            100,
            "Bullish break of structure"
        );
    }

    if (
        bos ===
        "BEARISH_BOS"
    ) {
        push(
            "BOS",
            "SELL",
            100,
            "Bearish break of structure"
        );
    }

    if (
        choch ===
        "BULLISH_CHOCH"
    ) {
        push(
            "CHOCH",
            "BUY",
            100,
            "Bullish change of character"
        );
    }

    if (
        choch ===
        "BEARISH_CHOCH"
    ) {
        push(
            "CHOCH",
            "SELL",
            100,
            "Bearish change of character"
        );
    }

    if (
        fvg ===
        "BULLISH_FVG"
    ) {
        push(
            "FVG",
            "BUY",
            95,
            "Bullish fair value gap"
        );
    }

    if (
        fvg ===
        "BEARISH_FVG"
    ) {
        push(
            "FVG",
            "SELL",
            95,
            "Bearish fair value gap"
        );
    }

    if (
        liquidity ===
        "SELL_SIDE_LIQUIDITY_SWEPT"
    ) {
        push(
            "LIQUIDITY",
            "BUY",
            100,
            "Sell-side liquidity swept"
        );
    }

    if (
        liquidity ===
        "BUY_SIDE_LIQUIDITY_SWEPT"
    ) {
        push(
            "LIQUIDITY",
            "SELL",
            100,
            "Buy-side liquidity swept"
        );
    }

    if (
        fibonacci ===
            "GOLDEN_ZONE" &&
        trend ===
            "BULLISH"
    ) {
        push(
            "FIBONACCI",
            "BUY",
            95,
            "Price inside Fibonacci golden zone"
        );
    }

    if (
        fibonacci ===
            "GOLDEN_ZONE" &&
        trend ===
            "BEARISH"
    ) {
        push(
            "FIBONACCI",
            "SELL",
            95,
            "Price inside Fibonacci golden zone"
        );
    }

    if (
        technical.emaSignal ===
        "BULLISH"
    ) {
        push(
            "EMA",
            "BUY",
            95,
            "EMA 9 above EMA 21 with price above EMA"
        );
    }

    if (
        technical.emaSignal ===
        "BEARISH"
    ) {
        push(
            "EMA",
            "SELL",
            95,
            "EMA 9 below EMA 21 with price below EMA"
        );
    }

    if (
        technical.vwapSignal ===
        "BULLISH"
    ) {
        push(
            "VWAP",
            "BUY",
            95,
            "Price above VWAP"
        );
    }

    if (
        technical.vwapSignal ===
        "BEARISH"
    ) {
        push(
            "VWAP",
            "SELL",
            95,
            "Price below VWAP"
        );
    }

    if (
        technical.rsiSignal ===
        "BULLISH"
    ) {
        push(
            "RSI",
            "BUY",
            95,
            "RSI bullish momentum"
        );
    }

    if (
        technical.rsiSignal ===
        "BEARISH"
    ) {
        push(
            "RSI",
            "SELL",
            95,
            "RSI bearish momentum"
        );
    }

    if (
        volume ===
            "HIGH_VOLUME" &&
        trend ===
            "BULLISH"
    ) {
        push(
            "VOLUME",
            "BUY",
            95,
            "High volume with bullish trend"
        );
    }

    if (
        volume ===
            "HIGH_VOLUME" &&
        trend ===
            "BEARISH"
    ) {
        push(
            "VOLUME",
            "SELL",
            95,
            "High volume with bearish trend"
        );
    }

    if (
        range.state ===
            "LOWER_RANGE" &&
        trend ===
            "BULLISH"
    ) {
        push(
            "PRICE_RANGE",
            "BUY",
            95,
            "Price in lower range with bullish trend"
        );
    }

    if (
        range.state ===
            "UPPER_RANGE" &&
        trend ===
            "BEARISH"
    ) {
        push(
            "PRICE_RANGE",
            "SELL",
            95,
            "Price in upper range with bearish trend"
        );
    }

    // ========================================================
    // NEW STRATEGIES
    // ========================================================

    if (
        orderBlock ===
        "BULLISH_OB"
    ) {
        push(
            "ORDER_BLOCK",
            "BUY",
            85,
            "Bullish order block / displacement"
        );
    }

    if (
        orderBlock ===
        "BEARISH_OB"
    ) {
        push(
            "ORDER_BLOCK",
            "SELL",
            85,
            "Bearish order block / displacement"
        );
    }

    if (
        breaker ===
        "BULLISH_BREAKER"
    ) {
        push(
            "BREAKER_BLOCK",
            "BUY",
            80,
            "Bullish breaker confirmation"
        );
    }

    if (
        breaker ===
        "BEARISH_BREAKER"
    ) {
        push(
            "BREAKER_BLOCK",
            "SELL",
            80,
            "Bearish breaker confirmation"
        );
    }

    if (
        retest ===
        "BULLISH_RETEST"
    ) {
        push(
            "BREAKOUT_RETEST",
            "BUY",
            85,
            "Bullish breakout followed by retest"
        );
    }

    if (
        retest ===
        "BEARISH_RETEST"
    ) {
        push(
            "BREAKOUT_RETEST",
            "SELL",
            85,
            "Bearish breakout followed by retest"
        );
    }

    if (
        orbSignal ===
        "BULLISH_ORB"
    ) {
        push(
            "ORB",
            "BUY",
            80,
            "Opening range breakout"
        );
    }

    if (
        orbSignal ===
        "BEARISH_ORB"
    ) {
        push(
            "ORB",
            "SELL",
            80,
            "Opening range breakdown"
        );
    }

    const price =
        last(candles).close;

    if (
        price >
            sr.resistance &&
        technical.macdHist > 0
    ) {
        push(
            "SUPPORT_RESISTANCE",
            "BUY",
            70,
            "Price above recent resistance"
        );
    }

    if (
        price <
            sr.support &&
        technical.macdHist < 0
    ) {
        push(
            "SUPPORT_RESISTANCE",
            "SELL",
            70,
            "Price below recent support"
        );
    }

    if (
        pivots.pivot != null &&
        price > pivots.pivot &&
        technical.macdHist > 0
    ) {
        push(
            "PIVOT",
            "BUY",
            55,
            "Price above previous pivot"
        );
    }

    if (
        pivots.pivot != null &&
        price < pivots.pivot &&
        technical.macdHist < 0
    ) {
        push(
            "PIVOT",
            "SELL",
            55,
            "Price below previous pivot"
        );
    }

    if (
        priceAction ===
            "BULLISH_REJECTION" ||
        priceAction ===
            "BULLISH_ENGULFING"
    ) {
        push(
            "PRICE_ACTION",
            "BUY",
            75,
            priceAction
        );
    }

    if (
        priceAction ===
            "BEARISH_REJECTION" ||
        priceAction ===
            "BEARISH_ENGULFING"
    ) {
        push(
            "PRICE_ACTION",
            "SELL",
            75,
            priceAction
        );
    }

    if (
        equalHL ===
            "EQUAL_LOW" &&
        liquidity ===
            "SELL_SIDE_LIQUIDITY_SWEPT"
    ) {
        push(
            "EQUAL_LEVEL_SWEEP",
            "BUY",
            75,
            "Equal lows swept"
        );
    }

    if (
        equalHL ===
            "EQUAL_HIGH" &&
        liquidity ===
            "BUY_SIDE_LIQUIDITY_SWEPT"
    ) {
        push(
            "EQUAL_LEVEL_SWEEP",
            "SELL",
            75,
            "Equal highs swept"
        );
    }

    if (
        pd ===
            "DISCOUNT" &&
        trend ===
            "BULLISH"
    ) {
        push(
            "PREMIUM_DISCOUNT",
            "BUY",
            65,
            "Bullish context in discount"
        );
    }

    if (
        pd ===
            "PREMIUM" &&
        trend ===
            "BEARISH"
    ) {
        push(
            "PREMIUM_DISCOUNT",
            "SELL",
            65,
            "Bearish context in premium"
        );
    }

    const technicalSignals =
        signalFromTechnical(
            technical
        );

    for (
        const signal of
        technicalSignals
    ) {
        push(
            signal[0],
            signal[1],
            signal[2],
            signal[3]
        );
    }

    return strategies;
}

// ============================================================
// CONFLUENCE ENGINE
// ============================================================

function calculateConfluence(
    strategies
) {
    const WEIGHTS = {
        MARKET_STRUCTURE: 15,
        BOS: 15,
        CHOCH: 10,
        FVG: 8,
        LIQUIDITY: 8,
        FIBONACCI: 5,
        EMA: 12,
        VWAP: 10,
        RSI: 7,
        VOLUME: 5,
        PRICE_RANGE: 5,

        ORDER_BLOCK: 8,
        BREAKER_BLOCK: 6,
        BREAKOUT_RETEST: 8,
        ORB: 6,
        SUPPORT_RESISTANCE: 5,
        PIVOT: 3,
        PRICE_ACTION: 6,
        EQUAL_LEVEL_SWEEP: 6,
        PREMIUM_DISCOUNT: 4,

        MACD: 6,
        STOCHASTIC: 4,
        CCI: 4,
        ADX: 5,
        SUPERTREND: 6,
        BOLLINGER: 3,
        ROC: 3,
        MFI: 3,
        WILLIAMS_R: 2
    };

    const GROUPS = {
        MARKET_STRUCTURE: [
            "MARKET_STRUCTURE",
            "BOS",
            "CHOCH"
        ],

        LIQUIDITY: [
            "LIQUIDITY",
            "FVG",
            "ORDER_BLOCK",
            "BREAKER_BLOCK",
            "EQUAL_LEVEL_SWEEP",
            "PREMIUM_DISCOUNT"
        ],

        TREND: [
            "EMA",
            "VWAP",
            "SUPERTREND",
            "ICHIMOKU"
        ],

        MOMENTUM: [
            "RSI",
            "MACD",
            "STOCHASTIC",
            "CCI",
            "ROC",
            "WILLIAMS_R"
        ],

        VOLUME: [
            "VOLUME",
            "MFI"
        ],

        VOLATILITY: [
            "BOLLINGER"
        ],

        ENTRY: [
            "ORB",
            "BREAKOUT_RETEST",
            "PRICE_ACTION",
            "SUPPORT_RESISTANCE",
            "PIVOT",
            "PRICE_RANGE"
        ]
    };

    const CAPS = {
        MARKET_STRUCTURE: 30,
        LIQUIDITY: 24,
        TREND: 22,
        MOMENTUM: 18,
        VOLUME: 8,
        VOLATILITY: 4,
        ENTRY: 18
    };

    function side(direction) {
        const selected =
            strategies.filter(
                s =>
                    s.direction ===
                    direction
            );

        const unique =
            [
                ...new Set(
                    selected.map(
                        s => s.name
                    )
                )
            ];

        let score = 0;

        const groupScores = {};

        for (
            const group of
            Object.keys(GROUPS)
        ) {
            const names =
                GROUPS[group];

            const groupScore =
                unique
                    .filter(
                        n =>
                            names.includes(n)
                    )
                    .reduce(
                        (a, n) =>
                            a +
                            (
                                WEIGHTS[n] ||
                                0
                            ),
                        0
                    );

            groupScores[group] =
                Math.min(
                    groupScore,
                    CAPS[group]
                );

            score +=
                groupScores[group];
        }

        const normalized =
            Math.round(
                clamp(
                    (
                        score / 124
                    ) * 100,
                    0,
                    100
                )
            );

        return {
            score: normalized,
            rawScore: score,
            agreement:
                unique.length,
            names: unique,
            groupScores
        };
    }

    const buy =
        side("BUY");

    const sell =
        side("SELL");

    let decision =
        "WAIT";

    const scoreDifference =
        Math.abs(
            buy.score -
            sell.score
        );

    if (
        buy.agreement >=
            SETTINGS.minimumAgreement &&
        buy.score >=
            SETTINGS.minimumConfluence &&
        buy.score >
            sell.score &&
        scoreDifference >= 15
    ) {
        decision = "BUY";
    }

    if (
        sell.agreement >=
            SETTINGS.minimumAgreement &&
        sell.score >=
            SETTINGS.minimumConfluence &&
        sell.score >
            buy.score &&
        scoreDifference >= 15
    ) {
        decision = "SELL";
    }

    const dominant =
        Math.max(
            buy.score,
            sell.score
        );

    return {
        decision,

        confidence:
            decision === "WAIT"
                ? Math.min(
                    dominant,
                    99
                )
                : dominant,

        buyScore:
            buy.score,

        sellScore:
            sell.score,

        buyAgreement:
            buy.agreement,

        sellAgreement:
            sell.agreement,

        buyStrategies:
            buy.names,

        sellStrategies:
            sell.names,

        buyGroups:
            buy.groupScores,

        sellGroups:
            sell.groupScores
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
    const price =
        last(candles).close;

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
            suggestedStrike: null,
            optionPremium: null
        };
    }

    const risk =
        atrValue *
        SETTINGS.stopATR;

    const reward =
        atrValue *
        SETTINGS.targetATR;

    const stopLoss =
        decision === "BUY"
            ? price - risk
            : price + risk;

    const target =
        decision === "BUY"
            ? price + reward
            : price - reward;

    return {
        entry:
            Number(
                price.toFixed(2)
            ),

        stopLoss:
            Number(
                stopLoss.toFixed(2)
            ),

        target:
            Number(
                target.toFixed(2)
            ),

        riskReward:
            Number(
                (
                    reward / risk
                ).toFixed(2)
            ),

        optionType:
            decision === "BUY"
                ? "CE"
                : "PE",

        suggestedStrike:
            roundTo(
                price,
                SETTINGS.strikeStep
            ),

        optionPremium: null
    };
}

// ============================================================
// MASTER ANALYSIS
// ============================================================

function analyzeMarket(
    inputCandles
) {
    const candles =
        normalizeCandles(
            inputCandles
        );

    if (candles.length < 50) {
        return {
            success: false,
            error:
                "At least 50 candles are required."
        };
    }

    const structure =
        marketStructure(
            candles
        );

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
        detectFVG(
            candles
        );

    const liquidity =
        detectLiquidity(
            candles
        );

    const fibonacci =
        fibonacciZone(
            candles,
            structure
        );

    const range =
        priceRange(
            candles
        );

    const atrValues =
        atr(
            candles,
            SETTINGS.atrPeriod
        );

    const currentATR =
        last(atrValues);

    const technical =
        technicalSignals(
            candles
        );

    const volume =
        volumeSignal(
            candles
        );

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

    const orderBlockSignal =
        orderBlock(
            candles
        );

    const breaker =
        breakerBlock(
            candles
        );

    const retest =
        breakoutRetest(
            candles
        );

    const orbSignal =
        orb(
            candles,
            SETTINGS.orbCandles
        );

    const sr =
        supportResistance(
            candles,
            SETTINGS.supportResistanceLookback
        );

    const pivots =
        pivotLevels(
            candles
        );

    const priceAction =
        candlePriceAction(
            candles
        );

    const equalHL =
        equalHighLow(
            candles
        );

    const pd =
        premiumDiscount(
            candles,
            structure
        );

    const strategyData = {
        candles,
        atrValue: currentATR,
        structure,
        bos,
        choch,
        fvg,
        liquidity,
        fibonacci,
        range,
        technical,
        volume,
        trend,
        orderBlock:
            orderBlockSignal,
        breaker,
        retest,
        orbSignal,
        sr,
        pivots,
        priceAction,
        equalHL,
        pd
    };

    const strategies =
        generateStrategySignals(
            strategyData
        );

    let confluence =
        calculateConfluence(
            strategies
        );

    if (sideways) {
        confluence.decision =
            "WAIT";
    }

    const trade =
        createTradePlan(
            candles,
            currentATR,
            confluence.decision
        );

    return {
        success: true,

        market:
            SETTINGS.market,

        timeframe:
            SETTINGS.timeframe,

        timestamp:
            new Date().toISOString(),

        decision:
            confluence.decision,

        confidence:
            confluence.confidence,

        entry:
            trade.entry,

        stopLoss:
            trade.stopLoss,

        target:
            trade.target,

        riskReward:
            trade.riskReward,

        optionType:
            trade.optionType,

        suggestedStrike:
            trade.suggestedStrike,

        optionPremium:
            trade.optionPremium,

        atr:
            Number(
                currentATR.toFixed(2)
            ),

        scores: {
            buy:
                confluence.buyScore,

            sell:
                confluence.sellScore,

            buyAgreement:
                confluence.buyAgreement,

            sellAgreement:
                confluence.sellAgreement,

            buyGroups:
                confluence.buyGroups,

            sellGroups:
                confluence.sellGroups
        },

        strategies: {
            buy:
                confluence.buyStrategies,

            sell:
                confluence.sellStrategies,

            details:
                strategies
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

            sideways,

            orderBlock:
                orderBlockSignal,

            breakerBlock:
                breaker,

            breakoutRetest:
                retest,

            orb:
                orbSignal,

            support:
                sr.support,

            resistance:
                sr.resistance,

            pivot:
                pivots.pivot,

            priceAction,

            equalHighLow:
                equalHL,

            premiumDiscount:
                pd
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
                volume,

            macd:
                Number(
                    technical.macd.toFixed(4)
                ),

            macdSignal:
                Number(
                    technical.macdSignal.toFixed(4)
                ),

            macdHistogram:
                Number(
                    technical.macdHist.toFixed(4)
                ),

            stochasticK:
                Number(
                    technical.stochasticK.toFixed(2)
                ),

            stochasticD:
                Number(
                    technical.stochasticD.toFixed(2)
                ),

            cci:
                Number(
                    technical.cci.toFixed(2)
                ),

            adx:
                Number(
                    technical.adx.toFixed(2)
                ),

            supertrend:
                Number(
                    technical.supertrend.toFixed(2)
                ),

            bollingerUpper:
                technical.bbUpper ==
                    null
                    ? null
                    : Number(
                        technical.bbUpper.toFixed(2)
                    ),

            bollingerLower:
                technical.bbLower ==
                    null
                    ? null
                    : Number(
                        technical.bbLower.toFixed(2)
                    ),

            roc:
                Number(
                    technical.roc.toFixed(2)
                ),

            mfi:
                Number(
                    technical.mfi.toFixed(2)
                ),

            williamsR:
                Number(
                    technical.williamsR.toFixed(2)
                )
        }
    };
}

// ============================================================
// EXPORTS
// ============================================================

if (
    typeof window !==
    "undefined"
) {
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

if (
    typeof module !==
    "undefined"
) {
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
        technicalSignals,

        macd,
        stochastic,
        cci,
        adx,
        bollinger,
        supertrend,
        roc,
        mfi,
        williamsR,

        orderBlock,
        breakerBlock,
        breakoutRetest,
        orb,
        supportResistance,
        pivotLevels,
        candlePriceAction,
        equalHighLow,
        premiumDiscount
    };
}
