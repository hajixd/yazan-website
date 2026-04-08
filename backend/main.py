from __future__ import annotations

import queue
import json
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import databento as db
from databento_dbn import BBOMsg, ErrorMsg, MBOMsg, MBP1Msg, MBP10Msg, OHLCVMsg, SymbolMappingMsg, SystemMsg, TradeMsg
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

PRICE_SCALE = 1_000_000_000
DATABENTO_DATASET = "GLBX.MDP3"
SSE_RETRY_MS = 2_500
QUEUE_POLL_TIMEOUT_S = 1.0
STREAM_HEADERS = {
    "Cache-Control": "no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}
DEPTH_SCHEMAS = ("mbp-10", "mbo", "mbp-1")
# Keep a tiny replay window so reconnects can bridge brief gaps without making
# the UI chew through a long backlog before it feels live again.
LIVE_REPLAY_WINDOW = timedelta(seconds=5)
MBO_SNAPSHOT_LEVEL_COUNT = 10
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
FUTURES_SYMBOLS = {
    "ES": "ES.c.0",
    "NQ": "NQ.c.0",
    "RTY": "RTY.c.0",
    "YM": "YM.c.0",
    "CL": "CL.c.0",
    "NG": "NG.c.0",
    "MGC": "MGC.c.0",
    "SI": "SI.c.0",
    "HG": "HG.c.0",
    "ZN": "ZN.c.0",
    "6E": "6E.c.0",
    "6J": "6J.c.0",
    "6A": "6A.c.0",
}

app = FastAPI()


def now_ms() -> int:
    return int(time.time() * 1000)


def build_meta(schema: str, databento_symbol: str, resolved_symbol: str | None) -> dict[str, Any]:
    return {
        "provider": "Databento Live",
        "dataset": DATABENTO_DATASET,
        "schema": schema,
        "databentoSymbol": databento_symbol,
        "updatedAt": datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z"),
        "resolvedSymbol": resolved_symbol,
    }


def get_live_replay_start() -> datetime:
    return datetime.now(timezone.utc) - LIVE_REPLAY_WINDOW


def encode_sse_event(payload: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(payload, separators=(',', ':'))}\n\n".encode("utf-8")


def encode_sse_comment(comment: str = "ping") -> bytes:
    return f": {comment}\n\n".encode("utf-8")


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
        if raw_price == db.UNDEF_PRICE:
            return 0.0
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


def enum_code(value: Any) -> str:
    resolved = getattr(value, "value", value)

    if resolved is None:
        return ""

    return str(resolved).upper()


def stop_live_client(client: db.Live | None) -> None:
    if client is None:
        return

    terminate = getattr(client, "terminate", None)

    if callable(terminate):
        try:
            terminate()
            return
        except Exception:
            pass

    try:
        client.stop()
    except Exception:
        pass


def build_order_book_snapshot(record: MBP10Msg | MBP1Msg | BBOMsg) -> dict[str, Any]:
    levels: list[dict[str, Any]] = []

    for level in record.levels:
        bid_price = normalise_price(
            getattr(level, "pretty_bid_px", None), getattr(level, "bid_px", None)
        )
        ask_price = normalise_price(
            getattr(level, "pretty_ask_px", None), getattr(level, "ask_px", None)
        )
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


def build_order_book_snapshot_from_price_levels(
    bid_levels: list[tuple[int, int]],
    ask_levels: list[tuple[int, int]],
) -> dict[str, Any]:
    normalized_bids = [
        (normalise_price(None, price), size)
        for price, size in bid_levels
        if price != db.UNDEF_PRICE and size > 0
    ]
    normalized_asks = [
        (normalise_price(None, price), size)
        for price, size in ask_levels
        if price != db.UNDEF_PRICE and size > 0
    ]

    if not normalized_bids and not normalized_asks:
        return {
            "levels": [],
            "bestBid": 0,
            "bestAsk": 0,
            "spread": 0,
            "bidTotal": 0,
            "askTotal": 0,
            "imbalance": 0,
        }

    level_count = max(len(normalized_bids), len(normalized_asks))
    max_bid_size = max((size for _, size in normalized_bids), default=1)
    max_ask_size = max((size for _, size in normalized_asks), default=1)
    bid_total = sum(size for _, size in normalized_bids)
    ask_total = sum(size for _, size in normalized_asks)
    best_bid = normalized_bids[0][0] if normalized_bids else 0.0
    best_ask = normalized_asks[0][0] if normalized_asks else 0.0
    levels: list[dict[str, Any]] = []

    for index in range(level_count):
        bid_price, bid_size = normalized_bids[index] if index < len(normalized_bids) else (0.0, 0)
        ask_price, ask_size = normalized_asks[index] if index < len(normalized_asks) else (0.0, 0)

        if bid_price <= 0 and ask_price <= 0 and bid_size <= 0 and ask_size <= 0:
            continue

        levels.append(
            {
                "bidPrice": bid_price,
                "askPrice": ask_price,
                "bidSize": bid_size,
                "askSize": ask_size,
                "bidFillPct": (bid_size / max_bid_size) * 100 if max_bid_size else 0,
                "askFillPct": (ask_size / max_ask_size) * 100 if max_ask_size else 0,
            }
        )

    return {
        "levels": levels,
        "bestBid": best_bid,
        "bestAsk": best_ask,
        "spread": max(0.0, best_ask - best_bid) if best_bid > 0 and best_ask > 0 else 0.0,
        "bidTotal": bid_total,
        "askTotal": ask_total,
        "imbalance": ((bid_total - ask_total) / (bid_total + ask_total) * 100)
        if (bid_total + ask_total) > 0
        else 0,
    }


class MBOBook:
    def __init__(self) -> None:
        self.orders_by_id: dict[int, tuple[str, int, int]] = {}
        self.bids: dict[int, int] = {}
        self.asks: dict[int, int] = {}

    def _side_levels(self, side: str) -> dict[int, int]:
        return self.asks if side == "A" else self.bids

    def _set_level_size(self, side: str, price: int, size: int) -> None:
        levels = self._side_levels(side)

        if price == db.UNDEF_PRICE or size <= 0:
            levels.pop(price, None)
            return

        levels[price] = size

    def _adjust_level_size(self, side: str, price: int, delta: int) -> None:
        levels = self._side_levels(side)
        next_size = levels.get(price, 0) + delta

        if price == db.UNDEF_PRICE or next_size <= 0:
            levels.pop(price, None)
            return

        levels[price] = next_size

    def clear(self) -> None:
        self.orders_by_id.clear()
        self.bids.clear()
        self.asks.clear()

    def apply(self, record: MBOMsg) -> None:
        action = enum_code(getattr(record, "action", ""))

        if action in ("T", "F", "N"):
            return

        if action == "R":
            self.clear()
            return

        side = enum_code(getattr(record, "side", ""))

        if side not in ("A", "B"):
            return

        flags = getattr(record, "flags", 0)
        price = coerce_int(getattr(record, "price", 0))
        size = max(0, coerce_int(getattr(record, "size", 0)))

        if flags & db.RecordFlags.F_TOB:
            levels = self._side_levels(side)
            levels.clear()

            if price != db.UNDEF_PRICE and size > 0 and action in ("A", "M"):
                levels[price] = size

            return

        if flags & db.RecordFlags.F_MBP:
            if action == "C":
                self._set_level_size(side, price, 0)
            elif action in ("A", "M"):
                self._set_level_size(side, price, size)

            return

        order_id = coerce_int(getattr(record, "order_id", 0))

        if action == "A":
            existing = self.orders_by_id.get(order_id)

            if existing:
                old_side, old_price, old_size = existing
                self._adjust_level_size(old_side, old_price, -old_size)

            self.orders_by_id[order_id] = (side, price, size)
            self._adjust_level_size(side, price, size)
            return

        if action == "C":
            existing = self.orders_by_id.get(order_id)

            if not existing:
                return

            old_side, old_price, old_size = existing
            cancel_size = old_size if size <= 0 else min(old_size, size)
            next_size = max(0, old_size - cancel_size)
            self._adjust_level_size(old_side, old_price, -cancel_size)

            if next_size == 0:
                self.orders_by_id.pop(order_id, None)
            else:
                self.orders_by_id[order_id] = (old_side, old_price, next_size)

            return

        if action == "M":
            existing = self.orders_by_id.get(order_id)

            if not existing:
                self.orders_by_id[order_id] = (side, price, size)
                self._adjust_level_size(side, price, size)
                return

            old_side, old_price, old_size = existing
            next_side = side if side in ("A", "B") else old_side
            next_price = price if price != db.UNDEF_PRICE else old_price
            next_size = size if size > 0 else old_size
            self._adjust_level_size(old_side, old_price, -old_size)
            self.orders_by_id[order_id] = (next_side, next_price, next_size)
            self._adjust_level_size(next_side, next_price, next_size)

    def build_snapshot(self, level_count: int = MBO_SNAPSHOT_LEVEL_COUNT) -> dict[str, Any]:
        bid_levels = sorted(self.bids.items(), key=lambda item: item[0], reverse=True)[:level_count]
        ask_levels = sorted(self.asks.items(), key=lambda item: item[0])[:level_count]
        return build_order_book_snapshot_from_price_levels(bid_levels, ask_levels)


def build_status_event(
    symbol: str,
    state: str,
    message: str,
    databento_symbol: str,
    resolved_symbol: str | None,
    schema: str = "trades",
) -> dict[str, Any]:
    return {
        "type": "status",
        "symbol": symbol,
        "state": state,
        "message": message,
        "time": now_ms(),
        "meta": build_meta(schema, databento_symbol, resolved_symbol),
    }


def build_error_event(
    symbol: str,
    message: str,
    retrying: bool,
    event_time_ms: int,
    databento_symbol: str,
    resolved_symbol: str | None,
    schema: str = "trades",
) -> dict[str, Any]:
    return {
        "type": "error",
        "symbol": symbol,
        "message": message,
        "retrying": retrying,
        "time": event_time_ms,
        "meta": build_meta(schema, databento_symbol, resolved_symbol),
    }


def is_depth_not_authorized(message: str) -> bool:
    lowered = message.lower()
    return any(token in lowered for token in ("mbp-10", "mbp-1", "mbo")) and any(
        phrase in lowered
        for phrase in ("not authorized", "not entitled", "permission", "license", "subscription")
    )


def get_depth_schema_label(schema: str) -> str:
    if schema == "mbo":
        return "reconstructed full depth"
    return "top-of-book" if schema == "mbp-1" else "full depth"


def get_depth_connected_message(schema: str) -> str:
    if schema == "mbo":
        return "Databento live reconstructed depth connected."

    if schema == "mbp-1":
        return "Databento live top-of-book quote connected."

    return "Databento live depth stream connected."


def get_depth_unavailable_message(schema: str) -> str:
    if schema == "mbp-1":
        return "Live top-of-book quote requires a Databento depth entitlement."

    return "Live order book requires a Databento depth entitlement."


def stream_trades_client(
    symbol: str,
    databento_symbol: str,
    api_key: str,
    enqueue: Any,
    stop_event: threading.Event,
    client_refs: dict[str, db.Live | None],
) -> None:
    resolved_symbol: str | None = None
    connected = False
    client: db.Live | None = None

    try:
        client = db.Live(
            key=api_key,
            reconnect_policy=db.ReconnectPolicy.RECONNECT,
            heartbeat_interval_s=10,
        )
        client_refs["trades"] = client

        client.subscribe(
            dataset=DATABENTO_DATASET,
            schema="trades",
            symbols=[databento_symbol],
            stype_in="continuous",
            start=get_live_replay_start(),
        )

        for record in client:
            if stop_event.is_set():
                break

            if isinstance(record, SymbolMappingMsg):
                resolved = str(record.stype_out_symbol).strip()
                resolved_symbol = resolved or None
                enqueue(
                    build_status_event(
                        symbol,
                        "connected",
                        f"{databento_symbol} mapped to {resolved_symbol}.",
                        databento_symbol,
                        resolved_symbol,
                    )
                )
                continue

            if isinstance(record, SystemMsg):
                enqueue(encode_sse_comment())

                if not bool(getattr(record, "is_heartbeat", False)) and not connected:
                    connected = True
                    enqueue(
                        build_status_event(
                            symbol,
                            "connected",
                            "Databento live trade stream connected.",
                            databento_symbol,
                            resolved_symbol,
                        )
                    )

                continue

            if isinstance(record, ErrorMsg):
                message = str(getattr(record, "err", "")) or "Databento sent an error message."
                retrying = not classify_terminal(message)
                enqueue(
                    build_error_event(
                        symbol,
                        message,
                        retrying,
                        ns_to_ms(getattr(record, "ts_event", None)),
                        databento_symbol,
                        resolved_symbol,
                    )
                )

                if not retrying:
                    break

                continue

            if not connected:
                connected = True
                enqueue(
                    build_status_event(
                        symbol,
                        "connected",
                        "Databento live trade stream connected.",
                        databento_symbol,
                        resolved_symbol,
                    )
                )

            if isinstance(record, TradeMsg):
                enqueue(
                    {
                        "type": "trade",
                        "symbol": symbol,
                        "price": normalise_price(
                            getattr(record, "pretty_price", None), getattr(record, "price", None)
                        ),
                        "size": coerce_int(getattr(record, "size", 0)),
                        "side": enum_code(getattr(record, "side", "")) or "N",
                        "sequence": coerce_int(getattr(record, "sequence", 0)),
                        "time": ns_to_ms(getattr(record, "ts_event", None)),
                        "meta": build_meta("trades", databento_symbol, resolved_symbol),
                    }
                )
    except Exception as error:
        message = str(error) or "Databento live trade stream failed."
        enqueue(
            build_error_event(
                symbol,
                message,
                not classify_terminal(message),
                now_ms(),
                databento_symbol,
                resolved_symbol,
            )
        )
    finally:
        client_refs["trades"] = None
        stop_live_client(client)


def stream_depth_client(
    symbol: str,
    databento_symbol: str,
    api_key: str,
    enqueue: Any,
    stop_event: threading.Event,
    client_refs: dict[str, db.Live | None],
) -> None:
    resolved_symbol: str | None = None
    for schema_index, depth_schema in enumerate(DEPTH_SCHEMAS):
        connected = False
        client: db.Live | None = None
        unauthorized = False
        mbo_book = MBOBook() if depth_schema == "mbo" else None

        try:
            client = db.Live(
                key=api_key,
                reconnect_policy=db.ReconnectPolicy.RECONNECT,
                heartbeat_interval_s=10,
            )
            client_refs["depth"] = client

            subscribe_kwargs: dict[str, Any] = {
                "dataset": DATABENTO_DATASET,
                "schema": depth_schema,
                "symbols": [databento_symbol],
                "stype_in": "continuous",
            }

            if depth_schema == "mbo":
                subscribe_kwargs["snapshot"] = True
            else:
                subscribe_kwargs["start"] = get_live_replay_start()

            client.subscribe(**subscribe_kwargs)

            for record in client:
                if stop_event.is_set():
                    return

                if isinstance(record, SymbolMappingMsg):
                    resolved = str(record.stype_out_symbol).strip()
                    resolved_symbol = resolved or None
                    enqueue(
                        build_status_event(
                            symbol,
                            "connected",
                            f"{databento_symbol} mapped to {resolved_symbol}.",
                            databento_symbol,
                            resolved_symbol,
                            schema=depth_schema,
                        )
                    )
                    continue

                if isinstance(record, SystemMsg):
                    enqueue(encode_sse_comment())

                    if not bool(getattr(record, "is_heartbeat", False)) and not connected:
                        connected = True
                        enqueue(
                            build_status_event(
                                symbol,
                                "connected",
                                get_depth_connected_message(depth_schema),
                                databento_symbol,
                                resolved_symbol,
                                schema=depth_schema,
                            )
                        )

                    continue

                if isinstance(record, ErrorMsg):
                    message = str(getattr(record, "err", "")) or "Databento sent an error message."

                    if is_depth_not_authorized(message):
                        unauthorized = True
                        break

                    retrying = not classify_terminal(message)
                    enqueue(
                        build_error_event(
                            symbol,
                            message,
                            retrying,
                            ns_to_ms(getattr(record, "ts_event", None)),
                            databento_symbol,
                            resolved_symbol,
                            schema=depth_schema,
                        )
                    )

                    if not retrying:
                        break

                    continue

                if not connected:
                    connected = True
                    enqueue(
                        build_status_event(
                            symbol,
                            "connected",
                            get_depth_connected_message(depth_schema),
                            databento_symbol,
                            resolved_symbol,
                            schema=depth_schema,
                        )
                    )

                if isinstance(record, (MBP10Msg, MBP1Msg)):
                    enqueue(
                        {
                            "type": "book",
                            "symbol": symbol,
                            "time": ns_to_ms(getattr(record, "ts_event", None)),
                            "snapshot": build_order_book_snapshot(record),
                            "meta": build_meta(depth_schema, databento_symbol, resolved_symbol),
                        }
                    )
                    continue

                if isinstance(record, MBOMsg) and mbo_book is not None:
                    mbo_book.apply(record)

                    if not getattr(record, "flags", 0) & db.RecordFlags.F_LAST:
                        continue

                    enqueue(
                        {
                            "type": "book",
                            "symbol": symbol,
                            "time": ns_to_ms(getattr(record, "ts_event", None)),
                            "snapshot": mbo_book.build_snapshot(),
                            "meta": build_meta(depth_schema, databento_symbol, resolved_symbol),
                        }
                    )
        except Exception as error:
            message = str(error) or "Databento live depth stream failed."

            if is_depth_not_authorized(message):
                unauthorized = True
            else:
                enqueue(
                    build_error_event(
                        symbol,
                        message,
                        not classify_terminal(message),
                        now_ms(),
                        databento_symbol,
                        resolved_symbol,
                        schema=depth_schema,
                    )
                )
                return
        finally:
            client_refs["depth"] = None
            stop_live_client(client)

        if not unauthorized:
            return

        has_next_schema = schema_index < len(DEPTH_SCHEMAS) - 1

        if has_next_schema:
            next_schema = DEPTH_SCHEMAS[schema_index + 1]
            enqueue(
                build_status_event(
                    symbol,
                    "reconnecting",
                    f"Databento {get_depth_schema_label(depth_schema)} unavailable. Falling back to {get_depth_schema_label(next_schema)}.",
                    databento_symbol,
                    resolved_symbol,
                    schema=next_schema,
                )
            )
            continue

        enqueue(
            build_status_event(
                symbol,
                "stopped",
                get_depth_unavailable_message(depth_schema),
                databento_symbol,
                resolved_symbol,
                schema=depth_schema,
            )
        )
        return


def stream_bbo_client(
    symbol: str,
    databento_symbol: str,
    api_key: str,
    enqueue: Any,
    stop_event: threading.Event,
    client_refs: dict[str, db.Live | None],
) -> None:
    resolved_symbol: str | None = None
    connected = False
    client: db.Live | None = None

    try:
        client = db.Live(
            key=api_key,
            reconnect_policy=db.ReconnectPolicy.RECONNECT,
            heartbeat_interval_s=10,
        )
        client_refs["bbo"] = client

        client.subscribe(
            dataset=DATABENTO_DATASET,
            schema="bbo-1s",
            symbols=[databento_symbol],
            stype_in="continuous",
            start=get_live_replay_start(),
        )

        for record in client:
            if stop_event.is_set():
                return

            if isinstance(record, SymbolMappingMsg):
                resolved = str(record.stype_out_symbol).strip()
                resolved_symbol = resolved or None
                enqueue(
                    build_status_event(
                        symbol,
                        "connected",
                        f"{databento_symbol} mapped to {resolved_symbol}.",
                        databento_symbol,
                        resolved_symbol,
                        schema="bbo-1s",
                    )
                )
                continue

            if isinstance(record, SystemMsg):
                enqueue(encode_sse_comment())

                if not bool(getattr(record, "is_heartbeat", False)) and not connected:
                    connected = True
                    enqueue(
                        build_status_event(
                            symbol,
                            "connected",
                            "Databento live top-of-book quote connected.",
                            databento_symbol,
                            resolved_symbol,
                            schema="bbo-1s",
                        )
                    )

                continue

            if isinstance(record, ErrorMsg):
                message = str(getattr(record, "err", "")) or "Databento sent an error message."
                retrying = not classify_terminal(message)
                enqueue(
                    build_error_event(
                        symbol,
                        message,
                        retrying,
                        ns_to_ms(getattr(record, "ts_event", None)),
                        databento_symbol,
                        resolved_symbol,
                        schema="bbo-1s",
                    )
                )

                if not retrying:
                    break

                continue

            if not connected:
                connected = True
                enqueue(
                    build_status_event(
                        symbol,
                        "connected",
                        "Databento live top-of-book quote connected.",
                        databento_symbol,
                        resolved_symbol,
                        schema="bbo-1s",
                    )
                )

            if isinstance(record, BBOMsg):
                enqueue(
                    {
                        "type": "book",
                        "symbol": symbol,
                        "time": ns_to_ms(getattr(record, "ts_event", None)),
                        "snapshot": build_order_book_snapshot(record),
                        "meta": build_meta("bbo-1s", databento_symbol, resolved_symbol),
                    }
                )

                last_sale = normalise_price(
                    getattr(record, "pretty_price", None), getattr(record, "price", None)
                )

                if last_sale > 0:
                    enqueue(
                        {
                            "type": "trade",
                            "symbol": symbol,
                            "price": last_sale,
                            "size": coerce_int(getattr(record, "size", 0)),
                            "side": enum_code(getattr(record, "side", "")) or "N",
                            "sequence": coerce_int(getattr(record, "sequence", 0)),
                            "time": ns_to_ms(getattr(record, "ts_event", None)),
                            "meta": build_meta("bbo-1s", databento_symbol, resolved_symbol),
                        }
                    )
    except Exception as error:
        message = str(error) or "Databento live top-of-book stream failed."
        enqueue(
            build_error_event(
                symbol,
                message,
                not classify_terminal(message),
                now_ms(),
                databento_symbol,
                resolved_symbol,
                schema="bbo-1s",
            )
        )
    finally:
        client_refs["bbo"] = None
        stop_live_client(client)


def stream_databento_worker(
    symbol: str,
    databento_symbol: str,
    output_queue: queue.Queue[bytes | dict[str, Any] | None],
    stop_event: threading.Event,
    client_refs: dict[str, db.Live | None],
) -> None:
    api_key = os.environ.get("DATABENTO_API_KEY") or os.environ.get("DATABENTO_KEY")

    def enqueue(payload: bytes | dict[str, Any] | None) -> None:
        if stop_event.is_set():
            return

        try:
            output_queue.put(payload, timeout=QUEUE_POLL_TIMEOUT_S)
        except queue.Full:
            if payload is None:
                try:
                    output_queue.put_nowait(payload)
                except queue.Full:
                    pass

    if not api_key:
        enqueue(
            build_error_event(
                symbol,
                "Missing DATABENTO_API_KEY. Add it before starting the live stream.",
                False,
                now_ms(),
                databento_symbol,
                None,
            )
        )
        enqueue(None)
        return

    enqueue(
        build_status_event(
            symbol,
            "connecting",
            "Connecting to Databento live stream...",
            databento_symbol,
            None,
        )
    )

    trades_thread = threading.Thread(
        target=stream_trades_client,
        args=(symbol, databento_symbol, api_key, enqueue, stop_event, client_refs),
        daemon=True,
    )
    depth_thread = threading.Thread(
        target=stream_depth_client,
        args=(symbol, databento_symbol, api_key, enqueue, stop_event, client_refs),
        daemon=True,
    )
    bbo_thread = threading.Thread(
        target=stream_bbo_client,
        args=(symbol, databento_symbol, api_key, enqueue, stop_event, client_refs),
        daemon=True,
    )

    trades_thread.start()
    depth_thread.start()
    bbo_thread.start()
    trades_thread.join()
    depth_thread.join()
    bbo_thread.join()

    enqueue(None)


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/futures/live")
async def futures_live(
    request: Request,
    symbol: str = Query(default="ES", min_length=1),
) -> StreamingResponse:
    normalized_symbol = symbol.upper()
    databento_symbol = FUTURES_SYMBOLS.get(normalized_symbol)

    if databento_symbol is None:
        raise HTTPException(status_code=400, detail="Unsupported futures symbol.")

    output_queue: queue.Queue[bytes | dict[str, Any] | None] = queue.Queue(maxsize=512)
    stop_event = threading.Event()
    client_refs: dict[str, db.Live | None] = {"trades": None, "depth": None, "bbo": None}
    worker = threading.Thread(
        target=stream_databento_worker,
        args=(normalized_symbol, databento_symbol, output_queue, stop_event, client_refs),
        daemon=True,
    )
    worker.start()

    async def event_stream():
        yield f"retry: {SSE_RETRY_MS}\n\n".encode("utf-8")

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    item = output_queue.get(timeout=QUEUE_POLL_TIMEOUT_S)
                except queue.Empty:
                    yield encode_sse_comment()
                    continue

                if item is None:
                    break

                if isinstance(item, bytes):
                    yield item
                    continue

                yield encode_sse_event(item)
        finally:
            stop_event.set()
            stop_live_client(client_refs.get("trades"))
            stop_live_client(client_refs.get("depth"))
            stop_live_client(client_refs.get("bbo"))
            worker.join(timeout=1.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=STREAM_HEADERS,
    )
