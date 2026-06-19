"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processIncomingTick = exports.initDataFeed = exports.setOnTickReceived = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const ohlcAggregator_1 = require("./ohlcAggregator");
const module1OiService_1 = require("./module1OiService");
const zebuMarketDataClient_1 = require("./zebuMarketDataClient");
let reconnectTimeout = null;
let mockInterval = null;
let isMockActive = false;
let zebuClient = null;
let onTickReceived = null;
const setOnTickReceived = (callback) => {
    onTickReceived = callback;
};
exports.setOnTickReceived = setOnTickReceived;
/**
 * Initializes the data feed connection
 */
const initDataFeed = () => {
    if ((0, zebuMarketDataClient_1.isZebuMarketDataConfigured)()) {
        console.log("[DataFeed] Using LIVE MARKET DATA API");
        connectToZebuMarketData();
    }
    else {
        console.log("[DataFeed] Using INTERNAL SIMULATOR");
        console.log(`[Module1/Zebu] Falling back to simulator: missing ${(0, zebuMarketDataClient_1.getZebuMissingConfig)().join(", ")}`);
        startMockGenerator();
    }
};
exports.initDataFeed = initDataFeed;
/**
 * Connects to the Zebu MYNT / Zebu Trade market data stream.
 */
const connectToZebuMarketData = () => {
    if (reconnectTimeout)
        clearTimeout(reconnectTimeout);
    zebuClient = (0, zebuMarketDataClient_1.startZebuMarketDataFeed)(exports.processIncomingTick, module1OiService_1.setModule1OiDataSource, (reason) => {
        console.log(`[Module1/Zebu] Falling back to simulator: ${reason}`);
        zebuClient = null;
        startMockGenerator();
        reconnectTimeout = setTimeout(connectToZebuMarketData, 3000);
    });
};
/**
 * Handles caching and candle aggregation for each tick
 */
const processIncomingTick = async (tick) => {
    const { symbol, ltp, oi } = tick;
    // 1. Cache latest price in Redis
    await redis_1.default.set(`ltp:${symbol}`, ltp.toString());
    // 2. Cache latest open interest in Redis if present
    if (oi !== undefined) {
        await redis_1.default.set(`oi:${symbol}`, oi.toString());
    }
    (0, module1OiService_1.ingestModule1OiTick)(tick);
    // 3. Aggregate OHLC candles for Futures contract (only futures feed pivot levels)
    if (symbol.endsWith("-FUT") || symbol.includes("FUT")) {
        await (0, ohlcAggregator_1.aggregateOHLC)(tick, 1, "1m");
        await (0, ohlcAggregator_1.aggregateOHLC)(tick, 3, "3m");
        await (0, ohlcAggregator_1.aggregateOHLC)(tick, 5, "5m");
        // Dynamically aggregate custom timeframe
        try {
            const customTf = await redis_1.default.get("config:custom_timeframe");
            if (customTf && customTf.endsWith("m")) {
                const minutes = parseInt(customTf);
                if (minutes > 0 && minutes !== 1 && minutes !== 3 && minutes !== 5) {
                    await (0, ohlcAggregator_1.aggregateOHLC)(tick, minutes, customTf);
                }
            }
        }
        catch (err) {
            // ignore Redis read errors in offline mode
        }
    }
    // 4. Forward tick to live websocket broadcaster callback
    if (onTickReceived) {
        onTickReceived(tick);
    }
};
exports.processIncomingTick = processIncomingTick;
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
    if (isMockActive)
        return;
    isMockActive = true;
    (0, module1OiService_1.setModule1OiDataSource)("SIMULATOR");
    console.log("[DataFeed] Activated market simulator. Publishing ticks with OI data every 1000ms.");
    let spotPrice = 22100.0;
    let futPrice = 22135.0;
    let futOI = 12000000;
    // Option strike baselines
    const strikes = [];
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
        await (0, exports.processIncomingTick)({
            symbol: "NIFTY-SPOT",
            ltp: spotPrice,
            timestamp,
            volume: Math.floor(Math.random() * 200)
        });
        // 2. Publish Futures Tick
        await (0, exports.processIncomingTick)({
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
            await (0, exports.processIncomingTick)({
                symbol: strike.symbol,
                ltp,
                timestamp,
                volume: Math.floor(Math.random() * 100),
                oi
            });
        }
    }, 1000);
};
