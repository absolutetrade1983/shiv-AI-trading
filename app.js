/* =========================================================
   SHIV AI TRADING — FRONTEND CONTROLLER
   LIVE CANDLES -> EXISTING strategy.js -> RESULT
   Strategy logic is NOT modified here
========================================================= */

const API_BASE =
    "https://shiv-ai-trading-api.onrender.com";

const REFRESH_MS = 30000;

let selectedMarket = "NIFTY";
let refreshTimer = null;
let isLoading = false;


/* =========================================================
   DOM HELPER
========================================================= */

function $(id) {
    return document.getElementById(id);
}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function safeNumber(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}


function clamp(value, min = 0, max = 100) {

    return Math.max(
        min,
        Math.min(
            max,
            safeNumber(value)
        )
    );
}


function formatNumber(value, decimals = 2) {

    const n = Number(value);

    if (!Number.isFinite(n)) {
        return "--";
    }

    return n.toFixed(decimals);
}


function formatTime(value) {

    if (!value) {
        return "--";
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
        return String(value);
    }

    return d.toLocaleTimeString(
        "en-IN",
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );
}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   API FETCH
========================================================= */

async function apiFetch(url) {

    const response =
        await fetch(
            url,
            {
                method: "GET",
                cache: "no-store"
            }
        );

    if (!response.ok) {

        let message =
            `API Error ${response.status}`;

        try {

            const data =
                await response.json();

            if (data?.detail) {
                message =
                    String(data.detail);
            }

            if (data?.error) {
                message =
                    String(data.error);
            }

        } catch (_) {
            // Ignore JSON parsing failure
        }

        throw new Error(message);
    }

    return response.json();
}


/* =========================================================
   ERROR UI
========================================================= */

function showError(message) {

    const box =
        $("errorBox");

    if (!box) {
        return;
    }

    box.textContent =
        String(message);

    box.style.display =
        "block";
}


function hideError() {

    const box =
        $("errorBox");

    if (!box) {
        return;
    }

    box.textContent =
        "";

    box.style.display =
        "none";
}


/* =========================================================
   ENGINE STATUS
========================================================= */

function setStatus(
    text,
    color = "#36d399"
) {

    const status =
        $("engineStatus");

    if (!status) {
        return;
    }

    status.textContent =
        text;

    status.style.color =
        color;
}


/* =========================================================
   MARKET SELECTOR
========================================================= */

function buildMarketSelector() {

    const area =
        $("marketArea");

    if (!area) {
        return;
    }

    area.innerHTML =
        "";

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.id =
        "marketSelectorWrapper";

    wrapper.style.display =
        "grid";

    wrapper.style.gridTemplateColumns =
        "repeat(3, 1fr)";

    wrapper.style.gap =
        "8px";

    const markets = [
        "NIFTY",
        "BANKNIFTY",
        "SENSEX"
    ];

    markets.forEach(
        (market) => {

            const button =
                document.createElement(
                    "button"
                );

            button.type =
                "button";

            button.textContent =
                market;

            button.dataset.market =
                market;

            button.style.minHeight =
                "42px";

            button.style.borderRadius =
                "9px";

            button.style.border =
                "1px solid #1e2a3d";

            button.style.background =
                market === selectedMarket
                    ? "#202c42"
                    : "#0b111d";

            button.style.color =
                "#ffffff";

            button.style.fontWeight =
                "800";

            button.style.fontSize =
                "12px";

            button.style.cursor =
                "pointer";

            button.addEventListener(
                "click",
                async () => {

                    if (isLoading) {
                        return;
                    }

                    selectedMarket =
                        market;

                    updateMarketButtons();

                    await loadMarket(
                        true
                    );
                }
            );

            wrapper.appendChild(
                button
            );
        }
    );

    area.appendChild(
        wrapper
    );
}


function updateMarketButtons() {

    const buttons =
        document.querySelectorAll(
            "#marketSelectorWrapper button"
        );

    buttons.forEach(
        (button) => {

            const active =
                button.dataset.market ===
                selectedMarket;

            button.style.background =
                active
                    ? "#202c42"
                    : "#0b111d";

            button.style.borderColor =
                active
                    ? "#42577d"
                    : "#1e2a3d";
        }
    );
}


/* =========================================================
   LIVE DATA SOURCE LABEL
========================================================= */

function setDataSource(
    live = true
) {

    const source =
        $("dataSource");

    if (!source) {
        return;
    }

    if (live) {

        source.textContent =
            `LIVE • ${selectedMarket} • 5 MIN`;

        source.className =
            "data-source live";

    } else {

        source.textContent =
            "LIVE DATA UNAVAILABLE";

        source.className =
            "data-source test";
    }
}


/* =========================================================
   SPOT DISPLAY
========================================================= */

function extractSpot(data) {

    if (!data) {
        return null;
    }

    const candidates = [

        data.spot,
        data.ltp,
        data.price,
        data.last_price,
        data.lastPrice,
        data.close,

        data.data?.spot,
        data.data?.ltp,
        data.data?.price,
        data.data?.last_price,
        data.data?.lastPrice,
        data.data?.close
    ];

    for (
        const value of candidates
    ) {

        const n =
            Number(value);

        if (Number.isFinite(n)) {
            return n;
        }
    }

    return null;
}


function renderSpot(
    spot
) {

    const area =
        $("marketArea");

    if (!area) {
        return;
    }

    let box =
        $("liveSpotBox");

    if (!box) {

        box =
            document.createElement(
                "div"
            );

        box.id =
            "liveSpotBox";

        box.style.background =
            "#101827";

        box.style.border =
            "1px solid #1d293b";

        box.style.borderRadius =
            "10px";

        box.style.padding =
            "11px 14px";

        box.style.marginBottom =
            "12px";

        box.style.textAlign =
            "center";

        box.style.color =
            "#ffffff";

        box.style.fontWeight =
            "800";

        area.appendChild(
            box
        );
    }

    box.innerHTML =
        `
        ${selectedMarket} SPOT
        <span
            style="
                color:#36d399;
                margin-left:8px;
            "
        >
            ${formatNumber(spot)}
        </span>
        `;
}


async function loadSpot() {

    const data =
        await apiFetch(
            `${API_BASE}/api/market?market=${encodeURIComponent(selectedMarket)}`
        );

    const spot =
        extractSpot(data);

    if (spot !== null) {

        renderSpot(
            spot
        );
    }

    setDataSource(
        true
    );

    return data;
}


/* =========================================================
   CANDLE EXTRACTION
========================================================= */

function extractCandles(data) {

    if (!data) {
        return [];
    }

    if (Array.isArray(data)) {
        return data;
    }

    if (
        Array.isArray(
            data.candles
        )
    ) {
        return data.candles;
    }

    if (
        Array.isArray(
            data.data
        )
    ) {
        return data.data;
    }

    if (
        Array.isArray(
            data.data?.candles
        )
    ) {
        return data.data.candles;
    }

    return [];
}


/* =========================================================
   GET LIVE CANDLES
========================================================= */

async function loadCandles() {

    const data =
        await apiFetch(
            `${API_BASE}/api/candles?market=${encodeURIComponent(selectedMarket)}`
        );

    const candles =
        extractCandles(
            data
        );

    if (!Array.isArray(candles)) {

        throw new Error(
            "Candle data is invalid."
        );
    }

    if (candles.length < 50) {

        throw new Error(
            `Not enough candles. Received ${candles.length}, minimum 50 required.`
        );
    }

    return candles;
}


/* =========================================================
   EXACT STRATEGY ENGINE CONNECTION
========================================================= */

function runStrategyEngine(candles) {

    /*
     * strategy.js exports the engine as:
     * window.SHIV_AI_STRATEGY.analyzeMarket
     */

    if (
        !window.SHIV_AI_STRATEGY ||
        typeof window.SHIV_AI_STRATEGY.analyzeMarket !==
            "function"
    ) {

        throw new Error(
            "SHIV AI strategy engine not loaded correctly."
        );
    }

    const result =
        window.SHIV_AI_STRATEGY.analyzeMarket(
            candles,
            selectedMarket
        );

    if (!result) {

        throw new Error(
            "Strategy engine returned no result."
        );
    }

    if (result.success === false) {

        throw new Error(
            result.error ||
            "Strategy analysis failed."
        );
    }

    return result;
}

    


/* =========================================================
   CONFIDENCE
   EXACT FIELDS FROM strategy.js
========================================================= */

function getBuyConfidence(
    result
) {

    const direct =
        Number(
            result?.buyConfidence
        );

    if (Number.isFinite(direct)) {

        return clamp(
            direct
        );
    }

    const nested =
        Number(
            result?.scores?.buyConfidence
        );

    if (Number.isFinite(nested)) {

        return clamp(
            nested
        );
    }

    const score =
        Number(
            result?.scores?.buy
        );

    if (Number.isFinite(score)) {

        return clamp(
            score
        );
    }

    return 0;
}


function getSellConfidence(
    result
) {

    const direct =
        Number(
            result?.sellConfidence
        );

    if (Number.isFinite(direct)) {

        return clamp(
            direct
        );
    }

    const nested =
        Number(
            result?.scores?.sellConfidence
        );

    if (Number.isFinite(nested)) {

        return clamp(
            nested
        );
    }

    const score =
        Number(
            result?.scores?.sell
        );

    if (Number.isFinite(score)) {

        return clamp(
            score
        );
    }

    return 0;
}


function getOverallConfidence(
    result
) {

    const direct =
        Number(
            result?.confidence
        );

    if (Number.isFinite(direct)) {

        return clamp(
            direct
        );
    }

    const nested =
        Number(
            result?.scores?.confidence
        );

    if (Number.isFinite(nested)) {

        return clamp(
            nested
        );
    }

    return Math.max(
        getBuyConfidence(result),
        getSellConfidence(result)
    );
}


/* =========================================================
   DECISION
========================================================= */

function getDecision(
    result
) {

    const decision =
        String(
            result?.decision ||
            "WAIT"
        ).toUpperCase();

    if (
        decision === "BUY" ||
        decision === "SELL" ||
        decision === "WAIT"
    ) {

        return decision;
    }

    return "WAIT";
}


/* =========================================================
   RESET UI
========================================================= */

function resetTradeUI() {

    const ids = [

        "entry",
        "stopLoss",
        "target",
        "atr",
        "riskReward",
        "optionType",
        "strike"
    ];

    ids.forEach(
        (id) => {

            const element =
                $(id);

            if (element) {

                element.textContent =
                    "--";
            }
        }
    );

    if ($("buyScore")) {

        $("buyScore").textContent =
            "0%";
    }

    if ($("sellScore")) {

        $("sellScore").textContent =
            "0%";
    }

    if ($("buyAgreement")) {

        $("buyAgreement").textContent =
            "0";
    }

    if ($("sellAgreement")) {

        $("sellAgreement").textContent =
            "0";
    }

    if ($("trend")) {
        $("trend").textContent =
            "--";
    }

    if ($("structure")) {
        $("structure").textContent =
            "--";
    }

    if ($("bos")) {
        $("bos").textContent =
            "--";
    }

    if ($("choch")) {
        $("choch").textContent =
            "--";
    }

    if ($("fvg")) {
        $("fvg").textContent =
            "--";
    }

    if ($("liquidity")) {
        $("liquidity").textContent =
            "--";
    }

    if ($("fibonacci")) {
        $("fibonacci").textContent =
            "--";
    }

    if ($("priceRange")) {
        $("priceRange").textContent =
            "--";
    }

    if ($("ema9")) {
        $("ema9").textContent =
            "--";
    }

    if ($("ema21")) {
        $("ema21").textContent =
            "--";
    }

    if ($("rsi")) {
        $("rsi").textContent =
            "--";
    }

    if ($("vwap")) {
        $("vwap").textContent =
            "--";
    }

    if ($("volume")) {
        $("volume").textContent =
            "--";
    }

    if ($("strategyList")) {

        $("strategyList").innerHTML =
            `
            <div class="strategy-empty">
                No qualifying strategy setup
            </div>
            `;
    }
}


/* =========================================================
   RENDER RESULT
========================================================= */

function renderResult(
    result
) {

    const decision =
        getDecision(
            result
        );

    const buyConfidence =
        getBuyConfidence(
            result
        );

    const sellConfidence =
        getSellConfidence(
            result
        );

    const confidence =
        getOverallConfidence(
            result
        );


    /* -----------------------------------------
       DECISION
    ----------------------------------------- */

    if ($("decision")) {

        $("decision").textContent =
            decision;

        if (
            decision === "BUY"
        ) {

            $("decision").style.color =
                "#22c55e";

        } else if (
            decision === "SELL"
        ) {

            $("decision").style.color =
                "#ef476f";

        } else {

            $("decision").style.color =
                "#facc15";
        }
    }


    /* -----------------------------------------
       CONFIDENCE
    ----------------------------------------- */

    if ($("confidence")) {

        $("confidence").innerHTML =
            `
            CONFIDENCE:
            <strong>
                ${confidence}%
            </strong>

            &nbsp; | &nbsp;

            BUY:
            <strong
                style="color:#22c55e"
            >
                ${buyConfidence}%
            </strong>

            &nbsp; | &nbsp;

            SELL:
            <strong
                style="color:#ef476f"
            >
                ${sellConfidence}%
            </strong>
            `;
    }


    /* -----------------------------------------
       SIGNAL TIME
    ----------------------------------------- */

    if ($("signalTime")) {

        const time =
            result.signalTime ||
            result.signalCandleTime ||
            result.timestamp;

        $("signalTime").textContent =
            `Signal Time: ${formatTime(time)}`;
    }


    /* -----------------------------------------
       TRADE LEVELS
    ----------------------------------------- */

    if ($("entry")) {

        $("entry").textContent =
            result.entry != null
                ? formatNumber(result.entry)
                : "--";
    }

    if ($("stopLoss")) {

        $("stopLoss").textContent =
            result.stopLoss != null
                ? formatNumber(result.stopLoss)
                : "--";
    }

    if ($("target")) {

        $("target").textContent =
            result.target != null
                ? formatNumber(result.target)
                : "--";
    }

    if ($("atr")) {

        $("atr").textContent =
            result.atr != null
                ? formatNumber(result.atr)
                : "--";
    }

    if ($("riskReward")) {

        $("riskReward").textContent =
            result.riskReward != null
                ? formatNumber(
                    result.riskReward,
                    2
                )
                : "--";
    }

    if ($("optionType")) {

        $("optionType").textContent =
            result.optionType ||
            "--";
    }

    if ($("strike")) {

        $("strike").textContent =
            result.suggestedStrike != null
                ? String(
                    result.suggestedStrike
                )
                : "--";
    }


    /* -----------------------------------------
       SCORE CARDS
    ----------------------------------------- */

    if ($("buyScore")) {

        $("buyScore").textContent =
            `${buyConfidence}%`;
    }

    if ($("sellScore")) {

        $("sellScore").textContent =
            `${sellConfidence}%`;
    }

    if ($("buyAgreement")) {

        $("buyAgreement").textContent =
            safeNumber(
                result?.scores?.buyAgreement,
                0
            );
    }

    if ($("sellAgreement")) {

        $("sellAgreement").textContent =
            safeNumber(
                result?.scores?.sellAgreement,
                0
            );
    }


    /* -----------------------------------------
       MARKET ANALYSIS
    ----------------------------------------- */

    const analysis =
        result.marketAnalysis ||
        {};

    if ($("trend")) {

        $("trend").textContent =
            analysis.trend ||
            "--";
    }

    if ($("structure")) {

        $("structure").textContent =
            analysis.structure ||
            "--";
    }

    if ($("bos")) {

        $("bos").textContent =
            analysis.bos ||
            "--";
    }

    if ($("choch")) {

        $("choch").textContent =
            analysis.choch ||
            "--";
    }

    if ($("fvg")) {

        $("fvg").textContent =
            analysis.fvg ||
            "--";
    }

    if ($("liquidity")) {

        $("liquidity").textContent =
            analysis.liquidity ||
            "--";
    }

    if ($("fibonacci")) {

        $("fibonacci").textContent =
            analysis.fibonacci ||
            "--";
    }

    if ($("priceRange")) {

        $("priceRange").textContent =
            analysis.priceRange ||
            "--";
    }


    /* -----------------------------------------
       INDICATORS
    ----------------------------------------- */

    const indicators =
        result.indicators ||
        {};

    if ($("ema9")) {

        $("ema9").textContent =
            indicators.ema9 != null
                ? formatNumber(
                    indicators.ema9
                )
                : "--";
    }

    if ($("ema21")) {

        $("ema21").textContent =
            indicators.ema21 != null
                ? formatNumber(
                    indicators.ema21
                )
                : "--";
    }

    if ($("rsi")) {

        $("rsi").textContent =
            indicators.rsi != null
                ? formatNumber(
                    indicators.rsi
                )
                : "--";
    }

    if ($("vwap")) {

        $("vwap").textContent =
            indicators.vwap != null
                ? formatNumber(
                    indicators.vwap
                )
                : "--";
    }

    if ($("volume")) {

        $("volume").textContent =
            indicators.volume != null
                ? String(
                    indicators.volume
                )
                : "--";
    }


    /* -----------------------------------------
       STRATEGIES
    ----------------------------------------- */

    renderStrategies(
        result.strategies
    );
}


/* =========================================================
   STRATEGY LIST
========================================================= */

function renderStrategies(
    strategies
) {

    const list =
        $("strategyList");

    if (!list) {
        return;
    }

    if (
        !strategies ||
        typeof strategies !==
            "object"
    ) {

        list.innerHTML =
            `
            <div class="strategy-empty">
                No qualifying strategy setup
            </div>
            `;

        return;
    }

    const entries =
        Object.entries(
            strategies
        );

    if (!entries.length) {

        list.innerHTML =
            `
            <div class="strategy-empty">
                No qualifying strategy setup
            </div>
            `;

        return;
    }

    const active =
        entries.filter(
            ([, value]) => {

                if (!value) {
                    return false;
                }

                if (
                    typeof value ===
                    "string"
                ) {

                    const text =
                        value.toUpperCase();

                    return (
                        text !== "NEUTRAL" &&
                        text !== "WAIT" &&
                        text !== "NONE"
                    );
                }

                if (
                    typeof value ===
                    "object"
                ) {

                    return Boolean(
                        value.signal ||
                        value.direction ||
                        value.bias
                    );
                }

                return false;
            }
        );

    if (!active.length) {

        list.innerHTML =
            `
            <div class="strategy-empty">
                No qualifying strategy setup
            </div>
            `;

        return;
    }

    list.innerHTML =
        active
            .map(
                ([name, value]) => {

                    let signal =
                        "";

                    if (
                        typeof value ===
                        "string"
                    ) {

                        signal =
                            value;

                    } else {

                        signal =
                            value.signal ||
                            value.direction ||
                            value.bias ||
                            "ACTIVE";
                    }

                    const upper =
                        String(
                            signal
                        ).toUpperCase();

                    let cls =
                        "";

                    if (
                        upper.includes(
                            "BUY"
                        )
                    ) {

                        cls =
                            "buy";

                    } else if (
                        upper.includes(
                            "SELL"
                        )
                    ) {

                        cls =
                            "sell";
                    }

                    return `
                        <div class="strategy-item">

                            <div>

                                <strong>
                                    ${escapeHtml(name)}
                                </strong>

                                <small>
                                    Active strategy signal
                                </small>

                            </div>

                            <div class="${cls}">
                                ${escapeHtml(upper)}
                            </div>

                        </div>
                    `;
                }
            )
            .join("");
}


/* =========================================================
   OPTION PREMIUM
========================================================= */

async function loadOptionPremium(
    result
) {

    if (!result) {
        return;
    }

    const decision =
        getDecision(
            result
        );

    if (
        decision !== "BUY" &&
        decision !== "SELL"
    ) {
        return;
    }

    const optionType =
        String(
            result.optionType ||
            ""
        ).toUpperCase();

    const strike =
        result.suggestedStrike;

    if (
        !optionType ||
        strike == null
    ) {
        return;
    }

    const params =
        new URLSearchParams();

    params.set(
        "market",
        selectedMarket
    );

    params.set(
        "side",
        decision
    );

    params.set(
        "option_type",
        optionType
    );

    params.set(
        "strike",
        String(strike)
    );

    try {

        const data =
            await apiFetch(
                `${API_BASE}/api/option-premium?${params.toString()}`
            );

        renderOptionPremium(
            data
        );

    } catch (error) {

        console.warn(
            "Option premium unavailable:",
            error
        );
    }
}


function renderOptionPremium(
    data
) {

    if (!data) {
        return;
    }

    let box =
        document.getElementById(
            "optionPremiumBox"
        );

    if (!box) {

        box =
            document.createElement(
                "div"
            );

        box.id =
            "optionPremiumBox";

        box.className =
            "card";

        box.innerHTML =
            `
            <h2 class="card-title">
                Live Option Premium
            </h2>

            <div
                id="optionPremiumContent"
                style="
                    font-size:14px;
                    line-height:1.8;
                    color:#d7dce5;
                "
            ></div>
            `;

        const app =
            document.querySelector(
                ".app"
            );

        const footer =
            document.querySelector(
                ".footer"
            );

        if (
            app &&
            footer
        ) {

            app.insertBefore(
                box,
                footer
            );

        } else if (app) {

            app.appendChild(
                box
            );
        }
    }

    const content =
        $("optionPremiumContent");

    if (!content) {
        return;
    }

    const premium =
        data.optionPremium ??
        data.premium ??
        data.ltp ??
        data.price;

    const expiry =
        data.expiry ??
        data.Expiry ??
        "--";

    const entry =
        data.entry ??
        data.Entry;

    const stopLoss =
        data.stopLoss ??
        data.StopLoss;

    const t1 =
        data.target1 ??
        data.t1 ??
        data.T1;

    const t2 =
        data.target2 ??
        data.t2 ??
        data.T2;

    const t3 =
        data.target3 ??
        data.t3 ??
        data.T3;

    content.innerHTML =
        `
        <div>
            <strong>Premium:</strong>
            ${
                premium != null
                    ? formatNumber(premium)
                    : "--"
            }
        </div>

        <div>
            <strong>Expiry:</strong>
            ${escapeHtml(expiry)}
        </div>

        <div>
            <strong>Entry:</strong>
            ${
                entry != null
                    ? formatNumber(entry)
                    : "--"
            }
        </div>

        <div>
            <strong>SL:</strong>
            ${
                stopLoss != null
                    ? formatNumber(stopLoss)
                    : "--"
            }
        </div>

        <div>
            <strong>T1:</strong>
            ${
                t1 != null
                    ? formatNumber(t1)
                    : "--"
            }

            &nbsp;&nbsp;

            <strong>T2:</strong>
            ${
                t2 != null
                    ? formatNumber(t2)
                    : "--"
            }

            &nbsp;&nbsp;

            <strong>T3:</strong>
            ${
                t3 != null
                    ? formatNumber(t3)
                    : "--"
            }
        </div>
        `;
}


/* =========================================================
   CUSTOMER UI
========================================================= */

function cleanCustomerUI() {

    const titles =
        document.querySelectorAll(
            ".card-title"
        );

    titles.forEach(
        (title) => {

            const text =
                title.textContent
                    .trim()
                    .toLowerCase();

            const card =
                title.closest(
                    ".card"
                );

            if (!card) {
                return;
            }

            if (
                text ===
                    "strategy scores" ||
                text ===
                    "market analysis" ||
                text ===
                    "indicators" ||
                text ===
                    "active strategy signals"
            ) {

                card.style.display =
                    "none";
            }
        }
    );

    const footer =
        document.querySelector(
            ".footer"
        );

    if (footer) {

        footer.innerHTML =
            `
            SHIV AI TRADING • LIVE MARKET • 5 MIN
            <br>
            Paper / Testing Mode
            `;
    }
}


/* =========================================================
   RUN ANALYSIS
========================================================= */

async function runAnalysis() {

    if (isLoading) {
        return;
    }

    isLoading =
        true;

    hideError();

    resetTradeUI();

    setStatus(
        `ANALYZING ${selectedMarket}...`,
        "#f59e0b"
    );

    const button =
        $("runAnalysis");

    if (button) {

        button.disabled =
            true;

        button.textContent =
            "ANALYZING...";
    }

    try {

        /*
         * 1. Live spot
         */

        await loadSpot();


        /*
         * 2. Live candles
         */

        const candles =
            await loadCandles();


        console.log(
            "SHIV AI CANDLES:",
            candles.length
        );


        /*
         * 3. Existing strategy.js
         *
         * IMPORTANT:
         * No strategy calculation is changed.
         */

        const result =
            runStrategyEngine(
                candles
            );


        console.log(
            "SHIV AI RESULT:",
            result
        );


        /*
         * 4. Render exact strategy result
         */

        renderResult(
            result
        );


        /*
         * 5. Option premium only
         *    when strategy gives BUY/SELL
         */

        await loadOptionPremium(
            result
        );


        setStatus(
            `LIVE • ${selectedMarket} • 5 MIN`,
            "#36d399"
        );

    } catch (error) {

        console.error(
            "SHIV AI ERROR:",
            error
        );

        setDataSource(
            false
        );

        setStatus(
            "ERROR",
            "#ef476f"
        );

        showError(
            error?.message ||
            "Unable to complete AI analysis."
        );

    } finally {

        isLoading =
            false;

        if (button) {

            button.disabled =
                false;

            button.textContent =
                "RUN AI ANALYSIS";
        }
    }
}


/* =========================================================
   AUTO REFRESH
========================================================= */

function startAutoRefresh() {

    if (refreshTimer) {

        clearInterval(
            refreshTimer
        );
    }

    refreshTimer =
        setInterval(
            () => {

                if (!isLoading) {

                    runAnalysis();
                }

            },
            REFRESH_MS
        );
}


/* =========================================================
   BUTTON
========================================================= */

function setupRunButton() {

    const button =
        $("runAnalysis");

    if (!button) {
        return;
    }

    button.addEventListener(
        "click",
        runAnalysis
    );
}


/* =========================================================
   INIT
========================================================= */

async function init() {

    try {

        buildMarketSelector();

        updateMarketButtons();

        cleanCustomerUI();

        setupRunButton();

        setDataSource(
            true
        );


        /*
         * First live run
         */

        await runAnalysis();


        /*
         * Continue every 30 seconds
         */

        startAutoRefresh();

    } catch (error) {

        console.error(
            "SHIV AI INIT ERROR:",
            error
        );

        showError(
            error?.message ||
            "Application initialization failed."
        );
    }
}


/* =========================================================
   START
========================================================= */

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
