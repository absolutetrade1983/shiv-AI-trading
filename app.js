// ============================================================
// SHIV AI TRADING — MASTER APP CONTROLLER
// NIFTY | 5 MIN
// ============================================================

(function () {
    "use strict";

    const ENGINE =
        window.SHIV_AI_STRATEGY;

    if (!ENGINE) {
        console.error("Strategy engine not loaded.");
        return;
    }

    const state = {
        candles: [],
        analysis: null,
        dataMode: "TEST",
        lastUpdate: null,
        busy: false
    };

    // ========================================================
    // TEST CANDLE GENERATOR
    // Used ONLY until real market API is connected.
    // ========================================================

    function generateTestCandles(count = 150) {
        const candles = [];

        let price = 25000;

        for (let i = 0; i < count; i++) {
            const open = price;

            const movement =
                (Math.random() - 0.48) * 90;

            const close =
                open + movement;

            const high =
                Math.max(open, close) +
                Math.random() * 35;

            const low =
                Math.min(open, close) -
                Math.random() * 35;

            const volume =
                Math.floor(
                    50000 +
                    Math.random() * 100000
                );

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

    // ========================================================
    // REAL MARKET DATA ADAPTER
    //
    // Later this endpoint will be supplied by our backend.
    // It must return:
    //
    // {
    //   candles: [
    //      {time, open, high, low, close, volume}
    //   ]
    // }
    // ========================================================

    async function getRealMarketData() {
        const response =
            await fetch("/api/nifty-candles", {
                method: "GET",
                cache: "no-store"
            });

        if (!response.ok) {
            throw new Error(
                "Market data server unavailable"
            );
        }

        const data =
            await response.json();

        if (
            !data.candles ||
            !Array.isArray(data.candles)
        ) {
            throw new Error(
                "Invalid market data"
            );
        }

        if (data.candles.length < 50) {
            throw new Error(
                "Not enough market candles"
            );
        }

        return data.candles;
    }

    // ========================================================
    // LOAD MARKET DATA
    // ========================================================

    async function loadMarketData() {
        try {
            const candles =
                await getRealMarketData();

            state.candles = candles;
            state.dataMode = "LIVE";
            state.lastUpdate = new Date();

            return true;

        } catch (error) {
            console.warn(
                "Live feed unavailable:",
                error.message
            );

            /*
             * IMPORTANT:
             * We do NOT pretend this is live data.
             * Until backend market feed exists,
             * testing uses generated candles.
             */

            state.candles =
                generateTestCandles(150);

            state.dataMode = "TEST";
            state.lastUpdate = new Date();

            return false;
        }
    }

    // ========================================================
    // RUN ENGINE
    // ========================================================

    async function runAnalysis() {
        if (state.busy) return;

        state.busy = true;

        setButtonState(true);

        setStatus(
            "ANALYZING..."
        );

        try {
            await loadMarketData();

            const result =
                ENGINE.analyzeMarket(
                    state.candles
                );

            if (!result.success) {
                throw new Error(
                    result.error ||
                    "Analysis failed"
                );
            }

            state.analysis = result;

            renderAnalysis(result);

            setStatus(
                state.dataMode === "LIVE"
                    ? "CONNECTED • LIVE DATA"
                    : "CONNECTED • TEST DATA"
            );

        } catch (error) {
            console.error(error);

            setStatus(
                "ERROR"
            );

            showError(
                error.message
            );

        } finally {
            state.busy = false;
            setButtonState(false);
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
            el.textContent = text;
        }
    }

    function setButtonState(busy) {
        const button =
            document.getElementById(
                "runAnalysis"
            );

        if (!button) return;

        button.disabled = busy;

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
                "Error: " + message;

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
            valueOrDash(result.entry)
        );

        setText(
            "stopLoss",
            valueOrDash(result.stopLoss)
        );

        setText(
            "target",
            valueOrDash(result.target)
        );

        setText(
            "atr",
            valueOrDash(result.atr)
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
            result.strategies.details
        );

        renderDataSource();
    }

    function setText(id, value) {
        const el =
            document.getElementById(id);

        if (el) {
            el.textContent =
                valueOrDash(value);
        }
    }

    // ========================================================
    // STRATEGY LIST
    // ========================================================

    function renderStrategies(strategies) {
        const container =
            document.getElementById(
                "strategyList"
            );

        if (!container) return;

        container.innerHTML = "";

        if (!strategies.length) {
            container.innerHTML =
                "<div class='strategy-empty'>" +
                "No qualifying strategy setup" +
                "</div>";

            return;
        }

        strategies.forEach(strategy => {
            const item =
                document.createElement("div");

            item.className =
                "strategy-item";

            item.innerHTML = `
                <div>
                    <strong>
                        ${escapeHTML(strategy.name)}
                    </strong>
                    <small>
                        ${escapeHTML(strategy.reason)}
                    </small>
                </div>

                <div class="${
                    strategy.direction === "BUY"
                        ? "buy"
                        : "sell"
                }">
                    ${strategy.direction}
                    ${strategy.score}
                }
            `;

            container.appendChild(item);
        });
    }

    function renderDataSource() {
        const el =
            document.getElementById(
                "dataSource"
            );

        if (!el) return;

        if (state.dataMode === "LIVE") {
            el.textContent =
                "LIVE MARKET DATA";
            el.className =
                "live";
        } else {
            el.textContent =
                "TEST DATA — NOT LIVE";
            el.className =
                "test";
        }
    }

    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    // ========================================================
    // INITIAL UI
    // ========================================================

    function initialize() {
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
    }

    // ========================================================
    // AUTO REFRESH
    // ========================================================

    /*
     * Once the real backend is connected,
     * analysis can refresh automatically.
     *
     * For now it is disabled to prevent
     * unnecessary test calculations.
     */

    window.SHIV_AI_APP = {
        state,
        runAnalysis,
        loadMarketData,
        getRealMarketData
    };

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
