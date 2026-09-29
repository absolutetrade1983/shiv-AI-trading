// ========================================================
// SHIV AI TRADING — FRONTEND APP
// NIFTY / BANKNIFTY / SENSEX
// Live candles + Strategy Engine
// ========================================================

(() => {
    "use strict";

    // ====================================================
    // CONFIG
    // ====================================================

    const API_BASE =
        "https://shiv-ai-trading-api.onrender.com";

    const CANDLE_LIMIT = 100;
    const REFRESH_MS = 30000;

    const MARKETS = [
        "NIFTY",
        "BANKNIFTY",
        "SENSEX"
    ];

    const state = {
        market: "NIFTY",
        candles: [],
        analysis: null,
        busy: false,
        timer: null,
        firstRun: false
    };


    // ====================================================
    // DOM HELPERS
    // ====================================================

    function $(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const el = $(id);

        if (!el) return;

        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            el.textContent = "--";
        } else {
            el.textContent = String(value);
        }
    }

    function showError(message) {
        const box = $("errorBox");

        if (!box) return;

        box.textContent = message;
        box.style.display = "block";
    }

    function hideError() {
        const box = $("errorBox");

        if (!box) return;

        box.textContent = "";
        box.style.display = "none";
    }

    function setStatus(text, type = "normal") {
        const el = $("engineStatus");

        if (!el) return;

        el.textContent = text;

        if (type === "error") {
            el.style.color = "#ff5252";
        } else if (type === "success") {
            el.style.color = "#00e676";
        } else if (type === "warning") {
            el.style.color = "#ffca28";
        } else {
            el.style.color = "";
        }
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    // ====================================================
    // ENGINE CHECK
    // ====================================================

    function getEngine() {

        const engine =
            window.SHIV_AI_STRATEGY;

        if (!engine) {
            throw new Error(
                "Strategy engine load nahi hua. strategy.js check karo."
            );
        }

        if (
            typeof engine.analyzeMarket !==
            "function"
        ) {
            throw new Error(
                "Strategy engine mila, lekin analyzeMarket() missing hai."
            );
        }

        return engine;
    }


    // ====================================================
    // MARKET SELECTOR
    // ====================================================

    function createMarketSelector() {

        const area = $("marketArea");

        if (!area) return;

        area.innerHTML = "";

        const wrapper =
            document.createElement("div");

        wrapper.style.cssText = `
            display:flex;
            align-items:center;
            gap:10px;
            margin-bottom:12px;
            flex-wrap:wrap;
        `;

        const label =
            document.createElement("span");

        label.textContent = "MARKET";

        label.style.cssText = `
            font-weight:700;
            font-size:13px;
            opacity:.8;
        `;

        const select =
            document.createElement("select");

        select.id = "marketSelector";

        select.style.cssText = `
            background:#111827;
            color:#fff;
            border:1px solid #374151;
            border-radius:8px;
            padding:8px 12px;
            font-weight:700;
            outline:none;
        `;

        MARKETS.forEach(market => {

            const option =
                document.createElement("option");

            option.value = market;
            option.textContent = market;

            if (market === state.market) {
                option.selected = true;
            }

            select.appendChild(option);
        });

        select.addEventListener(
            "change",
            () => {

                state.market =
                    select.value;

                clearRefreshTimer();

                runAnalysis(true);
            }
        );

        wrapper.appendChild(label);
        wrapper.appendChild(select);

        area.appendChild(wrapper);
    }


    // ====================================================
    // API
    // ====================================================

    async function fetchCandles() {

        const url =
            `${API_BASE}/api/candles?market=${encodeURIComponent(
                state.market
            )}&limit=${CANDLE_LIMIT}`;

        const response =
            await fetch(url, {
                method: "GET",
                cache: "no-store"
            });

        if (!response.ok) {

            throw new Error(
                `API Error ${response.status}: ${response.statusText}`
            );
        }

        const data =
            await response.json();

        let candles = null;

        // -----------------------------------------------
        // Different possible backend response formats
        // -----------------------------------------------

        if (Array.isArray(data)) {
            candles = data;
        } else if (
            data &&
            Array.isArray(data.candles)
        ) {
            candles = data.candles;
        } else if (
            data &&
            Array.isArray(data.data)
        ) {
            candles = data.data;
        } else if (
            data &&
            data.data &&
            Array.isArray(data.data.candles)
        ) {
            candles = data.data.candles;
        }

        if (!candles) {

            throw new Error(
                "API response me candles nahi mile."
            );
        }

        if (candles.length < 50) {

            throw new Error(
                `Sirf ${candles.length} candles mile. Engine ko minimum 50 candles chahiye.`
            );
        }

        return candles;
    }


    // ====================================================
    // FORMATTERS
    // ====================================================

    function number(value, decimals = 2) {

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "--";
        }

        return n.toFixed(decimals);
    }


    function percentage(value) {

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "--";
        }

        return `${n.toFixed(1)}%`;
    }


    function formatTime(value) {

        if (!value) return "--";

        const date =
            new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
    }


    // ====================================================
    // MAIN ANALYSIS
    // ====================================================

    async function runAnalysis(isAuto = false) {

        if (state.busy) return;

        state.busy = true;

        hideError();

        setStatus(
            "ENGINE RUNNING...",
            "warning"
        );

        try {

            // --------------------------------------------
            // STEP 1 — Engine
            // --------------------------------------------

            const engine =
                getEngine();

            // --------------------------------------------
            // STEP 2 — Candles
            // --------------------------------------------

            setText(
                "dataSource",
                "Loading live Angel One data..."
            );

            const candles =
                await fetchCandles();

            state.candles =
                candles;

            // --------------------------------------------
            // STEP 3 — Strategy Engine
            // --------------------------------------------

            const result =
                engine.analyzeMarket(
                    candles,
                    state.market
                );

            if (!result) {

                throw new Error(
                    "Strategy engine ne koi result return nahi kiya."
                );
            }

            if (result.success === false) {

                throw new Error(
                    result.error ||
                    "Strategy analysis failed."
                );
            }

            state.analysis =
                result;

            state.firstRun = true;

            // --------------------------------------------
            // STEP 4 — Render
            // --------------------------------------------

            renderAnalysis(result);

            setStatus(
                "ENGINE ACTIVE",
                "success"
            );

            setText(
                "dataSource",
                `LIVE ANGEL ONE • ${state.market} • ${candles.length} candles`
            );

        } catch (error) {

            console.error(
                "SHIV AI ERROR:",
                error
            );

            setStatus(
                "ENGINE ERROR",
                "error"
            );

            showError(
                error?.message ||
                "Unknown frontend error."
            );

        } finally {

            state.busy = false;

            scheduleRefresh();
        }
    }


    // ====================================================
    // RENDER COMPLETE ANALYSIS
    // ====================================================

    function renderAnalysis(result) {

        renderDecision(result);

        renderTradePlan(result);

        renderScores(result);

        renderMarketAnalysis(result);

        renderIndicators(result);

        renderStrategies(result);

        renderDebugPanel(result);
    }


    // ====================================================
    // DECISION
    // ====================================================

    function renderDecision(result) {

        const decision =
            String(
                result.decision ||
                "WAIT"
            ).toUpperCase();

        setText(
            "decision",
            decision
        );

        const decisionEl =
            $("decision");

        if (decisionEl) {

            if (decision === "BUY") {

                decisionEl.style.color =
                    "#00e676";

            } else if (
                decision === "SELL"
            ) {

                decisionEl.style.color =
                    "#ff5252";

            } else {

                decisionEl.style.color =
                    "#ffca28";
            }
        }

        setText(
            "confidence",
            percentage(
                result.confidence
            )
        );

        setText(
            "signalTime",
            formatTime(
                result.signalTime ||
                result.timestamp
            )
        );
    }


    // ====================================================
    // TRADE PLAN
    // ====================================================

    function renderTradePlan(result) {

        setText(
            "entry",
            number(result.entry)
        );

        setText(
            "stopLoss",
            number(result.stopLoss)
        );

        setText(
            "target",
            number(result.target)
        );

        setText(
            "atr",
            number(result.atr)
        );

        setText(
            "riskReward",
            result.riskReward !== undefined
                ? `1:${number(result.riskReward)}`
                : "--"
        );

        setText(
            "optionType",
            result.optionType || "--"
        );

        setText(
            "strike",
            result.suggestedStrike || "--"
        );
    }


    // ====================================================
    // SCORES
    // ====================================================

    function renderScores(result) {

        const scores =
            result.scores || {};

        setText(
            "buyScore",
            percentage(
                scores.buy ??
                result.buyConfidence
            )
        );

        setText(
            "sellScore",
            percentage(
                scores.sell ??
                result.sellConfidence
            )
        );

        setText(
            "buyAgreement",
            scores.buyAgreement ?? "--"
        );

        setText(
            "sellAgreement",
            scores.sellAgreement ?? "--"
        );
    }


    // ====================================================
    // MARKET ANALYSIS
    // ====================================================

    function renderMarketAnalysis(result) {

        const m =
            result.marketAnalysis ||
            {};

        setText(
            "trend",
            m.trend
        );

        setText(
            "structure",
            m.structure
        );

        setText(
            "bos",
            m.bos
        );

        setText(
            "choch",
            m.choch
        );

        setText(
            "fvg",
            m.fvg
        );

        setText(
            "liquidity",
            m.liquidity
        );

        setText(
            "fibonacci",
            m.fibonacci
        );

        setText(
            "priceRange",
            m.priceRange
        );
    }


    // ====================================================
    // INDICATORS
    // ====================================================

    function renderIndicators(result) {

        const i =
            result.indicators ||
            {};

        setText(
            "ema9",
            number(i.ema9)
        );

        setText(
            "ema21",
            number(i.ema21)
        );

        setText(
            "rsi",
            number(i.rsi)
        );

        setText(
            "vwap",
            number(i.vwap)
        );

        setText(
            "volume",
            number(i.volume)
        );
    }


    // ====================================================
    // STRATEGY SIGNALS
    // ====================================================

    function renderStrategies(result) {

        const container =
            $("strategyList");

        if (!container) return;

        const strategies =
            result.strategies || {};

        const details =
            Array.isArray(
                strategies.details
            )
                ? strategies.details
                : [];

        if (!details.length) {

            container.innerHTML = `
                <div style="
                    padding:12px;
                    opacity:.7;
                ">
                    No active strategy signal on current candle.
                    <br>
                    Background filters are still being calculated.
                </div>
            `;

            return;
        }

        container.innerHTML =
            details.map((s, index) => {

                const direction =
                    String(
                        s.direction ||
                        "NEUTRAL"
                    ).toUpperCase();

                let color =
                    "#9ca3af";

                if (direction === "BUY") {
                    color = "#00e676";
                }

                if (direction === "SELL") {
                    color = "#ff5252";
                }

                return `
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:10px;
                        padding:10px 0;
                        border-bottom:1px solid rgba(255,255,255,.08);
                    ">

                        <div>
                            <strong>
                                ${index + 1}. 
                                ${escapeHTML(s.name || "Strategy")}
                            </strong>

                            <div style="
                                font-size:12px;
                                opacity:.7;
                                margin-top:3px;
                            ">
                                ${escapeHTML(s.reason || "")}
                            </div>
                        </div>

                        <div style="
                            color:${color};
                            font-weight:800;
                            white-space:nowrap;
                        ">
                            ${escapeHTML(direction)}
                            ${s.score !== undefined
                                ? ` • ${number(s.score, 0)}`
                                : ""}
                        </div>

                    </div>
                `;
            }).join("");
    }


    // ====================================================
    // DEBUG PANEL
    // Shows ALL strategy groups considered by engine
    // ====================================================

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
            margin-top:20px;
            padding:16px;
            border:1px solid rgba(255,255,255,.12);
            border-radius:12px;
            background:rgba(255,255,255,.03);
        `;

        const anchor =
            $("strategyList");

        if (
            anchor &&
            anchor.parentElement
        ) {

            anchor.parentElement.appendChild(
                panel
            );

        } else {

            document.body.appendChild(
                panel
            );
        }

        return panel;
    }


    function renderDebugPanel(result) {

        const panel =
            ensureDebugPanel();

        const scores =
            result.scores || {};

        const market =
            result.marketAnalysis || {};

        const strategies =
            result.strategies || {};

        const buyGroups =
            Array.isArray(
                scores.buyGroups
            )
                ? scores.buyGroups
                : [];

        const sellGroups =
            Array.isArray(
                scores.sellGroups
            )
                ? scores.sellGroups
                : [];

        const buy =
            Array.isArray(
                strategies.buy
            )
                ? strategies.buy
                : [];

        const sell =
            Array.isArray(
                strategies.sell
            )
                ? strategies.sell
                : [];

        const groupNames = [
            "STRUCTURE",
            "SMC",
            "TREND",
            "MOMENTUM",
            "BREAKOUT"
        ];

        function groupHTML(
            title,
            items,
            color
        ) {

            return `
                <div style="
                    flex:1;
                    min-width:250px;
                ">

                    <div style="
                        font-weight:800;
                        color:${color};
                        margin-bottom:8px;
                    ">
                        ${title}
                    </div>

                    ${
                        items.length
                            ? items.map(
                                item => `
                                    <div style="
                                        padding:5px 0;
                                        font-size:12px;
                                    ">
                                        ✓ ${escapeHTML(item)}
                                    </div>
                                `
                            ).join("")
                            : `
                                <div style="
                                    opacity:.45;
                                    font-size:12px;
                                ">
                                    No active signal
                                </div>
                            `
                    }

                </div>
            `;
        }


        panel.innerHTML = `

            <div style="
                font-size:16px;
                font-weight:900;
                margin-bottom:14px;
            ">
                STRATEGY ENGINE DEBUG
            </div>

            <div style="
                font-size:12px;
                opacity:.65;
                margin-bottom:15px;
            ">
                All strategy modules are evaluated by
                strategy.js. Only strategies producing a
                current signal appear as active.
            </div>

            <div style="
                display:flex;
                flex-wrap:wrap;
                gap:20px;
                margin-bottom:18px;
            ">

                ${groupHTML(
                    "BUY GROUPS",
                    buyGroups,
                    "#00e676"
                )}

                ${groupHTML(
                    "SELL GROUPS",
                    sellGroups,
                    "#ff5252"
                )}

            </div>

            <div style="
                display:flex;
                flex-wrap:wrap;
                gap:20px;
                margin-bottom:18px;
            ">

                ${groupHTML(
                    "BUY STRATEGIES",
                    buy,
                    "#00e676"
                )}

                ${groupHTML(
                    "SELL STRATEGIES",
                    sell,
                    "#ff5252"
                )}

            </div>

            <div style="
                border-top:1px solid rgba(255,255,255,.08);
                padding-top:14px;
                font-size:12px;
                line-height:1.8;
            ">

                <strong>ENGINE MODULES</strong>

                <div style="
                    display:flex;
                    flex-wrap:wrap;
                    gap:7px;
                    margin-top:8px;
                ">

                    ${groupNames.map(
                        name => `
                            <span style="
                                padding:4px 8px;
                                border-radius:6px;
                                background:rgba(255,255,255,.06);
                            ">
                                ${name}
                            </span>
                        `
                    ).join("")}

                </div>

            </div>

            <div style="
                border-top:1px solid rgba(255,255,255,.08);
                margin-top:14px;
                padding-top:14px;
                font-size:12px;
                line-height:1.8;
            ">

                <div>
                    <strong>Order Block:</strong>
                    ${escapeHTML(market.orderBlock || "--")}
                </div>

                <div>
                    <strong>Breaker Block:</strong>
                    ${escapeHTML(market.breakerBlock || "--")}
                </div>

                <div>
                    <strong>Equal High/Low:</strong>
                    ${escapeHTML(market.equalHighLow || "--")}
                </div>

                <div>
                    <strong>Premium/Discount:</strong>
                    ${escapeHTML(market.premiumDiscount || "--")}
                </div>

                <div>
                    <strong>Breakout Retest:</strong>
                    ${escapeHTML(market.breakoutRetest || "--")}
                </div>

                <div>
                    <strong>ORB:</strong>
                    ${escapeHTML(market.orb || "--")}
                </div>

                <div>
                    <strong>Support:</strong>
                    ${escapeHTML(market.support || "--")}
                </div>

                <div>
                    <strong>Resistance:</strong>
                    ${escapeHTML(market.resistance || "--")}
                </div>

                <div>
                    <strong>Pivot:</strong>
                    ${escapeHTML(market.pivot || "--")}
                </div>

                <div>
                    <strong>Price Action:</strong>
                    ${escapeHTML(market.priceAction || "--")}
                </div>

            </div>
        `;
    }


    // ====================================================
    // REFRESH TIMER
    // ====================================================

    function clearRefreshTimer() {

        if (state.timer) {

            clearTimeout(
                state.timer
            );

            state.timer = null;
        }
    }


    function scheduleRefresh() {

        clearRefreshTimer();

        if (!state.firstRun) {
            return;
        }

        state.timer =
            setTimeout(
                () => {

                    runAnalysis(true);

                },
                REFRESH_MS
            );
    }


    // ====================================================
    // BUTTON
    // ====================================================

    function setupButton() {

        const button =
            $("runAnalysis");

        if (!button) return;

        button.addEventListener(
            "click",
            () => {

                clearRefreshTimer();

                runAnalysis(false);
            }
        );
    }


    // ====================================================
    // INITIAL ENGINE CHECK
    // ====================================================

    function initialEngineCheck() {

        try {

            getEngine();

            setStatus(
                "ENGINE READY",
                "success"
            );

            setText(
                "dataSource",
                "Angel One Live Data"
            );

        } catch (error) {

            console.error(
                error
            );

            setStatus(
                "ENGINE NOT LOADED",
                "error"
            );

            showError(
                error.message
            );
        }
    }


    // ====================================================
    // GLOBAL ERROR HANDLING
    // ====================================================

    window.addEventListener(
        "error",
        event => {

            console.error(
                "SHIV AI GLOBAL ERROR:",
                event.error ||
                event.message
            );

            const message =
                event?.message ||
                "Frontend JavaScript error.";

            showError(
                "Frontend Error: " +
                message
            );
        }
    );


    window.addEventListener(
        "unhandledrejection",
        event => {

            console.error(
                "SHIV AI PROMISE ERROR:",
                event.reason
            );

            showError(
                "Async Error: " +
                (
                    event.reason?.message ||
                    String(event.reason)
                )
            );
        }
    );


    // ====================================================
    // INIT
    // ====================================================

    function init() {

        console.log(
            "===================================="
        );

        console.log(
            "SHIV AI TRADING FRONTEND STARTING"
        );

        console.log(
            "===================================="
        );

        createMarketSelector();

        setupButton();

        initialEngineCheck();

        // Auto-start analysis
        setTimeout(
            () => {
                runAnalysis(false);
            },
            500
        );
    }


    // ====================================================
    // START
    // ====================================================

    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init
        );

    } else {

        init();
    }

})();
