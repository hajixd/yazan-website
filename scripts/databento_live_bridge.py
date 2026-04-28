from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any

import databento as db
from databento_dbn import ErrorMsg, MBP10Msg, OHLCVMsg, SymbolMappingMsg, SystemMsg, TradeMsg

PRICE_SCALE = 1_000_000_000
TERMINAL_ERROR_PATTERNS = (
    "invalid api key",
    "unauthorized",
    "authentication",
    "401",
    "403",
    "not entitled",
    "license",
    "permission",
    "subscription plan",
)

client: db.Live | None = None
stopping = False
resolved_symbol: str | None = None
connected = False


def now_ms() -> int:
    return int(time.time() * 1000)


def build_meta(schema: str, symbol: str, dataset: str, databento_symbol: str) -> dict[str, Any]:
    return {
        "provider": "Databento Live",
        "dataset": dataset,
        "schema": schema,
        "databentoSymbol": databento_symbol,
        "updatedAt": datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "resolvedSymbol": resolved_symbol,
    }


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def log_terminal_api_key_error(symbol: str, message: str) -> None:
    if not classify_terminal(message):
        return

    sys.stderr.write(
        f"[databento-live:{symbol}] Databento API key was rejected. "
        "Check DATABENTO_API_KEY / DATABENTO_KEY.\n"
    )
    sys.stderr.write(f"[databento-live:{symbol}] {message.strip()}\n")
    sys.stderr.flush()


def classify_terminal(message: str) -> bool:
    lowered = message.lower()
    return any(pattern in lowered for pattern in TERMINAL_ERROR_PATTERNS)


def normalise_price(pretty_price: Any, raw_price: Any) -> float:
    try:
        if pretty_price is not None:
            return float(pretty_price)
    except (TypeError, ValueError):
        pass

    try:
        return float(raw_price) / PRICE_SCALE
    except (TypeError, ValueError):
        return 0.0


def ns_to_ms(value: Any) -> int:
    try:
        return int(value) // 1_000_000
    except (TypeError, ValueError):
        return now_ms()


def coerce_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def firebase_market_data_configured() -> bool:
    return bool(
        os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        or (
            os.environ.get("FIREBASE_PROJECT_ID")
            and os.environ.get("FIREBASE_CLIENT_EMAIL")
            and os.environ.get("FIREBASE_PRIVATE_KEY")
        )
        or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    )


def build_order_book_snapshot(record: MBP10Msg) -> dict[str, Any]:
    levels: list[dict[str, Any]] = []

    for level in record.levels:
        bid_price = normalise_price(getattr(level, "pretty_bid_px", None), getattr(level, "bid_px", None))
        ask_price = normalise_price(getattr(level, "pretty_ask_px", None), getattr(level, "ask_px", None))
        bid_size = coerce_int(getattr(level, "bid_sz", 0))
        ask_size = coerce_int(getattr(level, "ask_sz", 0))

        if bid_price <= 0 and ask_price <= 0 and bid_size <= 0 and ask_size <= 0:
            continue

        levels.append(
            {
                "bidPrice": bid_price,
                "askPrice": ask_price,
                "bidSize": bid_size,
                "askSize": ask_size,
            }
        )

    if not levels:
        return {
            "levels": [],
            "bestBid": 0,
            "bestAsk": 0,
            "spread": 0,
            "bidTotal": 0,
            "askTotal": 0,
            "imbalance": 0,
        }

    max_bid_size = max(level["bidSize"] for level in levels) or 1
    max_ask_size = max(level["askSize"] for level in levels) or 1
    bid_total = sum(level["bidSize"] for level in levels)
    ask_total = sum(level["askSize"] for level in levels)
    best_bid = levels[0]["bidPrice"]
    best_ask = levels[0]["askPrice"]

    return {
        "levels": [
            {
                **level,
                "bidFillPct": (level["bidSize"] / max_bid_size) * 100 if max_bid_size else 0,
                "askFillPct": (level["askSize"] / max_ask_size) * 100 if max_ask_size else 0,
            }
            for level in levels
        ],
        "bestBid": best_bid,
        "bestAsk": best_ask,
        "spread": max(0.0, best_ask - best_bid),
        "bidTotal": bid_total,
        "askTotal": ask_total,
        "imbalance": ((bid_total - ask_total) / (bid_total + ask_total) * 100)
        if (bid_total + ask_total) > 0
        else 0,
    }


def ensure_connected(symbol: str, dataset: str, databento_symbol: str) -> None:
    global connected

    if connected:
        return

    connected = True
    emit(
        {
            "type": "status",
            "symbol": symbol,
            "state": "connected",
            "message": "Databento live stream connected.",
            "time": now_ms(),
            "meta": build_meta("trades", symbol, dataset, databento_symbol),
        }
    )


def handle_signal(_: int, __: Any) -> None:
    global stopping

    stopping = True

    if client is not None:
        try:
            client.terminate()
        except Exception:
            pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bridge Databento live records into NDJSON.")
    parser.add_argument("--symbol", required=True, help="Application symbol, e.g. ES")
    parser.add_argument("--databento-symbol", required=True, help="Databento symbol, e.g. ES.c.0")
    parser.add_argument("--dataset", required=True, help="Databento dataset, e.g. GLBX.MDP3")
    return parser.parse_args()


def main() -> int:
    global client
    global resolved_symbol

    args = parse_args()
    api_key = os.environ.get("DATABENTO_API_KEY") or os.environ.get("DATABENTO_KEY")

    if not api_key:
        emit(
            {
                "type": "error",
                "symbol": args.symbol,
                "message": "Missing DATABENTO_API_KEY. Add it before starting the live bridge.",
                "retrying": False,
                "time": now_ms(),
                "meta": build_meta("trades", args.symbol, args.dataset, args.databento_symbol),
            }
        )
        return 1

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    emit(
        {
            "type": "status",
            "symbol": args.symbol,
            "state": "connecting",
            "message": "Connecting to Databento live stream...",
            "time": now_ms(),
            "meta": build_meta("trades", args.symbol, args.dataset, args.databento_symbol),
        }
    )

    try:
        client = db.Live(
            key=api_key,
            reconnect_policy=db.ReconnectPolicy.RECONNECT,
            heartbeat_interval_s=10,
        )
        client.subscribe(
            dataset=args.dataset,
            schema="trades",
            symbols=[args.databento_symbol],
            stype_in="continuous",
        )
        client.subscribe(
            dataset=args.dataset,
            schema="mbp-10",
            symbols=[args.databento_symbol],
            stype_in="continuous",
        )
        if firebase_market_data_configured():
            client.subscribe(
                dataset=args.dataset,
                schema="ohlcv-1m",
                symbols=[args.databento_symbol],
                stype_in="continuous",
            )

        for record in client:
            if stopping:
                break

            if isinstance(record, SymbolMappingMsg):
                resolved_symbol = str(record.stype_out_symbol).strip()
                emit(
                    {
                        "type": "status",
                        "symbol": args.symbol,
                        "state": "connected",
                        "message": f"{args.databento_symbol} mapped to {resolved_symbol}.",
                        "time": now_ms(),
                        "meta": build_meta("trades", args.symbol, args.dataset, args.databento_symbol),
                    }
                )
                continue

            if isinstance(record, SystemMsg):
                if not bool(getattr(record, "is_heartbeat", False)):
                    ensure_connected(args.symbol, args.dataset, args.databento_symbol)
                continue

            if isinstance(record, ErrorMsg):
                message = str(getattr(record, "err", "")) or "Databento sent an error message."
                log_terminal_api_key_error(args.symbol, message)
                emit(
                    {
                        "type": "error",
                        "symbol": args.symbol,
                        "message": message,
                        "retrying": not classify_terminal(message),
                        "time": ns_to_ms(getattr(record, "ts_event", None)),
                        "meta": build_meta("trades", args.symbol, args.dataset, args.databento_symbol),
                    }
                )
                continue

            ensure_connected(args.symbol, args.dataset, args.databento_symbol)

            if isinstance(record, TradeMsg):
                emit(
                    {
                        "type": "trade",
                        "symbol": args.symbol,
                        "price": normalise_price(getattr(record, "pretty_price", None), getattr(record, "price", None)),
                        "size": coerce_int(getattr(record, "size", 0)),
                        "time": ns_to_ms(getattr(record, "ts_event", None)),
                        "meta": build_meta("trades", args.symbol, args.dataset, args.databento_symbol),
                    }
                )
                continue

            if isinstance(record, MBP10Msg):
                emit(
                    {
                        "type": "book",
                        "symbol": args.symbol,
                        "time": ns_to_ms(getattr(record, "ts_event", None)),
                        "snapshot": build_order_book_snapshot(record),
                        "meta": build_meta("mbp-10", args.symbol, args.dataset, args.databento_symbol),
                    }
                )
                continue

            if isinstance(record, OHLCVMsg):
                emit(
                    {
                        "type": "candle",
                        "symbol": args.symbol,
                        "timeframe": "1m",
                        "time": ns_to_ms(getattr(record, "ts_event", None)),
                        "open": normalise_price(
                            getattr(record, "pretty_open", None), getattr(record, "open", None)
                        ),
                        "high": normalise_price(
                            getattr(record, "pretty_high", None), getattr(record, "high", None)
                        ),
                        "low": normalise_price(
                            getattr(record, "pretty_low", None), getattr(record, "low", None)
                        ),
                        "close": normalise_price(
                            getattr(record, "pretty_close", None), getattr(record, "close", None)
                        ),
                        "volume": coerce_int(getattr(record, "volume", 0)),
                        "meta": build_meta("ohlcv-1m", args.symbol, args.dataset, args.databento_symbol),
                    }
                )

    except Exception as error:
        message = str(error) or "Databento live bridge failed."
        log_terminal_api_key_error(args.symbol, message)
        emit(
            {
                "type": "error",
                "symbol": args.symbol,
                "message": message,
                "retrying": not classify_terminal(message),
                "time": now_ms(),
                "meta": build_meta("trades", args.symbol, args.dataset, args.databento_symbol),
            }
        )
        return 1
    finally:
        if client is not None and not stopping:
            try:
                client.stop()
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
