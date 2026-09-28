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

        // ONE timestamp for the complete analysis
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
    // MARKET DISPLAY
    // ========================================================

    function getMarketDisplay() {

        return MARKETS[state.market]
            ? MARKETS[state.market].display
            : state.market;

    }

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

                option.value =
                    key;

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
                    "BUY Confidence: -- | SELL Confidence: --"
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

    // ========================================================
    // GET REAL MARKET DATA
    // ========================================================

    async function getRealMarketData() {

        const url =
            `${CANDLES_ENDPOINT}` +
            `?market=${encodeURIComponent(
                state.market
            )}` +
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
    // GET CANDLE TIME
    // ========================================================

    function getLatestCandleTime(
        candles
    ) {

        if (
            !candles ||
            !candles.length
        ) {

            return null;

        }

        const newestCandle =
            candles[
                candles.length - 1
            ];

        if (!newestCandle) {
            return null;
        }

        return (
            newestCandle.time ||
            newestCandle.timestamp ||
            newestCandle.datetime ||
            null
        );

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

            // ------------------------------------------------
            // GET LIVE CANDLES
            // ------------------------------------------------

            const candles =
                await getRealMarketData();

            state.candles =
                candles;

            state.dataMode =
                "LIVE";

            state.lastUpdate =
                new Date();

            // ------------------------------------------------
            // ONE SINGLE TIME FOR THIS ANALYSIS
            // ------------------------------------------------

            const latestCandleTime =
                getLatestCandleTime(
                    candles
                );

            state.lastCandleTime =
                latestCandleTime;

            /*
             * IMPORTANT:
             *
             * BUY confidence
             * SELL confidence
             * WAIT
             * BUY confirmation
             * SELL confirmation
             *
             * ALL belong to this SAME analysis candle.
             *
             * Therefore ALL use ONE signalTime.
             */

            state.signalTime =
                latestCandleTime;

            renderDataSource();

            setStatus(
                `ANALYZING LIVE ${getMarketDisplay()} 5 MIN DATA...`
            );

            // ------------------------------------------------
            // RUN STRATEGY ENGINE
            // ------------------------------------------------

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

            // ------------------------------------------------
            // RENDER COMPLETE RESULT
            // ------------------------------------------------

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
    // UI STATUS
    // ========================================================

    function setStatus(
        text
    ) {

        const el =
            document.getElementById(
                "engineStatus"
            );

        if (el) {

            el.textContent =
                text;

        }

    }

    // ========================================================
    // BUTTON
    // ========================================================

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

    // ========================================================
    // ERROR
    // ========================================================

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

    // ========================================================
    // VALUE
    // ========================================================

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

        return date.toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit",
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

        /*
         * ALWAYS SHOW BOTH CONFIDENCES.
         *
         * Both BUY and SELL are calculated
         * from the SAME market candle.
         */

        return (
            `BUY Confidence: ${buy}% | ` +
            `SELL Confidence: ${sell}%`
        );

    }

    // ========================================================
    // FINAL SIGNAL CHECK
    // ========================================================

    function isFinalSignal(
        result
    ) {

        if (!result) {
            return false;
        }

        const buy =
            Number(
                result.scores &&
                result.scores.buy
            ) || 0;

        const sell =
            Number(
                result.scores &&
                result.scores.sell
            ) || 0;

        /*
         * Final signal means the strategy engine
         * has selected BUY/SELL and the directional
         * confidence has reached 100.
         */

        return (
            (
                result.decision === "BUY" &&
                buy >= 100
            ) ||
            (
                result.decision === "SELL" &&
                sell >= 100
            )
        );

    }

    // ========================================================
    // RENDER ANALYSIS
    // ========================================================

    function renderAnalysis(
        result
    ) {

        hideError();

        // ----------------------------------------------------
        // DECISION
        // ----------------------------------------------------

        setText(
            "decision",
            result.decision
        );

        // ----------------------------------------------------
        // BOTH CONFIDENCES
        // ----------------------------------------------------

        setText(
            "confidence",
            getDirectionalConfidence(
                result
            )
        );

        // ----------------------------------------------------
        // ONE SIGNAL TIME
        // ----------------------------------------------------

        setText(
            "signalTime",
            formatSignalTime(
                state.signalTime
            )
        );

        /*
         * signalCandle is kept for compatibility
         * with existing HTML.
         *
         * It uses EXACTLY the same timestamp.
         */

        setText(
            "signalCandle",
            formatSignalTime(
                state.signalTime
            )
        );

        // ----------------------------------------------------
        // TRADE LEVELS
        // ----------------------------------------------------

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

        // ----------------------------------------------------
        // STRATEGY SCORES
        // ----------------------------------------------------

        setText(
            "buyScore",
            result.scores &&
            result.scores.buy
        );

        setText(
            "sellScore",
            result.scores &&
            result.scores.sell
        );

        setText(
            "buyAgreement",
            result.scores &&
            result.scores.buyAgreement
        );

        setText(
            "sellAgreement",
            result.scores &&
            result.scores.sellAgreement
        );

        // ----------------------------------------------------
        // MARKET ANALYSIS
        // ----------------------------------------------------

        const marketAnalysis =
            result.marketAnalysis ||
            {};

        setText(
            "trend",
            marketAnalysis.trend
        );

        setText(
            "structure",
            marketAnalysis.structure
        );

        setText(
            "bos",
            marketAnalysis.bos
        );

        setText(
            "choch",
            marketAnalysis.choch
        );

        setText(
            "fvg",
            marketAnalysis.fvg
        );

        setText(
            "liquidity",
            marketAnalysis.liquidity
        );

        setText(
            "fibonacci",
            marketAnalysis.fibonacci
        );

        setText(
            "priceRange",
            marketAnalysis.priceRange
        );

        // ----------------------------------------------------
        // INDICATORS
        // ----------------------------------------------------

        const indicators =
            result.indicators ||
            {};

        setText(
            "ema9",
            indicators.ema9
        );

        setText(
            "ema21",
            indicators.ema21
        );

        setText(
            "rsi",
            indicators.rsi
        );

        setText(
            "vwap",
            indicators.vwap
        );

        setText(
            "volume",
            indicators.volumeSignal
        );

        // ----------------------------------------------------
        // OPTION DATA
        // ----------------------------------------------------

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

        // ----------------------------------------------------
        // FINAL SIGNAL TIME
        // ----------------------------------------------------

        /*
         * If the engine produces a final 100% signal,
         * the SAME signalTime is used.
         */

        if (
            isFinalSignal(
                result
            )
        ) {

            setText(
                "finalSignalTime",
                formatSignalTime(
                    state.signalTime
                )
            );

        } else {

            setText(
                "finalSignalTime",
                "--"
            );

        }

        // ----------------------------------------------------
        // STRATEGIES
        // ----------------------------------------------------

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
