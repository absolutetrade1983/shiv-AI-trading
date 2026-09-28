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
                    document.createElement(
                        "option"
                    );

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

                setSignalTime(
                    null
                );

                clearDebugPanel();

                try {

                    await runAnalysis(
                        false
                    );

                } catch (error) {

                    console.error(
                        "Market switch error:",
                        error
                    );

                }

            }
        );

        wrapper.appendChild(
            label
        );

        wrapper.appendChild(
            select
        );

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
    // GET MARKET DATA
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

        } catch (error) {

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
    // LOAD MARKET DATA
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
    // GET LATEST CANDLE TIME
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

        const candle =
            candles[
                candles.length - 1
            ];

        if (!candle) {
            return null;
        }

        return (
            candle.time ||
            candle.timestamp ||
            candle.datetime ||
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

            const candles =
                await getRealMarketData();

            state.candles =
                candles;

            state.dataMode =
                "LIVE";

            state.lastUpdate =
                new Date();

            const latestCandleTime =
                getLatestCandleTime(
                    candles
                );

            state.lastCandleTime =
                latestCandleTime;

            state.signalTime =
                latestCandleTime;

            renderDataSource();

            setStatus(
                `ANALYZING LIVE ${getMarketDisplay()} 5 MIN DATA...`
            );

            // ------------------------------------------------
            // STRATEGY ENGINE
            // ------------------------------------------------

            const result =
                ENGINE.analyzeMarket(
                    state.candles,
                    state.market
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
            // RENDER
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
    // SIGNAL TIME UI
    // ========================================================

    function ensureSignalTimeElement() {

        let timeElement =
            document.getElementById(
                "signalTime"
            );

        if (timeElement) {

            return timeElement;

        }

        const confidenceElement =
            document.getElementById(
                "confidence"
            );

        if (!confidenceElement) {

            return null;

        }

        timeElement =
            document.createElement(
                "div"
            );

        timeElement.id =
            "signalTime";

        timeElement.style.cssText = `
            margin-top: 10px;
            font-size: 13px;
            font-weight: 700;
            color: #9ca3af;
            text-align: center;
            letter-spacing: 0.2px;
        `;

        confidenceElement.parentElement.appendChild(
            timeElement
        );

        return timeElement;

    }

    // ========================================================
    // SET SIGNAL TIME
    // ========================================================

    function setSignalTime(
        value
    ) {

        const element =
            ensureSignalTimeElement();

        if (!element) {
            return;
        }

        element.textContent =
            value
                ? `Signal Time: ${formatSignalTime(value)}`
                : "Signal Time: --";

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
    // STATUS
    // ========================================================

    function setStatus(
        text
    ) {

        const element =
            document.getElementById(
                "engineStatus"
            );

        if (element) {

            element.textContent =
                text;

        }

    }

    // ========================================================
    // BUTTON STATE
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

        const element =
            document.getElementById(
                "errorBox"
            );

        if (element) {

            element.textContent =
                "Error: " +
                message;

            element.style.display =
                "block";

        }

    }

    function hideError() {

        const element =
            document.getElementById(
                "errorBox"
            );

        if (element) {

            element.style.display =
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
    // CONFIDENCE
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

        ensureSignalTimeElement();

        setText(
            "decision",
            result.decision
        );

        setText(
            "confidence",
            getDirectionalConfidence(
                result
            )
        );

        setSignalTime(
            state.signalTime
        );

        setText(
            "signalCandle",
            formatSignalTime(
                state.signalTime
            )
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

        const market =
            result.marketAnalysis ||
            {};

        setText(
            "trend",
            market.trend
        );

        setText(
            "structure",
            market.structure
        );

        setText(
            "bos",
            market.bos
        );

        setText(
            "choch",
            market.choch
        );

        setText(
            "fvg",
            market.fvg
        );

        setText(
            "liquidity",
            market.liquidity
        );

        setText(
            "fibonacci",
            market.fibonacci
        );

        setText(
            "priceRange",
            market.priceRange
        );

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

        renderStrategies(
            result.strategies &&
            Array.isArray(
                result.strategies.details
            )
                ? result.strategies.details
                : []
        );

        // NEW DEBUG PANEL
        renderStrategyDebug(
            result
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

        const element =
            document.getElementById(
                id
            );

        if (element) {

            element.textContent =
                valueOrDash(
                    value
                );

        }

    }

    // ========================================================
    // ACTIVE STRATEGY LIST
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
    // STRATEGY DEBUG PANEL
    // ========================================================

    function ensureDebugPanel() {

        let panel =
            document.getElementById(
                "strategyDebugPanel"
            );

        if (panel) {
            return panel;
        }

        panel =
            document.createElement(
                "div"
            );

        panel.id =
            "strategyDebugPanel";

        panel.style.cssText = `
            margin
