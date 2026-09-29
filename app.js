// ============================================================
// SHIV AI TRADING - PREMIUM FRONTEND
// ============================================================

(() => {
    "use strict";

    // ========================================================
    // CONFIG
    // ========================================================

    const API_BASE =
        "https://shiv-ai-trading-api.onrender.com";

    const REFRESH_MS = 30000;

    let selectedMarket = "NIFTY";
    let refreshTimer = null;
    let busy = false;


    // ========================================================
    // HELPERS
    // ========================================================

    function $(id) {
        return document.getElementById(id);
    }


    function number(value, decimals = 2) {

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "--";
        }

        return n.toFixed(decimals);
    }


    function percent(value) {

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return "--";
        }

        return `${Math.round(n)}%`;
    }


    // ========================================================
    // DECISION
    // ========================================================

    function getDecision(result) {

        const value =
            String(
                result?.decision ??
                result?.signal ??
                result?.action ??
                result?.finalDecision ??
                result?.trade?.decision ??
                "WAIT"
            )
            .trim()
            .toUpperCase();

        if (
            value.includes("BUY") ||
            value === "LONG"
        ) {
            return "BUY";
        }

        if (
            value.includes("SELL") ||
            value === "SHORT"
        ) {
            return "SELL";
        }

        return "WAIT";
    }


    // ========================================================
    // BUY SCORE
    // ========================================================

    function getBuyScore(result) {

        const candidates = [

            result?.scores?.buyConfidence,
            result?.scores?.buy,
            result?.scores?.buyScore,

            result?.buyConfidence,
            result?.buyScore,
            result?.buy,

            result?.buyPercentage,
            result?.buyPercent,

            result?.analysis?.buyConfidence,
            result?.analysis?.buyScore,

            result?.confidence?.buy

        ];

        for (const value of candidates) {

            const n = Number(value);

            if (
                Number.isFinite(n) &&
                n >= 0
            ) {
                return n;
            }
        }

        return 0;
    }


    // ========================================================
    // SELL SCORE
    // ========================================================

    function getSellScore(result) {

        const candidates = [

            result?.scores?.sellConfidence,
            result?.scores?.sell,
            result?.scores?.sellScore,

            result?.sellConfidence,
            result?.sellScore,
            result?.sell,

            result?.sellPercentage,
            result?.sellPercent,

            result?.analysis?.sellConfidence,
            result?.analysis?.sellScore,

            result?.confidence?.sell

        ];

        for (const value of candidates) {

            const n = Number(value);

            if (
                Number.isFinite(n) &&
                n >= 0
            ) {
                return n;
            }
        }

        return 0;
    }


    // ========================================================
    // CONFIDENCE
    // ========================================================

    function getConfidence(result) {

        const candidates = [

            result?.confidence,

            result?.confluence,

            result?.confidenceScore,

            result?.scores?.confidence,

            result?.scores?.confluence,

            result?.finalConfidence,

            result?.analysis?.confidence,

            result?.score

        ];

        for (const value of candidates) {

            const n = Number(value);

            if (
                Number.isFinite(n) &&
                n >= 0
            ) {
                return n;
            }
        }

        return 0;
    }


    // ========================================================
    // TIME
    // ========================================================

    function formatTime() {

        return new Date().toLocaleTimeString(
            "en-IN",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
    }


    // ========================================================
    // CREATE APP
    // ========================================================

    function createApp() {

        document.body.innerHTML = `

        <div id="shivApp">

            <!-- HEADER -->

            <header class="topbar">

                <div class="brand">

                    <div class="brand-title">
                        SHIV AI
                    </div>

                    <div class="brand-subtitle">
                        TRADING
                    </div>

                </div>


                <div class="live-status">

                    <span class="live-dot"></span>

                    LIVE

                </div>

            </header>


            <main class="container">


                <!-- MARKET SELECTOR -->

                <section class="market-selector">

                    <button
                        class="market-btn active"
                        data-market="NIFTY">

                        NIFTY

                    </button>


                    <button
                        class="market-btn"
                        data-market="BANKNIFTY">

                        BANKNIFTY

                    </button>


                    <button
                        class="market-btn"
                        data-market="SENSEX">

                        SENSEX

                    </button>

                </section>


                <!-- MARKET CARD -->

                <section class="market-card">


                    <div>

                        <div class="small-label">
                            MARKET
                        </div>

                        <div
                            id="marketName"
                            class="market-name">

                            NIFTY

                        </div>

                    </div>


                    <div>

                        <div class="small-label">
                            SPOT
                        </div>

                        <div
                            id="spotPrice"
                            class="spot-price">

                            --

                        </div>

                    </div>


                    <div>

                        <div class="small-label">
                            UPDATED
                        </div>

                        <div
                            id="updatedTime"
                            class="updated-time">

                            --

                        </div>

                    </div>


                </section>


                <!-- AI DECISION -->

                <section class="decision-card">

                    <div class="decision-label">
                        AI DECISION
                    </div>


                    <div
                        id="decision"
                        class="decision wait">

                        WAIT

                    </div>


                    <div
                        id="confidence"
                        class="confidence">

                        Confidence --

                    </div>

                </section>


                <!-- BUY / SELL -->

                <section class="percent-grid">


                    <div class="percent-card buy-card">

                        <div class="percent-title">
                            BUY
                        </div>


                        <div
                            id="buyPercent"
                            class="percent-value">

                            --

                        </div>

                    </div>


                    <div class="percent-card sell-card">

                        <div class="percent-title">
                            SELL
                        </div>


                        <div
                            id="sellPercent"
                            class="percent-value">

                            --

                        </div>

                    </div>


                </section>


                <!-- OPTION SIGNAL -->

                <section class="section-card">


                    <div class="section-title">
                        OPTION SIGNAL
                    </div>


                    <div class="option-main">


                        <div>

                            <div class="small-label">
                                TYPE
                            </div>

                            <div
                                id="optionType"
                                class="big-value">

                                --

                            </div>

                        </div>


                        <div>

                            <div class="small-label">
                                STRIKE
                            </div>

                            <div
                                id="optionStrike"
                                class="big-value">

                                --

                            </div>

                        </div>


                        <div>

                            <div class="small-label">
                                EXPIRY
                            </div>

                            <div
                                id="optionExpiry"
                                class="big-value expiry">

                                --

                            </div>

                        </div>


                    </div>


                    <div
                        id="optionSymbol"
                        class="option-symbol">

                        --

                    </div>


                </section>


                <!-- PREMIUM TRADE PLAN -->

                <section class="section-card premium-card">


                    <div class="section-title">
                        PREMIUM TRADE PLAN
                    </div>


                    <div class="price-grid">


                        <div class="price-item entry">

                            <div class="small-label">
                                ENTRY
                            </div>

                            <div
                                id="premiumEntry"
                                class="price-value">

                                --

                            </div>

                        </div>


                        <div class="price-item stop">

                            <div class="small-label">
                                STOP LOSS
                            </div>

                            <div
                                id="premiumSL"
                                class="price-value">

                                --

                            </div>

                        </div>


                    </div>


                    <div class="target-grid">


                        <div class="target-item">

                            <div class="small-label">
                                TARGET 1
                            </div>

                            <div
                                id="target1"
                                class="target-value">

                                --

                            </div>

                        </div>


                        <div class="target-item">

                            <div class="small-label">
                                TARGET 2
                            </div>

                            <div
                                id="target2"
                                class="target-value">

                                --

                            </div>

                        </div>


                        <div class="target-item">

                            <div class="small-label">
                                TARGET 3
                            </div>

                            <div
                                id="target3"
                                class="target-value">

                                --

                            </div>

                        </div>


                    </div>


                </section>


                <!-- STATUS -->

                <div
                    id="status"
                    class="status">

                    Connecting to SHIV AI...

                </div>


                <!-- FOOTER -->

                <div class="footer">

                    <span>
                        SHIV AI TRADING
                    </span>


                    <span>
                        ANGEL ONE • 5 MIN
                    </span>

                </div>


            </main>

        </div>

        `;

        injectStyles();

        setupMarketButtons();

        loadMarket();
    }


    // ========================================================
    // CSS
    // ========================================================

    function injectStyles() {

        const style =
            document.createElement("style");


        style.textContent = `

        * {
            box-sizing: border-box;
        }


        html,
        body {
            margin: 0;
            padding: 0;
            min-height: 100%;
            background: #080b12;
            color: #f5f7fb;
            font-family:
                Inter,
                system-ui,
                -apple-system,
                BlinkMacSystemFont,
                "Segoe UI",
                sans-serif;
        }


        body {
            min-height: 100vh;
        }


        #shivApp {
            min-height: 100vh;

            background:
                radial-gradient(
                    circle at top,
                    #151b2b 0%,
                    #080b12 45%,
                    #05070b 100%
                );
        }


        .topbar {

            height: 72px;

            display: flex;

            align-items: center;

            justify-content: space-between;

            padding: 0 20px;

            border-bottom:
                1px solid #202738;

            background:
                rgba(8, 11, 18, 0.92);

            position: sticky;

            top: 0;

            z-index: 20;

            backdrop-filter:
                blur(14px);
        }


        .brand {

            display: flex;

            align-items: center;

            gap: 8px;
        }


        .brand-title {

            font-size: 22px;

            font-weight: 900;

            letter-spacing: 1.5px;
        }


        .brand-subtitle {

            font-size: 10px;

            font-weight: 700;

            color: #7f8aa3;

            letter-spacing: 2px;

            margin-top: 9px;
        }


        .live-status {

            display: flex;

            align-items: center;

            gap: 7px;

            font-size: 11px;

            font-weight: 800;

            color: #63e6a5;

            letter-spacing: 1px;
        }


        .live-dot {

            width: 8px;

            height: 8px;

            border-radius: 50%;

            background: #63e6a5;

            box-shadow:
                0 0 12px
                rgba(99,230,165,.8);
        }


        .container {

            width:
                min(720px, 100%);

            margin: 0 auto;

            padding:
                18px 14px 40px;
        }


        .market-selector {

            display: grid;

            grid-template-columns:
                repeat(3, 1fr);

            gap: 8px;

            margin-bottom: 14px;
        }


        .market-btn {

            border:
                1px solid #293145;

            background: #101522;

            color: #8d98ae;

            border-radius: 12px;

            padding: 13px 8px;

            font-size: 12px;

            font-weight: 800;

            letter-spacing: .5px;

            cursor: pointer;
        }


        .market-btn.active {

            background: #20283a;

            color: #ffffff;

            border-color: #53617d;
        }


        .market-card,
        .decision-card,
        .section-card,
        .percent-card {

            border:
                1px solid #20283a;

            background:
                rgba(15, 20, 31, .88);

            border-radius: 18px;

            box-shadow:
                0 10px 35px
                rgba(0,0,0,.22);
        }


        .market-card {

            display: grid;

            grid-template-columns:
                1.2fr 1fr 1fr;

            gap: 10px;

            padding: 18px;

            margin-bottom: 12px;
        }


        .small-label {

            font-size: 9px;

            color: #737f96;

            font-weight: 800;

            letter-spacing: 1.2px;

            text-transform: uppercase;

            margin-bottom: 6px;
        }


        .market-name {

            font-size: 20px;

            font-weight: 900;
        }


        .spot-price {

            font-size: 18px;

            font-weight: 800;
        }


        .updated-time {

            font-size: 13px;

            color: #a8b2c5;

            padding-top: 4px;
        }


        .decision-card {

            text-align: center;

            padding: 22px 15px;

            margin-bottom: 12px;
        }


        .decision-label {

            font-size: 10px;

            color: #737f96;

            font-weight: 900;

            letter-spacing: 1.5px;
        }


        .decision {

            font-size: 42px;

            font-weight: 1000;

            letter-spacing: 2px;

            margin: 6px 0;
        }


        .decision.buy {

            color: #55e39b;
        }


        .decision.sell {

            color: #ff6d7d;
        }


        .decision.wait {

            color: #f3c85b;
        }


        .confidence {

            color: #8c97aa;

            font-size: 11px;
        }


        .percent-grid {

            display: grid;

            grid-template-columns:
                1fr 1fr;

            gap: 12px;

            margin-bottom: 12px;
        }


        .percent-card {

            padding: 18px;
        }


        .percent-title {

            font-size: 10px;

            font-weight: 900;

            letter-spacing: 1px;

            color: #8994aa;
        }


        .percent-value {

            font-size: 32px;

            font-weight: 900;

            margin-top: 4px;
        }


        .buy-card .percent-value {

            color: #55e39b;
        }


        .sell-card .percent-value {

            color: #ff6d7d;
        }


        .section-card {

            padding: 18px;

            margin-bottom: 12px;
        }


        .section-title {

            font-size: 10px;

            font-weight: 900;

            letter-spacing: 1.4px;

            color: #77839a;

            margin-bottom: 18px;
        }


        .option-main {

            display: grid;

            grid-template-columns:
                1fr 1fr 1fr;

            gap: 12px;
        }


        .big-value {

            font-size: 20px;

            font-weight: 900;
        }


        .expiry {

            font-size: 15px;

            padding-top: 3px;
        }


        .option-symbol {

            margin-top: 16px;

            padding-top: 13px;

            border-top:
                1px solid #20283a;

            color: #8e99ad;

            font-size: 11px;

            font-weight: 700;

            overflow-wrap: anywhere;
        }


        .premium-card {

            padding-bottom: 20px;
        }


        .price-grid {

            display: grid;

            grid-template-columns:
                1fr 1fr;

            gap: 12px;
        }


        .price-item,
        .target-item {

            background: #101522;

            border:
                1px solid #222c40;

            border-radius: 13px;

            padding: 14px;
        }


        .price-value {

            font-size: 25px;

            font-weight: 900;

            margin-top: 3px;
        }


        .entry .price-value {

            color: #ffffff;
        }


        .stop .price-value {

            color: #ff6d7d;
        }


        .target-grid {

            display: grid;

            grid-template-columns:
                repeat(3, 1fr);

            gap: 10px;

            margin-top: 10px;
        }


        .target-value {

            font-size: 19px;

            font-weight: 900;

            color: #55e39b;
        }


        .status {

            text-align: center;

            color: #707b90;

            font-size: 10px;

            font-weight: 700;

            padding: 10px 0;
        }


        .footer {

            display: flex;

            justify-content:
                space-between;

            color: #4e586c;

            font-size: 9px;

            font-weight: 800;

            letter-spacing: 1px;

            padding: 12px 3px;
        }


        @media (max-width: 450px) {

            .market-card {

                grid-template-columns:
                    1fr 1fr;
            }


            .time-box {

                grid-column:
                    1 / -1;

                border-top:
                    1px solid #20283a;

                padding-top: 10px;
            }


            .decision {

                font-size: 38px;
            }


            .big-value {

                font-size: 18px;
            }


            .target-value {

                font-size: 17px;
            }

        }

        `;


        document.head.appendChild(style);
    }


    // ========================================================
    // MARKET BUTTONS
    // ========================================================

    function setupMarketButtons() {

        document
            .querySelectorAll(".market-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        const market =
                            button.dataset.market;

                        if (!market) {
                            return;
                        }


                        selectedMarket =
                            market;


                        document
                            .querySelectorAll(
                                ".market-btn"
                            )
                            .forEach(btn => {

                                btn.classList
                                    .remove(
                                        "active"
                                    );

                            });


                        button.classList
                            .add("active");


                        loadMarket();

                    }
                );

            });
    }


    // ========================================================
    // FETCH CANDLES
    // ========================================================

    async function fetchCandles() {

        const url =
            `${API_BASE}/api/candles` +
            `?market=${encodeURIComponent(
                selectedMarket
            )}` +
            `&limit=100`;


        const response =
            await fetch(
                url,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Candle API ${response.status}`
            );
        }


        return response.json();
    }


    // ========================================================
    // FETCH SPOT
    // ========================================================

    async function fetchSpot() {

        const url =
            `${API_BASE}/api/market` +
            `?market=${encodeURIComponent(
                selectedMarket
            )}`;


        const response =
            await fetch(
                url,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `Market API ${response.status}`
            );
        }


        return response.json();
    }


    // ========================================================
    // FETCH OPTION
    // ========================================================

    async function fetchOption(
        direction
    ) {

        if (
            direction !== "BUY" &&
            direction !== "SELL"
        ) {

            return {
                success: true,
                signal: "WAIT"
            };
        }


        const url =
            `${API_BASE}/api/option-premium` +
            `?market=${encodeURIComponent(
                selectedMarket
            )}` +
            `&direction=${encodeURIComponent(
                direction
            )}`;


        const response =
            await fetch(
                url,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            let message =
                `Option API ${response.status}`;


            try {

                const error =
                    await response.json();


                if (error?.detail) {

                    message =
                        String(
                            error.detail
                        );
                }

            } catch (_) {}


            throw new Error(
                message
            );
        }


        return response.json();
    }


    // ========================================================
    // STRATEGY ENGINE
    // ========================================================

    function analyzeCandles(
        candleData
    ) {

        const engine =
            window.SHIV_AI_STRATEGY;


        if (
            !engine ||
            typeof engine.analyzeMarket !==
            "function"
        ) {

            throw new Error(
                "SHIV AI strategy engine not loaded"
            );
        }


        const candles =
            candleData?.candles ??
            candleData?.data ??
            [];


        if (
            !Array.isArray(candles) ||
            candles.length < 20
        ) {

            throw new Error(
                "Not enough candles"
            );
        }


        return engine.analyzeMarket(
            candles,
            selectedMarket
        );
    }


    // ========================================================
    // RENDER SPOT
    // ========================================================

    function renderSpot(
        spotData
    ) {

        const ltp =
            spotData?.ltp ??
            spotData?.data?.ltp;


        $("marketName")
            .textContent =
            selectedMarket;


        $("spotPrice")
            .textContent =
            number(ltp);
    }


    // ========================================================
    // RENDER DECISION
    // ========================================================

    function renderDecision(
        result
    ) {

        const decision =
            getDecision(result);


        const buy =
            getBuyScore(result);


        const sell =
            getSellScore(result);


        const confidence =
            getConfidence(result);


        $("decision")
            .textContent =
            decision;


        $("decision")
            .className =
            `decision ${decision.toLowerCase()}`;


        $("buyPercent")
            .textContent =
            percent(buy);


        $("sellPercent")
            .textContent =
            percent(sell);


        $("confidence")
            .textContent =
            `Confidence ${percent(
                confidence
            )}`;


        return decision;
    }


    // ========================================================
    // CLEAR OPTION
    // ========================================================

    function clearOption() {

        $("optionType")
            .textContent = "--";


        $("optionStrike")
            .textContent = "--";


        $("optionExpiry")
            .textContent = "--";


        $("optionSymbol")
            .textContent = "--";


        $("premiumEntry")
            .textContent = "--";


        $("premiumSL")
            .textContent = "--";


        $("target1")
            .textContent = "--";


        $("target2")
            .textContent = "--";


        $("target3")
            .textContent = "--";
    }


    // ========================================================
    // RENDER OPTION
    // ========================================================

    function renderOption(
        option
    ) {

        if (
            !option ||
            option.signal === "WAIT"
        ) {

            clearOption();

            return;
        }


        $("optionType")
            .textContent =
            option.optionType ??
            "--";


        $("optionStrike")
            .textContent =
            option.strike !== undefined
                ? number(
                    option.strike,
                    0
                )
                : "--";


        $("optionExpiry")
            .textContent =
            option.expiry ??
            "--";


        $("optionSymbol")
            .textContent =
            option.tradingsymbol ??
            "--";


        $("premiumEntry")
            .textContent =
            option.entry !== undefined
                ? `₹${number(
                    option.entry
                )}`
                : "--";


        $("premiumSL")
            .textContent =
            option.stopLoss !== undefined
                ? `₹${number(
                    option.stopLoss
                )}`
                : "--";


        $("target1")
            .textContent =
            option.target1 !== undefined
                ? `₹${number(
                    option.target1
                )}`
                : "--";


        $("target2")
            .textContent =
            option.target2 !== undefined
                ? `₹${number(
                    option.target2
                )}`
                : "--";


        $("target3")
            .textContent =
            option.target3 !== undefined
                ? `₹${number(
                    option.target3
                )}`
                : "--";
    }


    // ========================================================
    // MAIN LOAD
    // ========================================================

    async function loadMarket() {

        if (busy) {
            return;
        }


        busy = true;


        $("status")
            .textContent =
            `Updating ${selectedMarket}...`;


        try {

            // ----------------------------------------------
            // LIVE CANDLES + SPOT
            // ----------------------------------------------

            const [
                candleData,
                spotData
            ] = await Promise.all([

                fetchCandles(),

                fetchSpot()

            ]);


            renderSpot(
                spotData
            );


            // ----------------------------------------------
            // SHIV AI ENGINE
            // ----------------------------------------------

            const result =
                analyzeCandles(
                    candleData
                );


            console.log(
                "SHIV AI RESULT:",
                result
            );


            const decision =
                renderDecision(
                    result
                );


            // ----------------------------------------------
            // LIVE OPTION
            // ----------------------------------------------

            if (
                decision === "BUY" ||
                decision === "SELL"
            ) {

                $("status")
                    .textContent =
                    `Getting live ${decision} option...`;


                const option =
                    await fetchOption(
                        decision
                    );


                renderOption(
                    option
                );

            } else {

                clearOption();

            }


            $("updatedTime")
                .textContent =
                formatTime();


            $("status")
                .textContent =
                `LIVE • ${selectedMarket} • 5 MIN • ANGEL ONE`;

        } catch (error) {

            console.error(
                "SHIV AI ERROR:",
                error
            );


            $("status")
                .textContent =
                `Connection error: ${
                    error?.message ||
                    "Unknown error"
                }`;

        } finally {

            busy = false;
        }
    }


    // ========================================================
    // AUTO REFRESH
    // ========================================================

    function startAutoRefresh() {

        if (refreshTimer) {

            clearInterval(
                refreshTimer
            );
        }


        refreshTimer =
            setInterval(
                loadMarket,
                REFRESH_MS
            );
    }


    // ========================================================
    // START
    // ========================================================

    createApp();

    startAutoRefresh();

})();
