import WebSocket from "ws";
import redis from "../config/redis";
import { aggregateOHLC } from "./ohlcAggregator";
import { Tick } from "@stock/shared";

const CLIENT_API_URL = process.env.CLIENT_API_URL || "ws://127.0.0.1:5000/mock-feed";
let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let mockInterval: NodeJS.Timeout | null = null;
let isMockActive = false;

// Callbacks for broadcasting ticks and updates to client connections
type TickCallback = (tick: Tick) => void;
let onTickReceived: TickCallback | null = null;

export const setOnTickReceived = (callback: TickCallback) => {
  onTickReceived = callback;
};

/**
 * Initializes the data feed connection
 */
export const initDataFeed = () => {
  if (process.env.NODE_ENV === "development" || !process.env.CLIENT_API_URL) {
    console.log("[DataFeed] Running in development mode or CLIENT_API_URL missing. Starting internal market simulator...");
    startMockGenerator();
  } else {
    console.log("[DataFeed] Connecting to external client feed...");
    connectToClientAPI();
  }
};

/**
 * Connects to the external Client API WebSocket stream
 */
const connectToClientAPI = () => {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  let urlString = CLIENT_API_URL;
  try {
    const urlObj = new URL(CLIENT_API_URL);
    if (process.env.MOD1_API_KEY) {
      urlObj.searchParams.set("mod1_api_key", process.env.MOD1_API_KEY);
      urlObj.searchParams.set("apiKey", process.env.MOD1_API_KEY);
      urlObj.searchParams.set("api_key", process.env.MOD1_API_KEY);
      urlObj.searchParams.set("key", process.env.MOD1_API_KEY);
    }
    if (process.env.MOD1_API_SECRET) {
      urlObj.searchParams.set("mod1_api_secret", process.env.MOD1_API_SECRET);
      urlObj.searchParams.set("apiSecret", process.env.MOD1_API_SECRET);
      urlObj.searchParams.set("api_secret", process.env.MOD1_API_SECRET);
      urlObj.searchParams.set("secret", process.env.MOD1_API_SECRET);
    }
    if (process.env.MOD2_API_KEY) {
      urlObj.searchParams.set("mod2_api_key", process.env.MOD2_API_KEY);
      urlObj.searchParams.set("mod2Key", process.env.MOD2_API_KEY);
      urlObj.searchParams.set("mod2_key", process.env.MOD2_API_KEY);
    }
    if (process.env.MOD2_API_SECRET) {
      urlObj.searchParams.set("mod2_api_secret", process.env.MOD2_API_SECRET);
      urlObj.searchParams.set("mod2Secret", process.env.MOD2_API_SECRET);
      urlObj.searchParams.set("mod2_secret", process.env.MOD2_API_SECRET);
    }
    urlString = urlObj.toString();
  } catch (e) {
    // Fallback if CLIENT_API_URL is not a standard URL
  }

  console.log(`[DataFeed] Connecting to external client feed at: ${CLIENT_API_URL}`);
  
  const headers: Record<string, string> = {};
  if (process.env.MOD1_API_KEY) {
    headers["x-api-key"] = process.env.MOD1_API_KEY;
    headers["x-mod1-api-key"] = process.env.MOD1_API_KEY;
  }
  if (process.env.MOD1_API_SECRET) {
    headers["x-api-secret"] = process.env.MOD1_API_SECRET;
    headers["x-mod1-api-secret"] = process.env.MOD1_API_SECRET;
  }
  if (process.env.MOD2_API_KEY) {
    headers["x-mod2-api-key"] = process.env.MOD2_API_KEY;
  }
  if (process.env.MOD2_API_SECRET) {
    headers["x-mod2-api-secret"] = process.env.MOD2_API_SECRET;
  }

  ws = new WebSocket(urlString, { headers });

  ws.on("open", () => {
    console.log("[DataFeed] Connected to client data feed successfully.");
    // Deactivate simulator since external feed is connected
    stopMockGenerator();
    
    // Also send credentials as a JSON message on connect just in case
    try {
      const authMessage = JSON.stringify({
        type: "auth",
        action: "auth",
        apiKey: process.env.MOD1_API_KEY,
        apiSecret: process.env.MOD1_API_SECRET,
        mod1_api_key: process.env.MOD1_API_KEY,
        mod1_api_secret: process.env.MOD1_API_SECRET,
        mod2_api_key: process.env.MOD2_API_KEY,
        mod2_api_secret: process.env.MOD2_API_SECRET,
      });
      ws?.send(authMessage);
    } catch (sendErr) {
      console.warn("[DataFeed] Failed to send initial auth message:", sendErr);
    }
  });

  ws.on("message", async (raw: string) => {
    try {
      const tickData = JSON.parse(raw);
      
      // Normalize raw tick data
      const tick: Tick = {
        symbol: tickData.symbol,
        ltp: Number(tickData.ltp),
        timestamp: tickData.timestamp ? new Date(tickData.timestamp) : new Date(),
        volume: tickData.volume ? Number(tickData.volume) : 0,
        oi: tickData.oi !== undefined ? Number(tickData.oi) : undefined,
      };

      await processIncomingTick(tick);
    } catch (err) {
      console.error("[DataFeed] Error parsing stream tick:", err);
    }
  });

  ws.on("close", () => {
    console.log("[DataFeed] Connection closed. Attempting reconnect in 3 seconds. Starting internal market simulator as backup...");
    startMockGenerator();
    reconnectTimeout = setTimeout(connectToClientAPI, 3000);
  });

  ws.on("error", (error) => {
    console.error("[DataFeed] WebSocket client error:", error);
    ws?.close();
  });
};

/**
 * Handles caching and candle aggregation for each tick
 */
export const processIncomingTick = async (tick: Tick) => {
  const { symbol, ltp, oi } = tick;
  
  // 1. Cache latest price in Redis
  await redis.set(`ltp:${symbol}`, ltp.toString());
  
  // 2. Cache latest open interest in Redis if present
  if (oi !== undefined) {
    await redis.set(`oi:${symbol}`, oi.toString());
  }

  // 3. Aggregate OHLC candles for Futures contract (only futures feed pivot levels)
  if (symbol.endsWith("-FUT") || symbol.includes("FUT")) {
    await aggregateOHLC(tick, 1, "1m");
    await aggregateOHLC(tick, 3, "3m");
    await aggregateOHLC(tick, 5, "5m");

    // Dynamically aggregate custom timeframe
    try {
      const customTf = await redis.get("config:custom_timeframe");
      if (customTf && customTf.endsWith("m")) {
        const minutes = parseInt(customTf);
        if (minutes > 0 && minutes !== 1 && minutes !== 3 && minutes !== 5) {
          await aggregateOHLC(tick, minutes, customTf);
        }
      }
    } catch (err) {
      // ignore Redis read errors in offline mode
    }
  }

  // 4. Forward tick to live websocket broadcaster callback
  if (onTickReceived) {
    onTickReceived(tick);
  }
};

/**
 * Stop simulator generator
 */
const stopMockGenerator = () => {
  if (isMockActive && mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
    isMockActive = false;
    console.log("[DataFeed] Deactivated market simulator.");
  }
};

/**
 * Simulator generator for development testing
 * Simulates active Spot, Futures, and standard options strikes with Open Interest (OI)
 */
const startMockGenerator = () => {
  if (isMockActive) return;
  isMockActive = true;
  console.log("[DataFeed] Activated market simulator. Publishing ticks with OI data every 1000ms.");

  let spotPrice = 22100.0;
  let futPrice = 22135.0;
  let futOI = 12000000;

  // Option strike baselines
  const strikes: Array<{ symbol: string; base: number; baseOI: number }> = [];
  const startStrike = 21700;
  const endStrike = 22500;
  const step = 50;

  for (let s = startStrike; s <= endStrike; s += step) {
    const ceOffset = (22100 - s) * 0.8;
    const ceBase = Math.max(5, 85 + ceOffset);
    const ceBaseOI = Math.max(20000, 1000000 - ceOffset * 2000);

    const peOffset = (s - 22100) * 0.8;
    const peBase = Math.max(5, 85 + peOffset);
    const peBaseOI = Math.max(20000, 1000000 - peOffset * 2000);

    strikes.push({ symbol: `NIFTY${s}CE`, base: ceBase, baseOI: ceBaseOI });
    strikes.push({ symbol: `NIFTY${s}PE`, base: peBase, baseOI: peBaseOI });
  }

  mockInterval = setInterval(async () => {
    const timestamp = new Date();

    // Simulate Spot drift
    const spotChange = (Math.random() - 0.5) * 5;
    spotPrice = Number((spotPrice + spotChange).toFixed(2));

    // Simulate Futures with drift
    const divergenceSpike = Math.random() > 0.95 ? 120.0 : 0.0;
    futPrice = Number((spotPrice + 35 + (Math.random() - 0.5) * 2 + divergenceSpike).toFixed(2));

    // Simulate Futures OI drift
    const futOiChange = Math.round((Math.random() - 0.5) * 30000);
    futOI = Math.max(5000000, futOI + futOiChange);

    // 1. Publish Spot Tick
    await processIncomingTick({
      symbol: "NIFTY-SPOT",
      ltp: spotPrice,
      timestamp,
      volume: Math.floor(Math.random() * 200)
    });

    // 2. Publish Futures Tick
    await processIncomingTick({
      symbol: "NIFTY-FUT",
      ltp: futPrice,
      timestamp,
      volume: Math.floor(Math.random() * 500),
      oi: futOI
    });

    // 3. Publish Strike Ticks
    for (const strike of strikes) {
      // Premium fluctuates relative to Spot
      const drift = (Math.random() - 0.5) * 2;
      const optionType = strike.symbol.endsWith("CE") ? "CE" : "PE";
      const spotOffset = (spotPrice - 22100.0) * (optionType === "CE" ? 0.5 : -0.5);
      const ltp = Math.max(1, Number((strike.base + spotOffset + drift).toFixed(2)));

      // Simulate option OI: moves dynamically with spot offsets
      const oiDrift = (Math.random() - 0.5) * 8000;
      const oiOffset = spotOffset * 3000;
      const oi = Math.max(10000, Math.round(strike.baseOI + oiOffset + oiDrift));

      await processIncomingTick({
        symbol: strike.symbol,
        ltp,
        timestamp,
        volume: Math.floor(Math.random() * 100),
        oi
      });
    }
  }, 1000);
};
