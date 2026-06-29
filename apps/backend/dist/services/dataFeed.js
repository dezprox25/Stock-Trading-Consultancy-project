"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processIncomingTick = exports.initDataFeed = exports.setOnTickReceived = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const ohlcAggregator_1 = require("./ohlcAggregator");
const module1OiService_1 = require("./module1OiService");
const monitoringService_1 = require("./monitoringService");
const zebuMarketDataClient_1 = require("./zebuMarketDataClient");
const zebuAuthService_1 = require("./zebuAuthService");
const atmTokenService_1 = require("./atmTokenService");
let mockInterval = null;
let isMockActive = false;
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
    zebuAuthService_1.zebuAuthService.startFeed(exports.processIncomingTick, module1OiService_1.setModule1OiDataSource, (reason) => {
        console.log(`[Module1/Zebu] Falling back to simulator: ${reason}`);
        startMockGenerator();
    });
};
/**
 * Handles caching and candle aggregation for each tick
 */
const processIncomingTick = async (tick) => {
    const { symbol, ltp, oi } = tick;
    // Track tick freshness
    (0, monitoringService_1.recordTickReceived)();
    // 1. Cache latest price in Redis
    await redis_1.default.set(`ltp:${symbol}`, ltp.toString());
    if ((symbol === "NIFTY-SPOT" || symbol === "Nifty 50") && (0, atmTokenService_1.isDynamicAtmEnabled)()) {
        const prevGroup = (0, atmTokenService_1.getActiveSubscriptionGroup)()
            ? { ...(0, atmTokenService_1.getActiveSubscriptionGroup)(), subscriptionList: [...(0, atmTokenService_1.getActiveSubscriptionGroup)().subscriptionList] }
            : null;
        const newGroup = (0, atmTokenService_1.updateATMStrikeFromPrice)(ltp);
        if (newGroup && prevGroup && newGroup.subscriptionList.join("#") !== prevGroup.subscriptionList.join("#")) {
            console.log(`[ATM] Subscription list updated due to NIFTY-SPOT tick price ${ltp}. Resubscribing...`);
            (0, zebuMarketDataClient_1.resubscribeMarketData)(newGroup, prevGroup);
        }
    }
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
    console.log("[DataFeed] Simulator disabled by request. No mock ticks will be generated.");
};
