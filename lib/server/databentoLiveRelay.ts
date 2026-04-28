import { spawn } from "child_process";
import path from "path";
import readline from "readline";
import type {
  DatabentoLiveEvent,
  DatabentoLiveMeta,
  DatabentoLiveStatusEvent
} from "../databentoLive";
import { DATABENTO_DATASET } from "../databentoLive";
import type { FutureAsset } from "../futuresCatalog";
import { upsertStoredCandle } from "./assetCandleStore";

type DatabentoLiveListener = (event: DatabentoLiveEvent) => void;

type DatabentoLiveCandleBridgeEvent = {
  type: "candle";
  symbol: string;
  timeframe: "1m";
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  meta: DatabentoLiveMeta;
};

type DatabentoLiveBridgeEvent = DatabentoLiveEvent | DatabentoLiveCandleBridgeEvent;

const SESSION_IDLE_SHUTDOWN_MS = 15_000;
const SESSION_RESTART_DELAY_MS = 1_500;
const TERMINAL_ERROR_PATTERNS = [
  /invalid api key/i,
  /unauthorized/i,
  /authentication/i,
  /\b401\b/,
  /\b403\b/,
  /not entitled/i,
  /license/i,
  /permission/i,
  /subscription plan/i
];

const getDefaultMeta = (asset: FutureAsset, schema: string): DatabentoLiveMeta => ({
  provider: "Databento Live",
  dataset: DATABENTO_DATASET,
  schema,
  databentoSymbol: asset.databentoSymbol,
  updatedAt: new Date().toISOString()
});

const isTerminalDatabentoError = (message: string): boolean => {
  return TERMINAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

class DatabentoLiveSession {
  private readonly asset: FutureAsset;
  private readonly listeners = new Set<DatabentoLiveListener>();
  private child: ReturnType<typeof spawn> | null = null;
  private stdoutReader: readline.Interface | null = null;
  private stderrReader: readline.Interface | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private latestStatus: DatabentoLiveStatusEvent | null = null;
  private latestTrade: DatabentoLiveEvent | null = null;
  private latestBook: DatabentoLiveEvent | null = null;
  private lastStderrLine = "";
  private stopRequested = false;
  private terminalFailure = false;
  private hasSeenData = false;

  constructor(asset: FutureAsset) {
    this.asset = asset;
  }

  subscribe(listener: DatabentoLiveListener): () => void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.listeners.add(listener);

    if (this.latestStatus) {
      listener(this.latestStatus);
    }

    if (this.latestBook) {
      listener(this.latestBook);
    }

    if (this.latestTrade) {
      listener(this.latestTrade);
    }

    this.ensureRunning();

    return () => {
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        this.scheduleIdleShutdown();
      }
    };
  }

  private ensureRunning() {
    if (this.child || this.restartTimer) {
      return;
    }

    const apiKey = process.env.DATABENTO_API_KEY || process.env.DATABENTO_KEY;

    if (!apiKey) {
      this.terminalFailure = true;
      this.broadcast({
        type: "error",
        symbol: this.asset.symbol,
        message: "Missing DATABENTO_API_KEY. Add it to your environment before starting the live feed.",
        retrying: false,
        time: Date.now(),
        meta: getDefaultMeta(this.asset, "trades")
      });
      this.broadcastStatus("stopped", "Databento live feed is waiting for an API key.");
      return;
    }

    const scriptPath = path.join(process.cwd(), "scripts", "databento_live_bridge.py");
    const pythonExecutable =
      process.env.PYTHON_EXECUTABLE || process.env.PYTHON || "python";

    this.stopRequested = false;
    this.terminalFailure = false;
    this.hasSeenData = false;
    this.lastStderrLine = "";
    this.broadcastStatus("opening", "Starting Databento live bridge...");

    const child = spawn(
      pythonExecutable,
      [
        scriptPath,
        "--symbol",
        this.asset.symbol,
        "--databento-symbol",
        this.asset.databentoSymbol,
        "--dataset",
        DATABENTO_DATASET
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABENTO_API_KEY: apiKey
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );

    if (!child.stdout || !child.stderr) {
      this.terminalFailure = true;
      this.broadcast({
        type: "error",
        symbol: this.asset.symbol,
        message: "Failed to open stdout/stderr for the Databento live bridge.",
        retrying: false,
        time: Date.now(),
        meta: getDefaultMeta(this.asset, "trades")
      });
      return;
    }

    this.child = child;

    const stdoutReader = readline.createInterface({
      input: child.stdout
    });
    const stderrReader = readline.createInterface({
      input: child.stderr
    });

    this.stdoutReader = stdoutReader;
    this.stderrReader = stderrReader;

    child.once("spawn", () => {
      this.broadcastStatus("connecting", "Connecting to Databento live stream...");
    });

    child.once("error", (error) => {
      const message = error.message || "Failed to launch the Databento live bridge.";
      this.terminalFailure = isTerminalDatabentoError(message);
      this.broadcast({
        type: "error",
        symbol: this.asset.symbol,
        message,
        retrying: !this.terminalFailure,
        time: Date.now(),
        meta: getDefaultMeta(this.asset, "trades")
      });
    });

    child.once("exit", (code, signal) => {
      this.handleExit(code, signal);
    });

    stdoutReader.on("line", (line) => {
      this.handleStdoutLine(line);
    });

    stderrReader.on("line", (line) => {
      this.lastStderrLine = line.trim();
      if (this.lastStderrLine) {
        console.error(`[databento-live:${this.asset.symbol}] ${this.lastStderrLine}`);
      }
    });
  }

  private handleStdoutLine(rawLine: string) {
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    try {
      const event = JSON.parse(line) as DatabentoLiveBridgeEvent;

      if (event.type === "candle") {
        this.persistCandle(event);
        return;
      }

      this.hasSeenData =
        this.hasSeenData || event.type === "trade" || event.type === "book";

      if (event.type === "status") {
        this.latestStatus = event;
      } else if (event.type === "trade") {
        this.latestTrade = event;
      } else if (event.type === "book") {
        this.latestBook = event;
      } else if (event.type === "error") {
        this.terminalFailure = !event.retrying;
      }

      this.broadcast(event);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Received malformed Databento live payload.";
      this.broadcast({
        type: "error",
        symbol: this.asset.symbol,
        message,
        retrying: false,
        time: Date.now(),
        meta: getDefaultMeta(this.asset, "trades")
      });
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null) {
    const exitSummary = this.lastStderrLine || `Process exited with code ${code ?? "null"}.`;

    this.stdoutReader?.close();
    this.stderrReader?.close();
    this.stdoutReader = null;
    this.stderrReader = null;
    this.child = null;

    if (this.stopRequested) {
      this.broadcastStatus("stopped", "Databento live bridge stopped.");
      return;
    }

    if (this.listeners.size === 0) {
      return;
    }

    const retrying = !this.terminalFailure;

    this.broadcast({
      type: "error",
      symbol: this.asset.symbol,
      message:
        signal === "SIGTERM"
          ? "Databento live bridge was terminated."
          : `Databento live bridge stopped: ${exitSummary}`,
      retrying,
      time: Date.now(),
      meta: getDefaultMeta(this.asset, "trades")
    });

    if (!retrying) {
      this.broadcastStatus("stopped", "Databento live bridge needs manual attention.");
      return;
    }

    this.broadcastStatus("reconnecting", "Reconnecting to Databento live stream...");
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.ensureRunning();
    }, SESSION_RESTART_DELAY_MS);
  }

  private broadcastStatus(
    state: DatabentoLiveStatusEvent["state"],
    message: string
  ) {
    const statusEvent: DatabentoLiveStatusEvent = {
      type: "status",
      symbol: this.asset.symbol,
      state,
      message,
      time: Date.now(),
      meta: getDefaultMeta(this.asset, "trades")
    };
    this.latestStatus = statusEvent;
    this.broadcast(statusEvent);
  }

  private broadcast(event: DatabentoLiveEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(
          `[databento-live:${this.asset.symbol}] listener failure`,
          error instanceof Error ? error.message : error
        );
      }
    });
  }

  private persistCandle(event: DatabentoLiveCandleBridgeEvent) {
    void upsertStoredCandle(
      this.asset,
      event.timeframe,
      {
        time: event.time,
        open: event.open,
        high: event.high,
        low: event.low,
        close: event.close,
        ...(typeof event.volume === "number" ? { volume: event.volume } : {})
      },
      {
        ...event.meta,
        provider: "Databento Live",
        sourceTimeframe: event.timeframe
      }
    ).catch((error) => {
      console.error(
        `[databento-live:${this.asset.symbol}] Firestore candle write failed`,
        error instanceof Error ? error.message : error
      );
    });
  }

  private scheduleIdleShutdown() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.stop();
    }, SESSION_IDLE_SHUTDOWN_MS);
  }

  private stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (!this.child) {
      return;
    }

    this.stopRequested = true;
    this.child.kill();
  }
}

class DatabentoLiveRelay {
  private readonly sessions = new Map<string, DatabentoLiveSession>();

  subscribe(asset: FutureAsset, listener: DatabentoLiveListener): () => void {
    let session = this.sessions.get(asset.symbol);

    if (!session) {
      session = new DatabentoLiveSession(asset);
      this.sessions.set(asset.symbol, session);
    }

    return session.subscribe(listener);
  }
}

const globalForDatabentoLiveRelay = globalThis as typeof globalThis & {
  __romanDatabentoLiveRelay?: DatabentoLiveRelay;
};

export const databentoLiveRelay =
  globalForDatabentoLiveRelay.__romanDatabentoLiveRelay ??
  new DatabentoLiveRelay();

if (!globalForDatabentoLiveRelay.__romanDatabentoLiveRelay) {
  globalForDatabentoLiveRelay.__romanDatabentoLiveRelay = databentoLiveRelay;
}
