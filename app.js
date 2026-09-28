// ============================================================
// SHIV AI TRADING — MASTER APP CONTROLLER
// NIFTY | BANK NIFTY | SENSEX
// 5 MIN | LIVE ANGEL ONE DATA
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

        market: "NIFTY",

        autoRefreshTimer: null,
        lastCandleTime: null,
        retryTimer: null,

        signalTime: null
    };

    // ========================================================
    // MARKET CONFIG
    // ========================================================

    const MARKETS = {
        NIFTY: {
            name: "NIFTY",
            display: "NIFTY"
        },

        BANKNIFTY: {
            name: "BANKNIFTY",
            display: "BANK NIFTY"
        },

        SENSEX: {
            name: "SENSEX",
            display: "SENSEX"
        }
    };

    // ========================================================
    // MARKET SELECTOR
    // ========================================================

    function createMarketSelector() {

        let existing =
            document.getElementById(
                "marketSelector"
            );

        if (existing) {
            return existing;
        }

        const wrapper =
            document.createElement("div");

        wrapper.id =
            "marketSelectorWrapper";

        wrapper.style.cssText = `
            margin: 12px 0;
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        `;

        const label =
            document.createElement("label");

        label.textContent =
            "MARKET";

        label.style.cssText = `
            font-weight: 700;
            font-size: 14px;
        `;

        const select =
            document.createElement("select");

        select.id =
            "marketSelector";

        select.style.cssText = `
            padding: 10px 14px;
            border-radius: 8px;
            border: 1px solid #555;
            background: #101722;
            color: #fff;
            font-size: 14px;
            font-weight: 700;
        `;

        Object.keys(MARKETS).forEach(
            key => {

                const option =
                    document.createElement("option");

                option.value = key;

                option.textContent =
                    MARKETS[key].display;

                select.appendChild(
                    option
                );
            }
        );

        select.value =
            state.market;

        select.addEventListener(
            "change",
            async function () {

                if (state.busy) {

                    select.value =
                        state.market;

                    return;
                }

                state.market =
                    select.value;

                state.analysis =
                    null;

                state.candles =
                    [];

                state.lastCandleTime =
                    null;

                state.signalTime =
                    null;

                setStatus(
                    `SWITCHING TO ${getMarketDisplay()}...`
                );

                setText(
                    "decision",
                    "WAIT"
                );

                setText(
                    "confidence",
                    `${getMarketDisplay()} — WAITING`
                );

                setText(
                    "signalTime",
                    "--"
                );

                setText(
                    "signalCandle",
                    "--"
                );

                try {

                    await runAnalysis(false);

                } catch (error) {

                    console.error(
                        "Market switch error:",
                        error
                    );
                }
            }
        );

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        // Put selector above Run Analysis button
        const button =
            document.getElementById(
                "runAnalysis"
            );

        if (
            button &&
            button.parentElement
        ) {

            button.parentElement.insertBefore(
                wrapper,
                button
            );

        } else {

            document.body.prepend(
                wrapper
            );
        }

        return select;
    }

    function getMarketDisplay() {

        return MARKETS[state.market]
            ? MARKETS[state.market].display
            : state.market;
    }

    // ========================================================
    // REAL MARKET DATA
    // ========================================================

    async function getRealMarketData() {

        const url =
            `${CANDLES_ENDPOINT}` +
            `?market=${encodeURIComponent(state.market)}` +
            `&limit=100`;

        const response =
            await fetch(
                url,
                {
                    method: "GET",
                    cache: "no-store",
                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );

        let data = null;

        try {

            data =
                await response.json();

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
            !Array.isArray(
                data.candles
            )
        ) {

            throw new Error(
                "Invalid market candle data"
            );
        }

        if (
            data.candles.length < 50
        ) {

            throw new Error(
                `Not enough ${getMarketDisplay()} 5-minute candles received`
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

        state.candles =
            candles;

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

    async function runAnalysis(
        isAuto = false
    ) {

        if (state.busy) {
            return;
        }

        state.busy =
            true;

        if (!isAuto) {

            hideError();

            setButtonState(
                true
            );
        }

        setStatus(
            isAuto
                ? `AUTO-UPDATING ${getMarketDisplay()}...`
                : `FETCHING LIVE ${getMarketDisplay()} DATA...`
        );

        try {

            const candles =
                await getRealMarketData();

            state.candles =
                candles;

            state.dataMode =
                "LIVE";

            state.lastUpdate =
                new Date();

            const newestCandle =
                candles[
                    candles.length - 1
                ];

            state.lastCandleTime =
                newestCandle.time ||
                newestCandle.timestamp ||
                null;

            // Signal time is based on the actual
            // latest 5-minute candle timestamp.
            state.signalTime =
                state.lastCandleTime;

            renderDataSource();

            setStatus(
                `ANALYZING LIVE ${getMarketDisplay()} 5 MIN DATA...`
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
                    result &&
                    result.error
                        ? result.error
                        : "Analysis failed"
                );
            }

            state.analysis =
                result;

            renderAnalysis(
                result
            );

            setStatus(
                isAuto
                    ? `CONNECTED • ${getMarketDisplay()} • AUTO LIVE`
                    : `CONNECTED • ${getMarketDisplay()} • LIVE DATA`
            );

            scheduleNextAutoRefresh();

        } catch (error) {

            console.error(
                "Analysis error:",
                error
            );

            if (state.analysis) {

                setStatus(
                    `${getMarketDisplay()} • LIVE DATA • LAST SUCCESS`
                );

                hideError();

            } else {

                state.dataMode =
                    "OFFLINE";

                renderDataSource();

                setStatus(
                    "WAITING FOR LIVE DATA"
                );

                showError(
                    error.message
                );
            }

            scheduleNextAutoRefresh();

        } finally {

            state.busy =
                false;

            if (!isAuto) {

                setButtonState(
                    false
                );
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

    function setButtonState(
        busy
    ) {

        const button =
            document.getElementById(
                "runAnalysis"
            );

        if (!button) {
            return;
        }

        button.disabled =
            busy;

        button.textContent =
            busy
                ? "ANALYZING..."
                : "RUN AI ANALYSIS";
    }

    function showError(
        message
    ) {

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

    function valueOrDash(
        value
    ) {

        return (
            value === null ||
            value === undefined ||
            value === ""
        )
            ? "--"
            : value;
    }

    // ========================================================
    // FORMAT SIGNAL TIME
    // ========================================================

    function formatSignalTime(
        value
    ) {

        if (!value) {
            return "--";
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return String(value);
        }

        return date.toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true
            }
        );
    }

    // ========================================================
    // DIRECTIONAL CONFIDENCE
    // ========================================================

    function getDirectionalConfidence(
        result
    ) {

        const buy =
            Number(
                result &&
                result.scores &&
                result.scores.buy
            ) || 0;

        const sell =
            Number(
                result &&
                result.scores &&
                result.scores.sell
            ) || 0;

        const decision =
            result &&
            result.decision
                ? result.decision
                : "WAIT";

        if (
            decision === "BUY"
        ) {

            return `BUY Confidence: ${buy}%`;
        }

        if (
            decision === "SELL"
        ) {

            return `SELL Confidence: ${sell}%`;
        }

        if (
            buy === 0 &&
            sell === 0
        ) {

            return "Confidence: 0%";
        }

        return (
            `BUY Confidence: ${buy}% | ` +
            `SELL Confidence: ${sell}%`
        );
    }

    // ========================================================
    // RENDER ANALYSIS
    // ========================================================

    function renderAnalysis(
        result
    ) {

        hideError();

        // -----------------------------
        // Decision
        // -----------------------------

        setText(
            "decision",
            result.decision
        );

        // -----------------------------
        // Directional confidence
        // -----------------------------

        setText(
            "confidence",
            getDirectionalConfidence(
                result
            )
        );

        // -----------------------------
        // Signal time
        // -----------------------------

        setText(
            "signalTime",
            formatSignalTime(
                state.signalTime
            )
        );

        setText(
            "signalCandle",
            formatSignalTime(
                state.lastCandleTime
            )
        );

        // -----------------------------
        // Trade levels
        // -----------------------------

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

        // -----------------------------
        // Strategy scores
        // -----------------------------

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

        // -----------------------------
        // Market analysis
        // -----------------------------

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

        // -----------------------------
        // Indicators
        // -----------------------------

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

        // -----------------------------
        // Option data
        // -----------------------------

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

        // -----------------------------
        // Strategies
        // -----------------------------

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

    // ========================================================
    // SET TEXT
    // ========================================================

    function setText(
        id,
        value
    ) {

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

        if (!container) {
            return;
        }

        container.innerHTML =
            "";

        if (
            !strategies.length
        ) {

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

        if (!el) {
            return;
        }

        if (
            state.dataMode ===
            "LIVE"
        ) {

            el.textContent =
                `LIVE ${getMarketDisplay()} MARKET DATA`;

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

    function escapeHTML(
        value
    ) {

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
    // AUTO REFRESH
    // EVERY 5-MINUTE CANDLE
    // ========================================================

    function scheduleNextAutoRefresh() {

        if (
            state.autoRefreshTimer
        ) {

            clearTimeout(
                state.autoRefreshTimer
            );
        }

        const now =
            new Date();

        const minutes =
            now.getMinutes();

        const seconds =
            now.getSeconds();

        const milliseconds =
            now.getMilliseconds();

        let minutesToNext =
            5 -
            (
                minutes % 5
            );

        if (
            minutesToNext === 0
        ) {

            minutesToNext = 5;
        }

        let delay =
            (
                minutesToNext *
                60 *
                1000
            ) -
            (
                seconds *
                1000
            ) -
            milliseconds;

        // Wait 5 seconds after candle closes
        delay += 5000;

        state.autoRefreshTimer =
            setTimeout(
                () => {

                    if (
                        isMarketHours()
                    ) {

                        runAnalysis(
                            true
                        );

                    } else {

                        scheduleNextAutoRefresh();
                    }

                },
                delay
            );
    }

    // ========================================================
    // MARKET HOURS
    // NSE / BSE INDEX HOURS
    // 09:15 AM - 03:30 PM
    // Monday - Friday
    // ========================================================

    function isMarketHours() {

        const now =
            new Date();

        const day =
            now.getDay();

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
            (
                hour *
                60
            ) +
            minute;

        const marketOpen =
            (
                9 *
                60
            ) +
            15;

        const marketClose =
            (
                15 *
                60
            ) +
            30;

        return (
            totalMinutes >=
                marketOpen &&
            totalMinutes <
                marketClose
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

    // ========================================================
    // INITIALIZE
    // ========================================================

    function initialize() {

        createMarketSelector();

        const button =
            document.getElementById(
                "runAnalysis"
            );

        if (button) {

            button.addEventListener(
                "click",
                runAnalysis
            );
        }

        setStatus(
            "READY"
        );

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
