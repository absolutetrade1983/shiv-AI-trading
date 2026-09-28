// ============================================================
// SHIV AI TRADING — MASTER APP CONTROLLER
// NIFTY | 5 MIN | LIVE ANGEL ONE DATA
// ============================================================

(function () {
    "use strict";

    const ENGINE = window.SHIV_AI_STRATEGY;

    if (!ENGINE) {
        console.error("Strategy engine not loaded.");
        return;
    }

    // ========================================================
    // BACKEND API
    // ========================================================

    const API_BASE =
        "https://shiv-ai-trading-api.onrender.com";

    const CANDLES_ENDPOINT =
        `${API_BASE}/api/candles`;

    // ========================================================
    // APP STATE
    // ========================================================

    const state = {
    candles: [],
    analysis: null,
    dataMode: "OFFLINE",
    lastUpdate: null,
    busy: false,

    autoRefreshTimer: null,
    lastCandleTime: null,
    retryTimer: null
};

    // ========================================================
    // REAL MARKET DATA
    // Backend securely talks to Angel One.
    // API credentials NEVER enter this browser code.
    // ========================================================

    async function getRealMarketData() {

        const response = await fetch(
            CANDLES_ENDPOINT,
            {
                method: "GET",
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        let data = null;

        try {
            data = await response.json();
        } catch (e) {
            throw new Error(
                "Invalid response from market server"
            );
        }

        if (!response.ok) {

            throw new Error(
                data && data.error
                    ? data.error
                    : data && data.detail
                    ? data.detail
                    : "Market data server unavailable"
            );
        }

        if (
            !data.candles ||
            !Array.isArray(data.candles)
        ) {
            throw new Error(
                "Invalid market candle data"
            );
        }

        if (data.candles.length < 50) {

            throw new Error(
                "Not enough NIFTY 5-minute candles received"
            );
        }

        return data.candles;
    }

    // ========================================================
    // LOAD LIVE MARKET DATA
    // ========================================================

    async function loadMarketData() {

        const candles =
            await getRealMarketData();

        state.candles = candles;

        state.dataMode =
            "LIVE";

        state.lastUpdate =
            new Date();

        renderDataSource();

        return true;
    }

    // ========================================================
    // RUN AI ANALYSIS
    // ========================================================

    async function runAnalysis(isAuto = false) {

    if (state.busy) return;

    state.busy = true;

    if (!isAuto) {
        hideError();
        setButtonState(true);
    }

    setStatus(
        isAuto
            ? "AUTO-UPDATING LIVE DATA..."
            : "FETCHING LIVE NIFTY DATA..."
    );

    try {

        const candles =
            await getRealMarketData();

        state.candles = candles;

        state.dataMode = "LIVE";
        state.lastUpdate = new Date();

        const newestCandle =
            candles[candles.length - 1];

        state.lastCandleTime =
            newestCandle.time ||
            newestCandle.timestamp ||
            null;

        renderDataSource();

        setStatus(
            "ANALYZING LIVE 5 MIN DATA..."
        );

        const result =
            ENGINE.analyzeMarket(
                state.candles
            );

        if (
            !result ||
            !result.success
        ) {
            throw new Error(
                result && result.error
                    ? result.error
                    : "Analysis failed"
            );
        }

        state.analysis = result;

        renderAnalysis(result);

        setStatus(
            isAuto
                ? "CONNECTED • AUTO LIVE"
                : "CONNECTED • LIVE DATA"
        );

        scheduleNextAutoRefresh();

    } catch (error) {

        console.error(
            "Analysis error:",
            error
        );

        /*
         * Keep the last successful analysis.
         * Temporary API errors will not erase it.
         */

        if (state.analysis) {

            setStatus(
                "LIVE DATA • LAST SUCCESS"
            );

            hideError();

        } else {

            state.dataMode =
                "OFFLINE";

            renderDataSource();

            setStatus(
                "WAITING FOR LIVE DATA"
            );
        }

        scheduleNextAutoRefresh();

    } finally {

        state.busy = false;

        if (!isAuto) {
            setButtonState(false);
        }
    }
}
    

    // ========================================================
    // UI HELPERS
    // ========================================================

    function setStatus(text) {

        const el =
            document.getElementById(
                "engineStatus"
            );

        if (el) {
            el.textContent =
                text;
        }
    }

    function setButtonState(busy) {

        const button =
            document.getElementById(
                "runAnalysis"
            );

        if (!button) return;

        button.disabled =
            busy;

        button.textContent =
            busy
                ? "ANALYZING..."
                : "RUN AI ANALYSIS";
    }

    function showError(message) {

        const el =
            document.getElementById(
                "errorBox"
            );

        if (el) {

            el.textContent =
                "Error: " +
                message;

            el.style.display =
                "block";
        }
    }

    function hideError() {

        const el =
            document.getElementById(
                "errorBox"
            );

        if (el) {
            el.style.display =
                "none";
        }
    }

    function valueOrDash(value) {

        return value === null ||
            value === undefined
            ? "--"
            : value;
    }

    // ========================================================
    // RENDER ANALYSIS
    // ========================================================

    function renderAnalysis(result) {

        hideError();

        setText(
            "decision",
            result.decision
        );

        setText(
            "confidence",
            result.confidence + "%"
        );

        setText(
            "entry",
            valueOrDash(
                result.entry
            )
        );

        setText(
            "stopLoss",
            valueOrDash(
                result.stopLoss
            )
        );

        setText(
            "target",
            valueOrDash(
                result.target
            )
        );

        setText(
            "atr",
            valueOrDash(
                result.atr
            )
        );

        setText(
            "buyScore",
            result.scores.buy
        );

        setText(
            "sellScore",
            result.scores.sell
        );

        setText(
            "buyAgreement",
            result.scores.buyAgreement
        );

        setText(
            "sellAgreement",
            result.scores.sellAgreement
        );

        setText(
            "trend",
            result.marketAnalysis.trend
        );

        setText(
            "structure",
            result.marketAnalysis.structure
        );

        setText(
            "bos",
            result.marketAnalysis.bos
        );

        setText(
            "choch",
            result.marketAnalysis.choch
        );

        setText(
            "fvg",
            result.marketAnalysis.fvg
        );

        setText(
            "liquidity",
            result.marketAnalysis.liquidity
        );

        setText(
            "fibonacci",
            result.marketAnalysis.fibonacci
        );

        setText(
            "priceRange",
            result.marketAnalysis.priceRange
        );

        setText(
            "ema9",
            result.indicators.ema9
        );

        setText(
            "ema21",
            result.indicators.ema21
        );

        setText(
            "rsi",
            result.indicators.rsi
        );

        setText(
            "vwap",
            result.indicators.vwap
        );

        setText(
            "volume",
            result.indicators.volumeSignal
        );

        setText(
            "optionType",
            valueOrDash(
                result.optionType
            )
        );

        setText(
            "strike",
            valueOrDash(
                result.suggestedStrike
            )
        );

        setText(
            "riskReward",
            valueOrDash(
                result.riskReward
            )
        );

        renderStrategies(
            result.strategies &&
            Array.isArray(
                result.strategies.details
            )
                ? result.strategies.details
                : []
        );

        renderDataSource();
    }

    function setText(id, value) {

        const el =
            document.getElementById(
                id
            );

        if (el) {

            el.textContent =
                valueOrDash(
                    value
                );
        }
    }

    // ========================================================
    // STRATEGY LIST
    // ========================================================

    function renderStrategies(
        strategies
    ) {

        const container =
            document.getElementById(
                "strategyList"
            );

        if (!container) return;

        container.innerHTML =
            "";

        if (!strategies.length) {

            container.innerHTML =
                "<div class='strategy-empty'>" +
                "No qualifying strategy setup" +
                "</div>";

            return;
        }

        strategies.forEach(
            strategy => {

                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "strategy-item";

                item.innerHTML = `
                    <div>
                        <strong>
                            ${escapeHTML(
                                strategy.name
                            )}
                        </strong>

                        <small>
                            ${escapeHTML(
                                strategy.reason
                            )}
                        </small>
                    </div>

                    <div class="${
                        strategy.direction === "BUY"
                            ? "buy"
                            : "sell"
                    }">
                        ${escapeHTML(
                            strategy.direction
                        )}
                        ${escapeHTML(
                            strategy.score
                        )}
                    </div>
                `;

                container.appendChild(
                    item
                );
            }
        );
    }

    // ========================================================
    // DATA SOURCE
    // ========================================================

    function renderDataSource() {

        const el =
            document.getElementById(
                "dataSource"
            );

        if (!el) return;

        if (
            state.dataMode ===
            "LIVE"
        ) {

            el.textContent =
                "LIVE MARKET DATA";

            el.className =
                "live";

        } else {

            el.textContent =
                "LIVE DATA UNAVAILABLE";

            el.className =
                "test";
        }
    }

    // ========================================================
    // HTML ESCAPE
    // ========================================================

    function escapeHTML(value) {

        return String(value)
            .replaceAll(
                "&",
                "&amp;"
            )
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            )
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );
    }

    // ========================================================
// AUTO REFRESH — EVERY 5 MINUTE CANDLE
// ========================================================

function scheduleNextAutoRefresh() {

    if (state.autoRefreshTimer) {
        clearTimeout(
            state.autoRefreshTimer
        );
    }

    const now = new Date();

    const minutes =
        now.getMinutes();

    const seconds =
        now.getSeconds();

    const milliseconds =
        now.getMilliseconds();

    // Next 5-minute candle boundary
    let minutesToNext =
        5 - (minutes % 5);

    if (minutesToNext === 0) {
        minutesToNext = 5;
    }

    let delay =
        (minutesToNext * 60 * 1000) -
        (seconds * 1000) -
        milliseconds;

    // Wait a few seconds after candle closes
    delay += 5000;

    state.autoRefreshTimer =
        setTimeout(
            () => {

                if (isMarketHours()) {

                    runAnalysis(true);

                } else {

                    scheduleNextAutoRefresh();
                }

            },
            delay
        );
}


// ========================================================
// NSE MARKET HOURS
// 09:15 AM - 03:30 PM
// Monday - Friday
// ========================================================

function isMarketHours() {

    const now = new Date();

    const day =
        now.getDay();

    // Saturday / Sunday
    if (
        day === 0 ||
        day === 6
    ) {
        return false;
    }

    const hour =
        now.getHours();

    const minute =
        now.getMinutes();

    const totalMinutes =
        (hour * 60) + minute;

    const marketOpen =
        (9 * 60) + 15;

    const marketClose =
        (15 * 60) + 30;

    return (
        totalMinutes >= marketOpen &&
        totalMinutes < marketClose
    );
}

    // ========================================================
    // PUBLIC APP OBJECT
    // ========================================================

    window.SHIV_AI_APP = {

        state,

        runAnalysis,

        loadMarketData,

        getRealMarketData
    };
function initialize() {
    const button =
        document.getElementById("runAnalysis");

    if (button) {
        button.addEventListener(
            "click",
            runAnalysis
        );
    }

    setStatus("READY");
    renderDataSource();
    scheduleNextAutoRefresh();
}
    // ========================================================
    // START
    // ========================================================

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );

    } else {

        initialize();
    }

})();
