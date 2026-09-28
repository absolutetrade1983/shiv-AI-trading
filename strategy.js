// ============================================================
// SHIV AI TRADING — FINAL MASTER STRATEGY ENGINE
// NIFTY | BANK NIFTY | SENSEX
// 5 MIN | MULTI-STRATEGY CONFLUENCE
// ============================================================

const SETTINGS = {
    market: "NIFTY",
    timeframe: "5m",

    minimumConfluence: 65,
    minimumAgreement: 3,
    minimumDifference: 12,

    // Strong signal can reach 100 score
    strongSignalScore: 80,

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
// HELPERS
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
    if (!arr || !arr.length) return 0;

    return arr.reduce(
        (a, b) => a + b,
        0
    ) / arr.length;
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
            time:
                c.time ??
                c.timestamp ??
                i,

            open:
                Number(c.open),

            high:
                Number(c.high),

            low:
                Number(c.low),

            close:
                Number(c.close),

            volume:
                Number(
                    c.volume ?? 0
                )
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

    const out =
        new Array(values.length)
            .fill(null);

    let rolling = 0;

    for (
        let i = 0;
        i < values.length;
        i++
    ) {

        rolling += values[i];

        if (i >= period) {
            rolling -=
                values[i - period];
        }

        if (i >= period - 1) {
            out[i] =
                rolling / period;
        }
    }

    return out;
}

// ============================================================
// STD DEV
// ============================================================

function stddev(values, period) {

    const out =
        new Array(values.length)
            .fill(null);

    for (
        let i = period - 1;
        i < values.length;
        i++
    ) {

        const window =
            values.slice(
                i - period + 1,
                i + 1
            );

        const mean =
            avg(window);

        out[i] =
            Math.sqrt(
                avg(
                    window.map(
                        v =>
                            (v - mean) *
                            (v - mean)
                    )
                )
            );
    }

    return out;
}

// ============================================================
// EMA
// ============================================================

function ema(values, period) {

    if (!values.length) {
        return [];
    }

    const result = [];

    const multiplier =
        2 / (period + 1);

    let current =
        values[0];

    result.push(current);

    for (
        let i = 1;
        i < values.length;
        i++
    ) {

        current =
            (
                values[i] -
                current
            ) *
            multiplier +
            current;

        result.push(current);
    }

    return result;
}

// ============================================================
// RSI
// ============================================================

function rsi(values, period = 14) {

    if (
        values.length <= period
    ) {

        return values.map(
            () => 50
        );
    }

    const result =
        new Array(values.length)
            .fill(50);

    let gain = 0;
    let loss = 0;

    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const change =
            values[i] -
            values[i - 1];

        if (change >= 0) {
            gain += change;
        } else {
            loss +=
                Math.abs(change);
        }
    }

    let avgGain =
        gain / period;

    let avgLoss =
        loss / period;

    result[period] =
        avgLoss === 0
            ? 100
            : 100 -
                100 /
                    (
                        1 +
                        avgGain /
                            avgLoss
                    );

    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

        const change =
            values[i] -
            values[i - 1];

        const currentGain =
            change > 0
                ? change
                : 0;

        const currentLoss =
            change < 0
                ? Math.abs(change)
                : 0;

        avgGain =
            (
                avgGain *
                    (period - 1) +
                currentGain
            ) / period;

        avgLoss =
            (
                avgLoss *
                    (period - 1) +
                currentLoss
            ) / period;

        result[i] =
            avgLoss === 0
                ? 100
                : 100 -
                    100 /
                        (
                            1 +
                            avgGain /
                                avgLoss
                        );
    }

    return result;
}

// ============================================================
// ATR
// ============================================================

function atr(
    candles,
    period = 14
) {

    if (!candles.length) {
        return [];
    }

    const tr =
        candles.map(
            (c, i) => {

                if (i === 0) {
                    return (
                        c.high -
                        c.low
                    );
                }

                const pc =
                    candles[
                        i - 1
                    ].close;

                return Math.max(
                    c.high - c.low,

                    Math.abs(
                        c.high - pc
                    ),

                    Math.abs(
                        c.low - pc
                    )
                );
            }
        );

    const result =
        new Array(
            candles.length
        ).fill(0);

    let current =
        avg(
            tr.slice(
                0,
                Math.min(
                    period,
                    tr.length
                )
            )
        );

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {

        if (i < period) {

            result[i] =
                current;

        } else {

            current =
                (
                    current *
                        (period - 1) +
                    tr[i]
                ) / period;

            result[i] =
                current;
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
            (
                c.high +
                c.low +
                c.close
            ) / 3;

        const volume =
            c.volume || 1;

        cumulativePV +=
            typical * volume;

        cumulativeVolume +=
            volume;

        return (
            cumulativePV /
            cumulativeVolume
        );
    });
}

// ============================================================
// SWINGS
// ============================================================

function findSwings(
    candles,
    strength = 2
) {

    const highs = [];
    const lows = [];

    for (
        let i = strength;
        i <
            candles.length -
            strength;
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

                swingHigh =
                    false;
            }

            if (
                candles[i].low >=
                    candles[i - j].low ||
                candles[i].low >=
                    candles[i + j].low
            ) {

                swingLow =
                    false;
            }
        }

        if (swingHigh) {

            highs.push({
                index: i,
                price:
                    candles[i].high
            });
        }

        if (swingLow) {

            lows.push({
                index: i,
                price:
                    candles[i].low
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

    const highs =
        swings.highs;

    const lows =
        swings.lows;

    let highStructure =
        "NONE";

    let lowStructure =
        "NONE";

    if (highs.length >= 2) {

        highStructure =
            last(highs).price >
                highs[
                    highs.length - 2
                ].price
                ? "HH"
                : "LH";
    }

    if (lows.length >= 2) {

        lowStructure =
            last(lows).price >
                lows[
                    lows.length - 2
                ].price
                ? "HL"
                : "LL";
    }

    let direction =
        "NEUTRAL";

    if (
        highStructure === "HH" &&
        lowStructure === "HL"
    ) {

        direction =
            "BULLISH";
    }

    if (
        highStructure === "LH" &&
        lowStructure === "LL"
    ) {

        direction =
            "BEARISH";
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

function detectBOS(
    candles,
    structure
) {

    const price =
        last(candles).close;

    const recentHigh =
        structure.highs.length
            ? last(
                structure.highs
            ).price
            : null;

    const recentLow =
        structure.lows.length
            ? last(
                structure.lows
            ).price
            : null;

    if (
        recentHigh !== null &&
        price > recentHigh
    ) {

        return "BULLISH_BOS";
    }

    if (
        recentLow !== null &&
        price < recentLow
    ) {

        return "BEARISH_BOS";
    }

    return "NONE";
}

// ============================================================
// CHOCH
// ============================================================

function detectCHOCH(
    structure,
    bos
) {

    if (
        structure.direction ===
            "BEARISH" &&
        bos === "BULLISH_BOS"
    ) {

        return "BULLISH_CHOCH";
    }

    if (
        structure.direction ===
            "BULLISH" &&
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
        candles[
            candles.length - 3
        ];

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

function detectLiquidity(
    candles
) {

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
        current.high >
            previousHigh &&
        current.close <
            previousHigh
    ) {

        return "BUY_SIDE_LIQUIDITY_SWEPT";
    }

    if (
        current.low <
            previousLow &&
        current.close >
            previousLow
    ) {

        return "SELL_SIDE_LIQUIDITY_SWEPT";
    }

    return "NONE";
}

// ============================================================
// FIBONACCI
// ============================================================

function fibonacciZone(
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

    const range =
        high - low;

    const fib618 =
        high -
        range * 0.618;

    const fib786 =
        high -
        range * 0.786;

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
        candles.slice(
            -lookback
        );

    const high =
        Math.max(
            ...data.map(
                c => c.high
            )
        );

    const low =
        Math.min(
            ...data.map(
                c => c.low
            )
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
        (price - low) /
        range;

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

function volumeSignal(
    candles
) {

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
            .map(
                c => c.volume
            );

    const average =
        avg(previousVolumes);

    if (
        average > 0 &&
        current >=
            average * 1.5
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
                fastEMA[i] -
                slowEMA[i]
        );

    const signalLine =
        ema(
            line,
            signal
        );

    const histogram =
        line.map(
            (v, i) =>
                v -
                signalLine[i]
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
        new Array(
            candles.length
        ).fill(50);

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
                ...w.map(
                    c => c.high
                )
            );

        const low =
            Math.min(
                ...w.map(
                    c => c.low
                )
            );

        k[i] =
            high === low
                ? 50
                : (
                    (
                        candles[i].close -
                        low
                    ) /
                    (
                        high -
                        low
                    )
                ) * 100;
    }

    const d =
        sma(
            k,
            signalPeriod
        );

    return {
        k,
        d
    };
}

// ============================================================
// CCI
// ============================================================

function cci(
    candles,
    period = 20
) {

    const tp =
        candles.map(
            c =>
                (
                    c.high +
                    c.low +
                    c.close
                ) / 3
        );

    const ma =
        sma(tp, period);

    const out =
        new Array(
            candles.length
        ).fill(0);

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
                    (
                        tp[i] -
                        mean
                    ) /
                    (
                        0.015 *
                        deviation
                    )
                );
    }

    return out;
}

// ============================================================
// ADX
// ============================================================

function adx(
    candles,
    period = 14
) {

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
           
