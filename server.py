import os
import json
import time
import requests
import pyotp

from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from SmartApi import SmartConnect


# =========================================================
# SHIV AI TRADING API
# =========================================================

app = FastAPI(
    title="SHIV AI TRADING API",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ANGEL ONE CONFIG
# =========================================================

API_KEY = os.getenv("ANGEL_API_KEY", "")
CLIENT_CODE = os.getenv("ANGEL_CLIENT_CODE", "")
PIN = os.getenv("ANGEL_PIN", "")
TOTP_SECRET = os.getenv("ANGEL_TOTP_SECRET", "")


# =========================================================
# MARKETS
# =========================================================

MARKETS = {
    "NIFTY": {
        "name": "NIFTY",
        "symbol": "NIFTY",
        "token": "99926000",
        "exchange": "NSE",
        "derivative_exchange": "NFO"
    },

    "BANKNIFTY": {
        "name": "BANK NIFTY",
        "symbol": "BANKNIFTY",
        "token": "99926009",
        "exchange": "NSE",
        "derivative_exchange": "NFO"
    },

    "SENSEX": {
        "name": "SENSEX",
        "symbol": "SENSEX",
        "token": "99919000",
        "exchange": "BSE",
        "derivative_exchange": "BFO"
    }
}


INTERVAL = "FIVE_MINUTE"


# =========================================================
# OPTION PREMIUM SETTINGS
# =========================================================

# These are configurable from Render Environment Variables.

OPTION_SL_PCT = float(
    os.getenv("OPTION_SL_PCT", "0.20")
)

OPTION_T1_PCT = float(
    os.getenv("OPTION_T1_PCT", "0.25")
)

OPTION_T2_PCT = float(
    os.getenv("OPTION_T2_PCT", "0.50")
)

OPTION_T3_PCT = float(
    os.getenv("OPTION_T3_PCT", "0.75")
)


# =========================================================
# ANGEL SESSION
# =========================================================

smart_api = None
jwt_token = None
session_time = 0

SESSION_VALID_SECONDS = 20 * 60


# =========================================================
# INSTRUMENT MASTER CACHE
# =========================================================

INSTRUMENT_MASTER_URL = (
    "https://margincalculator.angelone.in/"
    "OpenAPI_File/files/OpenAPIScripMaster.json"
)

instrument_cache = None
instrument_cache_time = 0

INSTRUMENT_CACHE_SECONDS = 15 * 60


# =========================================================
# MARKET NORMALIZATION
# =========================================================

def normalize_market(market: str):

    if not market:
        return "NIFTY"

    value = market.strip().upper()

    aliases = {
        "NIFTY": "NIFTY",
        "NIFTY50": "NIFTY",
        "NIFTY 50": "NIFTY",

        "BANKNIFTY": "BANKNIFTY",
        "BANK NIFTY": "BANKNIFTY",
        "BANK-NIFTY": "BANKNIFTY",

        "SENSEX": "SENSEX",
        "BSE SENSEX": "SENSEX"
    }

    return aliases.get(value, value)


def get_market_config(market: str):

    normalized = normalize_market(market)

    if normalized not in MARKETS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported market: {market}"
        )

    return normalized, MARKETS[normalized]


# =========================================================
# CREATE ANGEL SESSION
# =========================================================

def create_session():

    global smart_api
    global jwt_token
    global session_time

    if not API_KEY:
        raise Exception("ANGEL_API_KEY is missing")

    if not CLIENT_CODE:
        raise Exception("ANGEL_CLIENT_CODE is missing")

    if not PIN:
        raise Exception("ANGEL_PIN is missing")

    if not TOTP_SECRET:
        raise Exception("ANGEL_TOTP_SECRET is missing")

    try:

        smart_api = SmartConnect(
            api_key=API_KEY
        )

        totp = pyotp.TOTP(
            TOTP_SECRET
        ).now()

        session = smart_api.generateSession(
            CLIENT_CODE,
            PIN,
            totp
        )

        if not session:
            raise Exception(
                "Empty Angel One session response"
            )

        if session.get("status") is False:
            raise Exception(
                str(session)
            )

        data = session.get("data") or {}

        jwt_token = data.get(
            "jwtToken"
        )

        if not jwt_token:
            raise Exception(
                "JWT token not received from Angel One"
            )

        session_time = time.time()

        return smart_api

    except Exception as e:

        smart_api = None
        jwt_token = None

        raise Exception(
            f"Angel One login failed: {str(e)}"
        )


# =========================================================
# ENSURE SESSION
# =========================================================

def ensure_session():

    global smart_api
    global session_time

    if (
        smart_api is None
        or not jwt_token
        or time.time() - session_time
        > SESSION_VALID_SECONDS
    ):

        create_session()

    return smart_api


# =========================================================
# INSTRUMENT MASTER
# =========================================================

def load_instruments():

    global instrument_cache
    global instrument_cache_time

    now = time.time()

    if (
        instrument_cache is not None
        and now - instrument_cache_time
        < INSTRUMENT_CACHE_SECONDS
    ):
        return instrument_cache

    try:

        response = requests.get(
            INSTRUMENT_MASTER_URL,
            timeout=30
        )

        response.raise_for_status()

        data = response.json()

        if not isinstance(data, list):
            raise Exception(
                "Invalid instrument master format"
            )

        instrument_cache = data
        instrument_cache_time = now

        return data

    except Exception as e:

        # If cached data exists, use it
        if instrument_cache is not None:
            return instrument_cache

        raise Exception(
            f"Unable to load Angel instrument master: {str(e)}"
        )


# =========================================================
# HELPERS
# =========================================================

def normalize_master_name(value):

    if value is None:
        return ""

    return (
        str(value)
        .upper()
        .replace(" ", "")
        .replace("-", "")
        .replace("_", "")
    )


def parse_expiry(value):

    if not value:
        return None

    value = str(value).strip().upper()

    formats = [
        "%d%b%Y",
        "%d%b%y",
        "%d-%b-%Y",
        "%d-%b-%y",
        "%Y-%m-%d",
        "%d/%m/%Y"
    ]

    for fmt in formats:

        try:
            return datetime.strptime(
                value,
                fmt
            ).date()

        except ValueError:
            continue

    return None


def normalize_strike(raw_strike):

    try:

        value = float(raw_strike)

        # Angel One option-master strikes are commonly
        # represented in paise-style scaling.
        if value >= 100000:
            return value / 100.0

        return value

    except Exception:
        return None


def get_ltp(exchange, symbol, token):

    api = ensure_session()

    response = api.ltpData(
        exchange,
        symbol,
        str(token)
    )

    if not response:
        raise Exception(
            "Empty LTP response"
        )

    if response.get("status") is False:
        raise Exception(
            str(response)
        )

    data = response.get("data") or {}

    ltp = data.get("ltp")

    if ltp is None:
        raise Exception(
            f"LTP missing: {response}"
        )

    return float(ltp)


# =========================================================
# GET SPOT LTP
# =========================================================

def get_spot_data(market):

    normalized, config = get_market_config(
        market
    )

    api = ensure_session()

    response = api.ltpData(
        config["exchange"],
        config["symbol"],
        config["token"]
    )

    if not response:
        raise Exception(
            "Empty market LTP response"
        )

    if response.get("status") is False:
        raise Exception(
            str(response)
        )

    data = response.get("data") or {}

    ltp = data.get("ltp")

    if ltp is None:
        raise Exception(
            f"Spot LTP missing: {response}"
        )

    return {
        "market": normalized,
        "symbol": config["symbol"],
        "exchange": config["exchange"],
        "token": config["token"],
        "ltp": float(ltp),
        "open": data.get("open"),
        "high": data.get("high"),
        "low": data.get("low"),
        "close": data.get("close")
    }


# =========================================================
# FIND OPTION CONTRACT
# =========================================================

def find_option_contract(
    market,
    spot,
    option_type
):

    normalized, config = get_market_config(
        market
    )

    option_type = option_type.upper()

    if option_type not in ["CE", "PE"]:
        raise Exception(
            "option_type must be CE or PE"
        )

    instruments = load_instruments()

    derivative_exchange = config[
        "derivative_exchange"
    ]

    target_name = normalize_master_name(
        config["symbol"]
    )

    today = datetime.now(
        timezone.utc
    ).date()

    candidates = []

    for item in instruments:

        try:

            if str(
                item.get("exch_seg", "")
            ).upper() != derivative_exchange:
                continue

            instrument_type = str(
                item.get("instrumenttype", "")
            ).upper()

            if instrument_type != "OPTIDX":
                continue

            master_name = normalize_master_name(
                item.get("name", "")
            )

            if master_name != target_name:
                continue

            symbol = str(
                item.get("symbol", "")
            ).upper()

            if not symbol.endswith(
                option_type
            ):
                continue

            expiry_value = item.get(
                "expiry"
            )

            expiry_date = parse_expiry(
                expiry_value
            )

            if expiry_date is None:
                continue

            if expiry_date < today:
                continue

            strike = normalize_strike(
                item.get("strike")
            )

            if strike is None:
                continue

            token = item.get(
                "token"
            )

            if not token:
                continue

            candidates.append({
                "symbol": symbol,
                "token": str(token),
                "expiry": str(
                    expiry_value
                ),
                "expiry_date": expiry_date,
                "strike": float(strike),
                "lotsize": item.get(
                    "lotsize"
                ),
                "tick_size": item.get(
                    "tick_size"
                ),
                "exchange": derivative_exchange
            })

        except Exception:
            continue

    if not candidates:

        raise Exception(
            f"No {option_type} options found for {normalized}"
        )

    # -----------------------------------------------------
    # Select nearest upcoming expiry
    # -----------------------------------------------------

    expiries = sorted(
        set(
            item["expiry_date"]
            for item in candidates
        )
    )

    selected_expiry = expiries[0]

    expiry_candidates = [
        item
        for item in candidates
        if item["expiry_date"]
        == selected_expiry
    ]

    # -----------------------------------------------------
    # Select strike nearest to spot
    # -----------------------------------------------------

    selected = min(
        expiry_candidates,
        key=lambda x: abs(
            x["strike"] - spot
        )
    )

    return selected


# =========================================================
# OPTION PREMIUM PLAN
# =========================================================

def create_option_plan(
    premium
):

    premium = float(premium)

    entry = premium

    stop_loss = premium * (
        1 - OPTION_SL_PCT
    )

    target1 = premium * (
        1 + OPTION_T1_PCT
    )

    target2 = premium * (
        1 + OPTION_T2_PCT
    )

    target3 = premium * (
        1 + OPTION_T3_PCT
    )

    return {
        "entry": round(entry, 2),
        "stopLoss": round(
            stop_loss,
            2
        ),
        "target1": round(
            target1,
            2
        ),
        "target2": round(
            target2,
            2
        ),
        "target3": round(
            target3,
            2
        )
    }


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "status": "online",
        "name": "SHIV AI TRADING API",
        "engine": "LIVE ANGEL ONE",
        "version": "3.0.0",
        "markets": list(
            MARKETS.keys()
        ),
        "timeframe": "5 Minute",
        "mode": "LIVE"
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "angel_configured": bool(
            API_KEY
            and CLIENT_CODE
            and PIN
            and TOTP_SECRET
        ),
        "markets": list(
            MARKETS.keys()
        ),
        "interval": INTERVAL,
        "option_engine": True
    }


# =========================================================
# CANDLES
# =========================================================

@app.get("/api/candles")
def candles(
    limit: int = 100,
    market: str = "NIFTY"
):

    if limit < 20:
        limit = 20

    if limit > 200:
        limit = 200

    normalized, config = get_market_config(
        market
    )

    api = ensure_session()

    to_date = datetime.now()

    # Fetch enough history for requested candles.
    # 5 days gives a reasonable intraday window.

    from_date = to_date - timedelta(
        days=5
    )

    response = api.getCandleData({
        "exchange": config["exchange"],
        "symboltoken": config["token"],
        "interval": INTERVAL,
        "fromdate": from_date.strftime(
            "%Y-%m-%d %H:%M"
        ),
        "todate": to_date.strftime(
            "%Y-%m-%d %H:%M"
        )
    })

    if not response:
        raise HTTPException(
            status_code=502,
            detail="Empty candle response"
        )

    if response.get("status") is False:
        raise HTTPException(
            status_code=502,
            detail=str(response)
        )

    data = response.get(
        "data"
    ) or []

    if len(data) > limit:
        data = data[-limit:]

    return {
        "success": True,
        "market": normalized,
        "exchange": config["exchange"],
        "symbol": config["symbol"],
        "token": config["token"],
        "interval": INTERVAL,
        "count": len(data),
        "candles": data
    }


# =========================================================
# MARKET
# =========================================================

@app.get("/api/market")
def market(
    market: str = "NIFTY"
):

    try:

        return {
            "success": True,
            **get_spot_data(
                market
            )
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=502,
            detail=str(e)
        )


# =========================================================
# ANALYZE
# =========================================================

@app.get("/api/analyze")
def analyze(
    market: str = "NIFTY",
    limit: int = 100
):

    normalized, config = get_market_config(
        market
    )

    candle_response = candles(
        limit=limit,
        market=normalized
    )

    return {
        "success": True,
        "market": normalized,
        "symbol": config["symbol"],
        "timeframe": "5m",
        "mode": "LIVE ANGEL ONE",
        "candles": candle_response[
            "candles"
        ],
        "count": candle_response[
            "count"
        ]
    }


# =========================================================
# MARKETS
# =========================================================

@app.get("/api/markets")
def markets():

    return {
        "success": True,
        "markets": MARKETS
    }


# =========================================================
# OPTION PREMIUM
# =========================================================
#
# Example:
#
# /api/option-premium?market=BANKNIFTY&direction=BUY
#
# BUY  -> CE
# SELL -> PE
# WAIT -> no option
#
# =========================================================

@app.get("/api/option-premium")
def option_premium(
    market: str = "NIFTY",
    direction: str = "WAIT"
):

    try:

        normalized, config = get_market_config(
            market
        )

        direction = (
            direction
            .strip()
            .upper()
        )

        # -------------------------------------------------
        # WAIT = no option trade
        # -------------------------------------------------

        if direction == "WAIT":

            spot_data = get_spot_data(
                normalized
            )

            return {
                "success": True,
                "market": normalized,
                "signal": "WAIT",
                "optionType": None,
                "exchange": config[
                    "derivative_exchange"
                ],
                "spot": spot_data[
                    "ltp"
                ],
                "message": "No option selected while AI decision is WAIT."
            }

        # -------------------------------------------------
        # Only BUY / SELL accepted
        # -------------------------------------------------

        if direction not in [
            "BUY",
            "SELL"
        ]:

            raise HTTPException(
                status_code=400,
                detail=(
                    "direction must be BUY, SELL or WAIT"
                )
            )

        # -------------------------------------------------
        # Get live index spot
        # -------------------------------------------------

        spot_data = get_spot_data(
            normalized
        )

        spot = float(
            spot_data["ltp"]
        )

        # -------------------------------------------------
        # BUY signal -> CE
        # SELL signal -> PE
        # -------------------------------------------------

        option_type = (
            "CE"
            if direction == "BUY"
            else "PE"
        )

        # -------------------------------------------------
        # Find actual Angel option contract
        # -------------------------------------------------

        contract = find_option_contract(
            normalized,
            spot,
            option_type
        )

        # -------------------------------------------------
        # Get live option premium
        # -------------------------------------------------

        premium = get_ltp(
            contract["exchange"],
            contract["symbol"],
            contract["token"]
        )

        # -------------------------------------------------
        # Premium trade levels
        # -------------------------------------------------

        plan = create_option_plan(
            premium
        )

        return {
            "success": True,

            "market": normalized,

            "signal": direction,

            "spot": round(
                spot,
                2
            ),

            "optionType": option_type,

            "exchange": contract[
                "exchange"
            ],

            "tradingsymbol": contract[
                "symbol"
            ],

            "symboltoken": contract[
                "token"
            ],

            "expiry": contract[
                "expiry"
            ],

            "strike": contract[
                "strike"
            ],

            "lotsize": contract[
                "lotsize"
            ],

            "tickSize": contract[
                "tick_size"
            ],

            "premium": round(
                premium,
                2
            ),

            "entry": plan[
                "entry"
            ],

            "stopLoss": plan[
                "stopLoss"
            ],

            "target1": plan[
                "target1"
            ],

            "target2": plan[
                "target2"
            ],

            "target3": plan[
                "target3"
            ],

            "riskSettings": {
                "stopLossPercent": (
                    OPTION_SL_PCT * 100
                ),
                "target1Percent": (
                    OPTION_T1_PCT * 100
                ),
                "target2Percent": (
                    OPTION_T2_PCT * 100
                ),
                "target3Percent": (
                    OPTION_T3_PCT * 100
                )
            }
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=502,
            detail=str(e)
        )


# =========================================================
# RUN
# =========================================================

if __name__ == "__main__":

    import uvicorn

    port = int(
        os.getenv(
            "PORT",
            "8000"
        )
    )

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port
    )
