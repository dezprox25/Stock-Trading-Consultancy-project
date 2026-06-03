import { FuturesOHLC } from "../models/FuturesOHLC";
import { Tick, Candle } from "@stock/shared";

// Local cache for active candles: activeCandles[symbol][timeframe]
const activeCandles: Record<string, Record<string, Candle>> = {};

// Callback to trigger pivot calculations when a candle is finalized
type CandleFinalizedCallback = (candle: Candle) => Promise<void> | void;
let onCandleFinalized: CandleFinalizedCallback | null = null;

export const setOnCandleFinalized = (callback: CandleFinalizedCallback) => {
  onCandleFinalized = callback;
};

/**
 * Normalizes time boundary based on timeframe in minutes
 */
export const getBoundaryTime = (timestamp: Date, timeframeMinutes: number): number => {
  const timeMs = timestamp.getTime();
  const timeframeMs = timeframeMinutes * 60000;
  return Math.floor(timeMs / timeframeMs) * timeframeMs;
};

/**
 * Aggregates a raw tick into the corresponding timeframe candles for that symbol
 */
export const aggregateOHLC = async (tick: Tick, timeframeMinutes: number, timeframeStr: string): Promise<Candle> => {
  const { symbol, ltp, timestamp, volume = 0 } = tick;
  
  if (!activeCandles[symbol]) {
    activeCandles[symbol] = {};
  }

  const boundary = getBoundaryTime(timestamp, timeframeMinutes);
  let candle = activeCandles[symbol][timeframeStr];

  if (!candle || candle.openTime < boundary) {
    // If there is an existing active candle, it has crossed the timeframe boundary, so finalize it.
    if (candle) {
      await finaliseCandle(candle);
    }

    // Initialize new candle
    candle = {
      symbol,
      timeframe: timeframeStr,
      open: ltp,
      high: ltp,
      low: ltp,
      close: ltp,
      openTime: boundary,
      volume,
    };
  } else {
    // Update existing active candle
    candle.high = Math.max(candle.high, ltp);
    candle.low = Math.min(candle.low, ltp);
    candle.close = ltp;
    candle.volume += volume;
  }

  activeCandles[symbol][timeframeStr] = candle;
  return candle;
};

/**
 * Saves finalized candle to MongoDB and triggers callback
 */
const finaliseCandle = async (candle: Candle) => {
  try {
    await FuturesOHLC.create({
      symbol: candle.symbol,
      timeframe: candle.timeframe,
      bar_open: candle.open,
      bar_high: candle.high,
      bar_low: candle.low,
      bar_close: candle.close,
      bar_time: new Date(candle.openTime),
      volume: candle.volume,
    });

    console.log(`[OHLC] Finalized ${candle.timeframe} candle for ${candle.symbol} at ${new Date(candle.openTime).toISOString()}`);

    if (onCandleFinalized) {
      await onCandleFinalized(candle);
    }
  } catch (error) {
    console.error("Failed to finalize candle in database:", error);
  }
};

/**
 * Gets the current active candle for a symbol and timeframe
 */
export const getActiveCandle = (symbol: string, timeframeStr: string): Candle | null => {
  return activeCandles[symbol]?.[timeframeStr] || null;
};
