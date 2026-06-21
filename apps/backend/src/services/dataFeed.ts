import redis from "../config/redis";
import { aggregateOHLC } from "./ohlcAggregator";
import { Tick } from "@stock/shared";
import { ingestModule1OiTick, setModule1OiDataSource } from "./module1OiService";
import { getZebuMissingConfig, isZebuMarketDataConfigured, startZebuMarketDataFeed } from "./zebuMarketDataClient";

let reconnectTimeout: NodeJS.Timeout | null = null;
let mockInterval: NodeJS.Timeout | null = null;
let isMockActive = false;
let zebuClient: { close: () => void } | null = null;

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
  if (isZebuMarketDataConfigured()) {
    console.log("[DataFeed] Using LIVE MARKET DATA API");
    connectToZebuMarketData();
  } else {
    console.log("[DataFeed] Using INTERNAL SIMULATOR");
    console.log(`[Module1/Zebu] Falling back to simulator: missing ${getZebuMissingConfig().join(", ")}`);
    startMockGenerator();
  }
};

/**
 * Connects to the Zebu MYNT / Zebu Trade market data stream.
 */
const connectToZebuMarketData = () => {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  zebuClient = startZebuMarketDataFeed(
    processIncomingTick,
    setModule1OiDataSource,
    (reason) => {
      console.log(`[Module1/Zebu] Falling back to simulator: ${reason}`);
      zebuClient = null;
      startMockGenerator();
      reconnectTimeout = setTimeout(connectToZebuMarketData, 3000);
    },
  );
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

  ingestModule1OiTick(tick);

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
  setModule1OiDataSource("SIMULATOR");
  console.log("[DataFeed] Simulator disabled by request. No mock ticks will be generated.");
};
