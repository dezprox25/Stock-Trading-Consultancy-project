"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveCandle = exports.aggregateOHLC = exports.getBoundaryTime = exports.setOnCandleFinalized = void 0;
const FuturesOHLC_1 = require("../models/FuturesOHLC");
// Local cache for active candles: activeCandles[symbol][timeframe]
const activeCandles = {};
let onCandleFinalized = null;
const setOnCandleFinalized = (callback) => {
    onCandleFinalized = callback;
};
exports.setOnCandleFinalized = setOnCandleFinalized;
/**
 * Normalizes time boundary based on timeframe in minutes
 */
const getBoundaryTime = (timestamp, timeframeMinutes) => {
    const timeMs = timestamp.getTime();
    const timeframeMs = timeframeMinutes * 60000;
    return Math.floor(timeMs / timeframeMs) * timeframeMs;
};
exports.getBoundaryTime = getBoundaryTime;
/**
 * Aggregates a raw tick into the corresponding timeframe candles for that symbol
 */
const aggregateOHLC = async (tick, timeframeMinutes, timeframeStr) => {
    const { symbol, ltp, timestamp, volume = 0 } = tick;
    if (!activeCandles[symbol]) {
        activeCandles[symbol] = {};
    }
    const boundary = (0, exports.getBoundaryTime)(timestamp, timeframeMinutes);
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
    }
    else {
        // Update existing active candle
        candle.high = Math.max(candle.high, ltp);
        candle.low = Math.min(candle.low, ltp);
        candle.close = ltp;
        candle.volume += volume;
    }
    activeCandles[symbol][timeframeStr] = candle;
    return candle;
};
exports.aggregateOHLC = aggregateOHLC;
/**
 * Saves finalized candle to MongoDB and triggers callback
 */
const finaliseCandle = async (candle) => {
    try {
        await FuturesOHLC_1.FuturesOHLC.create({
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
    }
    catch (error) {
        console.error("Failed to finalize candle in database:", error);
    }
};
/**
 * Gets the current active candle for a symbol and timeframe
 */
const getActiveCandle = (symbol, timeframeStr) => {
    return activeCandles[symbol]?.[timeframeStr] || null;
};
exports.getActiveCandle = getActiveCandle;
