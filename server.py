import os
import time
import pyotp
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from SmartApi import SmartConnect

# =========================================================
# SHIV AI TRADING - BACKEND SERVER
# Angel One SmartAPI
# NIFTY 5-Minute Live Candles
# =========================================================

app = FastAPI(title="SHIV AI TRADING API", version="1.0.0")

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

# NIFTY 50
NIFTY_TOKEN = "26000"
EXCHANGE = "NSE"
SYMBOL = "NIFTY"

INTERVAL = "FIVE_MINUTE"

# ---------------------------------------------------------
# SMART API SESSION
# ---------------------------------------------------------

smart_api = None
jwt_token = None
session_time = 0

SESSION_VALID_SECONDS = 20 * 60


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
        smart_api = SmartConnect(api_key=API_KEY)

        totp = pyotp.TOTP(TOTP_SECRET).now()

        login_data = smart_api.generateSession(
            CLIENT_CODE,
            PIN,
            totp
        )

        if not login_data:
            raise Exception("Empty Angel One login response")

        if login_data.get("status") is not True:
            message = login_data.get(
                "message",
                "Angel One login failed"
            )
            raise Exception(message)

        data = login_data.get("data") or {}

        jwt_token = data.get("jwtToken")

        if not jwt_token:
            raise Exception("JWT token not received")

        session_time = time.time()

        return True

    except Exception as e:
        smart_api = None
        jwt_token = None
        session_time = 0
        raise Exception(f"Angel One login error: {str(e)}")


def ensure_session():
    global smart_api
    global jwt_token
    global session_time

    if (
        smart_api is None
        or jwt_token is None
        or (time.time() - session_time) > SESSION_VALID_SECONDS
    ):
        create_session()

    return smart_api


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "status": "online",
        "name": "SHIV AI TRADING",
        "engine": "AI Trading Backend",
        "market": "NIFTY",
        "timeframe": "5 Minute",
        "mode": "LIVE"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "server": "SHIV AI TRADING",
        "angel_configured": bool(
            API_KEY and CLIENT_CODE and PIN and TOTP_SECRET
        ),
        "symbol": SYMBOL,
        "token": NIFTY_TOKEN,
        "interval": INTERVAL
    }


# ---------------------------------------------------------
# GET LIVE NIFTY 5-MINUTE CANDLES
# ---------------------------------------------------------

@app.get("/api/candles")
def get_candles(limit: int = 100):
    try:

        if limit < 20:
            limit = 20

        if limit > 200:
            limit = 200

        api = ensure_session()

        now = datetime.now()
        from_time = now - timedelta(days=5)

        historic_params = {
            "exchange": EXCHANGE,
            "symboltoken": NIFTY_TOKEN,
            "interval": INTERVAL,
            "fromdate": from_time.strftime("%Y-%m-%d %H:%M"),
            "todate": now.strftime("%Y-%m-%d %H:%M")
        }

        response = api.getCandleData(historic_params)

        if not response:
            raise Exception("Empty candle response")

        if response.get("status") is not True:
            raise Exception(
                response.get(
                    "message",
                    "Unable to fetch NIFTY candles"
                )
            )

        raw_data = response.get("data") or []

        if not raw_data:
            raise Exception("No candle data received")

        candles = []

        for row in raw_data[-limit:]:

            if len(row) < 6:
                continue

            candles.append({
                "time": row[0],
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5])
            })

        return {
            "success": True,
            "symbol": SYMBOL,
            "token": NIFTY_TOKEN,
            "exchange": EXCHANGE,
            "timeframe": "5m",
            "count": len(candles),
            "candles": candles
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ---------------------------------------------------------
# MARKET DATA ENDPOINT
# ---------------------------------------------------------

@app.get("/api/market")
def market_data():

    try:

        api = ensure_session()

        response = api.ltpData(
            EXCHANGE,
            "NIFTY",
            NIFTY_TOKEN
        )

        if not response:
            raise Exception("Empty LTP response")

        if response.get("status") is not True:
            raise Exception(
                response.get(
                    "message",
                    "Unable to fetch NIFTY price"
                )
            )

        data = response.get("data") or {}

        return {
            "success": True,
            "symbol": SYMBOL,
            "exchange": EXCHANGE,
            "token": NIFTY_TOKEN,
            "ltp": data.get("ltp"),
            "open": data.get("open"),
            "high": data.get("high"),
            "low": data.get("low"),
            "close": data.get("close")
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ---------------------------------------------------------
# ANALYSIS DATA
# ---------------------------------------------------------
# Existing strategy.js will perform:
#
# HH / HL / LH / LL
# BOS / CHOCH
# Fair Value Gap
# Liquidity Zone
# Liquidity Sweep
# Fibonacci Golden Zone
# Price Range
# EMA 9 / EMA 21
# RSI
# VWAP
# Volume
# ATR
# Multi-strategy confirmation
# BUY / SELL / WAIT
# Entry
# Stop Loss
# Target
# Confidence
#
# This endpoint supplies live candles to that engine.
# ---------------------------------------------------------

@app.get("/api/analyze")
def analyze_data(limit: int = 100):

    try:

        candle_response = get_candles(limit)

        candles = candle_response["candles"]

        if len(candles) < 20:
            raise Exception(
                "Not enough candles for analysis"
            )

        return {
            "success": True,
            "symbol": SYMBOL,
            "timeframe": "5m",
            "dataMode": "LIVE",
            "engine": "SHIV_AI_TRADING",
            "candles": candles
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


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
