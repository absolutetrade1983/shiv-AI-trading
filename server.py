import os
import time
import pyotp
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from SmartApi import SmartConnect

# =========================================================
# SHIV AI TRADING - MULTI MARKET BACKEND
# Angel One SmartAPI
# NIFTY | BANK NIFTY | SENSEX
# 5-MINUTE LIVE CANDLES
# =========================================================

app = FastAPI(
    title="SHIV AI TRADING API",
    version="2.0.0"
)

# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# CONFIG
# ---------------------------------------------------------

API_KEY = os.getenv("ANGEL_API_KEY", "")
CLIENT_CODE = os.getenv("ANGEL_CLIENT_CODE", "")
PIN = os.getenv("ANGEL_PIN", "")
TOTP_SECRET = os.getenv("ANGEL_TOTP_SECRET", "")

# ---------------------------------------------------------
# SUPPORTED MARKETS
# ---------------------------------------------------------
#
# Angel One index tokens:
#
# NIFTY     -> 99926000 / NSE
# BANKNIFTY -> 99926009 / NSE
# SENSEX    -> 99919000 / BSE
#
# ---------------------------------------------------------

MARKETS = {

    "NIFTY": {
        "name": "NIFTY",
        "symbol": "NIFTY",
        "token": "99926000",
        "exchange": "NSE"
    },

    "BANKNIFTY": {
        "name": "BANK NIFTY",
        "symbol": "BANKNIFTY",
        "token": "99926009",
        "exchange": "NSE"
    },

    "SENSEX": {
        "name": "SENSEX",
        "symbol": "SENSEX",
        "token": "99919000",
        "exchange": "BSE"
    }
}

INTERVAL = "FIVE_MINUTE"

# ---------------------------------------------------------
# SMART API SESSION
# ---------------------------------------------------------

smart_api = None
jwt_token = None
session_time = 0

SESSION_VALID_SECONDS = 20 * 60


# ---------------------------------------------------------
# MARKET HELPER
# ---------------------------------------------------------

def normalize_market(market: str):

    if not market:
        market = "NIFTY"

    market = market.upper().strip()

    aliases = {
        "NIFTY50": "NIFTY",
        "NIFTY 50": "NIFTY",

        "BANK NIFTY": "BANKNIFTY",
        "BANK_NIFTY": "BANKNIFTY",
        "BANK-NIFTY": "BANKNIFTY",

        "SENSEX": "SENSEX"
    }

    market = aliases.get(market, market)

    if market not in MARKETS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported market. "
                "Use NIFTY, BANKNIFTY or SENSEX."
            )
        )

    return market


def get_market_config(market: str):

    market = normalize_market(market)

    return (
        market,
        MARKETS[market]
    )


# ---------------------------------------------------------
# CREATE ANGEL ONE SESSION
# ---------------------------------------------------------

def create_session():

    global smart_api
    global jwt_token
    global session_time

    if not API_KEY:
        raise Exception(
            "ANGEL_API_KEY is missing"
        )

    if not CLIENT_CODE:
        raise Exception(
            "ANGEL_CLIENT_CODE is missing"
        )

    if not PIN:
        raise Exception(
            "ANGEL_PIN is missing"
        )

    if not TOTP_SECRET:
        raise Exception(
            "ANGEL_TOTP_SECRET is missing"
        )

    try:

        smart_api = SmartConnect(
            api_key=API_KEY
        )

        totp = pyotp.TOTP(
            TOTP_SECRET
        ).now()

        login_data = smart_api.generateSession(
            CLIENT_CODE,
            PIN,
            totp
        )

        if not login_data:
            raise Exception(
                "Empty Angel One login response"
            )

        if login_data.get("status") is not True:

            message = login_data.get(
                "message",
                "Angel One login failed"
            )

            raise Exception(message)

        data = login_data.get("data") or {}

        jwt_token = data.get(
            "jwtToken"
        )

        if not jwt_token:
            raise Exception(
                "JWT token not received"
            )

        session_time = time.time()

        return True

    except Exception as e:

        smart_api = None
        jwt_token = None
        session_time = 0

        raise Exception(
            f"Angel One login error: {str(e)}"
        )


# ---------------------------------------------------------
# ENSURE SESSION
# ---------------------------------------------------------

def ensure_session():

    global smart_api
    global jwt_token
    global session_time

    if (
        smart_api is None
        or jwt_token is None
        or (
            time.time() - session_time
        ) > SESSION_VALID_SECONDS
    ):

        create_session()

    return smart_api


# ---------------------------------------------------------
# ROOT
# ---------------------------------------------------------

@app.get("/")
def root():

    return {
        "status": "online",
        "name": "SHIV AI TRADING",
        "engine": "AI Trading Backend",
        "markets": [
            "NIFTY",
            "BANKNIFTY",
            "SENSEX"
        ],
        "timeframe": "5 Minute",
        "mode": "LIVE"
    }


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/health")
def health():

    return {
        "status": "healthy",
        "server": "SHIV AI TRADING",

        "angel_configured": bool(
            API_KEY
            and CLIENT_CODE
            and PIN
            and TOTP_SECRET
        ),

        "markets": {
            "NIFTY": MARKETS["NIFTY"],
            "BANKNIFTY": MARKETS["BANKNIFTY"],
            "SENSEX": MARKETS["SENSEX"]
        },

        "interval": INTERVAL
    }


# ---------------------------------------------------------
# GET LIVE 5-MINUTE CANDLES
# ---------------------------------------------------------

@app.get("/api/candles")
def get_candles(
    limit: int = 100,
    market: str = "NIFTY"
):

    try:

        # -----------------------------
        # Validate limit
        # -----------------------------

        if limit < 20:
            limit = 20

        if limit > 200:
            limit = 200

        # -----------------------------
        # Market
        # -----------------------------

        market_key, config = get_market_config(
            market
        )

        exchange = config["exchange"]
        symbol = config["symbol"]
        token = config["token"]

        # -----------------------------
        # Angel Session
        # -----------------------------

        api = ensure_session()

        # -----------------------------
        # Time range
        # -----------------------------

        now = datetime.now()

        from_time = (
            now - timedelta(days=5)
        )

        # -----------------------------
        # Historical parameters
        # -----------------------------

        historic_params = {

            "exchange": exchange,

            "symboltoken": token,

            "interval": INTERVAL,

            "fromdate":
                from_time.strftime(
                    "%Y-%m-%d %H:%M"
                ),

            "todate":
                now.strftime(
                    "%Y-%m-%d %H:%M"
                )
        }

        # -----------------------------
        # Get candles
        # -----------------------------

        response = api.getCandleData(
            historic_params
        )

        if not response:
            raise Exception(
                "Empty candle response"
            )

        if response.get("status") is not True:

            raise Exception(
                response.get(
                    "message",
                    f"Unable to fetch {market_key} candles"
                )
            )

        raw_data = (
            response.get("data") or []
        )

        if not raw_data:
            raise Exception(
                f"No candle data received for {market_key}"
            )

        # -----------------------------
        # Format candles
        # -----------------------------

        candles = []

        for row in raw_data[-limit:]:

            if len(row) < 6:
                continue

            try:

                candles.append({

                    "time": row[0],

                    "open": float(row[1]),

                    "high": float(row[2]),

                    "low": float(row[3]),

                    "close": float(row[4]),

                    "volume": float(row[5])

                })

            except (
                TypeError,
                ValueError
            ):

                continue

        if len(candles) < 20:

            raise Exception(
                f"Not enough {market_key} candle data"
            )

        # -----------------------------
        # Response
        # -----------------------------

        return {

            "success": True,

            "market": market_key,

            "symbol": symbol,

            "token": token,

            "exchange": exchange,

            "timeframe": "5m",

            "interval": INTERVAL,

            "count": len(candles),

            "candles": candles
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ---------------------------------------------------------
# MARKET LTP
# ---------------------------------------------------------

@app.get("/api/market")
def market_data(
    market: str = "NIFTY"
):

    try:

        market_key, config = get_market_config(
            market
        )

        exchange = config["exchange"]
        symbol = config["symbol"]
        token = config["token"]

        api = ensure_session()

        response = api.ltpData(
            exchange,
            symbol,
            token
        )

        if not response:

            raise Exception(
                "Empty LTP response"
            )

        if response.get("status") is not True:

            raise Exception(
                response.get(
                    "message",
                    f"Unable to fetch {market_key} price"
                )
            )

        data = (
            response.get("data") or {}
        )

        return {

            "success": True,

            "market": market_key,

            "symbol": symbol,

            "exchange": exchange,

            "token": token,

            "ltp": data.get("ltp"),

            "open": data.get("open"),

            "high": data.get("high"),

            "low": data.get("low"),

            "close": data.get("close")
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ---------------------------------------------------------
# ANALYSIS DATA
# ---------------------------------------------------------
#
# strategy.js performs:
#
# MARKET STRUCTURE
# BOS
# CHOCH
# FVG
# LIQUIDITY
# ORDER BLOCK
# BREAKER
# FIBONACCI
# EMA
# VWAP
# RSI
# MACD
# STOCHASTIC
# ADX
# SUPERTREND
# ORB
# PRICE ACTION
# BREAKOUT
# BREAKOUT RETEST
# BOLLINGER
# ROC
# MFI
# WILLIAMS R
# PREMIUM DISCOUNT
# ETC.
#
# Backend supplies selected market candles.
#
# ---------------------------------------------------------

@app.get("/api/analyze")
def analyze_data(

    limit: int = 100,

    market: str = "NIFTY"

):

    try:

        market_key, config = get_market_config(
            market
        )

        candle_response = get_candles(

            limit=limit,

            market=market_key

        )

        candles = (
            candle_response["candles"]
        )

        if len(candles) < 20:

            raise Exception(
                "Not enough candles for analysis"
            )

        return {

            "success": True,

            "market": market_key,

            "symbol": config["symbol"],

            "exchange": config["exchange"],

            "token": config["token"],

            "timeframe": "5m",

            "dataMode": "LIVE",

            "engine": "SHIV_AI_TRADING",

            "candles": candles
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ---------------------------------------------------------
# SUPPORTED MARKETS
# ---------------------------------------------------------

@app.get("/api/markets")
def supported_markets():

    return {

        "success": True,

        "markets": [

            {
                "key": "NIFTY",
                "name": "NIFTY",
                "exchange": "NSE",
                "token": "99926000"
            },

            {
                "key": "BANKNIFTY",
                "name": "BANK NIFTY",
                "exchange": "NSE",
                "token": "99926009"
            },

            {
                "key": "SENSEX",
                "name": "SENSEX",
                "exchange": "BSE",
                "token": "99919000"
            }

        ]

    }


# ---------------------------------------------------------
# SERVER START
# ---------------------------------------------------------

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
