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
    console.log("[DataFeed] Running in development mode. Starting internal market simulator...");
    startMockGenerator();
  } else {
    connectToClientAPI();
  }
};

/**
 * Connects to the external Client API WebSocket stream
 */
const connectToClientAPI = () => {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  console.log(`[DataFeed] Connecting to external client feed at: ${CLIENT_API_URL}`);
  
  ws = new WebSocket(CLIENT_API_URL);

  ws.on("open", () => {
    console.log("[DataFeed] Connected to client data feed successfully.");
    // If mock was running, disable it
    stopMockGenerator();
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
      };

      await processIncomingTick(tick);
    } catch (err) {
      console.error("[DataFeed] Error parsing stream tick:", err);
    }
  });

  ws.on("close", () => {
    console.log("[DataFeed] Connection closed. Attempting reconnect in 3 seconds...");
    // If connection drops, start mock generator in background so app remains active,
    // and schedule reconnect.
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
  const { symbol, ltp } = tick;
  
  // 1. Cache latest price in Redis
  await redis.set(`ltp:${symbol}`, ltp.toString());

  // 2. Aggregate OHLC candles for Futures contract (only futures feed pivot levels)
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

  // 3. Forward tick to live websocket broadcaster callback
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
    isMockActive = false;
    console.log("[DataFeed] Deactivated market simulator.");
  }
};

/**
 * Simulator generator for development testing
 * Simulates active NIFTY Spot, Futures and standard options strikes
 */
const startMockGenerator = () => {
  if (isMockActive) return;
  isMockActive = true;
  console.log("[DataFeed] Activated market simulator. Publishing ticks every 1000ms.");

  let spotPrice = 22100.0;
  let futPrice = 22135.0;

  // Option strike baselines
  const strikes: Array<{ symbol: string; base: number }> = [];
  const startStrike = 21700;
  const endStrike = 22500;
  const step = 50;

  for (let s = startStrike; s <= endStrike; s += step) {
    const ceOffset = (22100 - s) * 0.8;
    const ceBase = Math.max(5, 85 + ceOffset);

    const peOffset = (s - 22100) * 0.8;
    const peBase = Math.max(5, 85 + peOffset);

    strikes.push({ symbol: `NIFTY${s}CE`, base: ceBase });
    strikes.push({ symbol: `NIFTY${s}PE`, base: peBase });
  }

  mockInterval = setInterval(async () => {
    const timestamp = new Date();
    
    // Simulate Spot drift
    const spotChange = (Math.random() - 0.5) * 5;
    spotPrice = Number((spotPrice + spotChange).toFixed(2));

    // Simulate Futures with drift (occasionally spike divergence above 0.5% for alerts)
    const divergenceSpike = Math.random() > 0.95 ? 120.0 : 0.0;
    futPrice = Number((spotPrice + 35 + (Math.random() - 0.5) * 2 + divergenceSpike).toFixed(2));

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
      volume: Math.floor(Math.random() * 500)
    });

    // 3. Publish Strike Ticks
    for (const strike of strikes) {
      // Premium fluctuates relative to Spot
      const drift = (Math.random() - 0.5) * 2;
      const spotOffset = (spotPrice - 22100.0) * (strike.symbol.endsWith("CE") ? 0.5 : -0.5);
      const ltp = Math.max(1, Number((strike.base + spotOffset + drift).toFixed(2)));

      await processIncomingTick({
        symbol: strike.symbol,
        ltp,
        timestamp,
        volume: Math.floor(Math.random() * 100)
      });
    }
  }, 1000);
};
