"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOptionChain = exports.getIndicatorsEndpoint = exports.getPivotLevelsEndpoint = exports.getOHLCBars = exports.getFuturesData = exports.getSpotPrice = exports.updateWatchlist = exports.getWatchlist = void 0;
const Watchlist_1 = require("../models/Watchlist");
const FuturesOHLC_1 = require("../models/FuturesOHLC");
const redis_1 = __importDefault(require("../config/redis"));
const shared_1 = require("@stock/shared");
const ohlcAggregator_1 = require("../services/ohlcAggregator");
const pivotService_1 = require("../services/pivotService");
// Fetch User Watchlist
const getWatchlist = async (req, res) => {
    try {
        const userId = req.user?.id;
        let list = await Watchlist_1.Watchlist.findOne({ user_id: userId });
        if (!list) {
            list = await Watchlist_1.Watchlist.create({
                user_id: userId,
                symbols_json: ["NIFTY-SPOT", "NIFTY-FUT"],
                column_prefs_json: { pivots: true, indicators: true }
            });
        }
        return res.status(200).json({
            symbols: list.symbols_json,
            columnPrefs: list.column_prefs_json
        });
    }
    catch (error) {
        console.error("Fetch Watchlist Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getWatchlist = getWatchlist;
// Update User Watchlist
const updateWatchlist = async (req, res) => {
    try {
        const userId = req.user?.id;
        const parseResult = shared_1.WatchlistSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
        }
        const { symbols, columnPrefs } = parseResult.data;
        const list = await Watchlist_1.Watchlist.findOneAndUpdate({ user_id: userId }, { symbols_json: symbols, column_prefs_json: columnPrefs || {} }, { new: true, upsert: true });
        return res.status(200).json({
            message: "Watchlist updated successfully",
            symbols: list.symbols_json,
            columnPrefs: list.column_prefs_json
        });
    }
    catch (error) {
        console.error("Update Watchlist Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.updateWatchlist = updateWatchlist;
// Get Spot Price
const getSpotPrice = async (req, res) => {
    try {
        const { symbol } = req.params;
        const price = await redis_1.default.get(`ltp:${symbol}`);
        if (!price) {
            return res.status(404).json({ error: `Price for symbol ${symbol} not found` });
        }
        return res.status(200).json({
            symbol,
            ltp: parseFloat(price),
            timestamp: new Date()
        });
    }
    catch (error) {
        console.error("Get Spot Price Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getSpotPrice = getSpotPrice;
// Get Futures LTP and current active Candle
const getFuturesData = async (req, res) => {
    try {
        const { symbol } = req.params;
        const timeframe = req.query.timeframe || "5m";
        const price = await redis_1.default.get(`ltp:${symbol}`);
        const candle = (0, ohlcAggregator_1.getActiveCandle)(symbol, timeframe);
        return res.status(200).json({
            symbol,
            ltp: price ? parseFloat(price) : 0,
            activeCandle: candle
        });
    }
    catch (error) {
        console.error("Get Futures Data Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getFuturesData = getFuturesData;
// Get completed OHLC candles from Database
const getOHLCBars = async (req, res) => {
    try {
        const { symbol, tf } = req.params;
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const bars = await FuturesOHLC_1.FuturesOHLC.find({ symbol, timeframe: tf })
            .sort({ bar_time: -1 })
            .limit(limit);
        // Return chronological order
        return res.status(200).json(bars.reverse());
    }
    catch (error) {
        console.error("Get OHLC Bars Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getOHLCBars = getOHLCBars;
// Get computed pivots (all 3 methods)
const getPivotLevelsEndpoint = async (req, res) => {
    try {
        const { symbol, tf } = req.params;
        const classic = await (0, pivotService_1.getPivotLevels)(symbol, tf, "classic");
        const camarilla = await (0, pivotService_1.getPivotLevels)(symbol, tf, "camarilla");
        const fibonacci = await (0, pivotService_1.getPivotLevels)(symbol, tf, "fibonacci");
        return res.status(200).json({
            symbol,
            timeframe: tf,
            classic,
            camarilla,
            fibonacci
        });
    }
    catch (error) {
        console.error("Get Pivot Levels Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getPivotLevelsEndpoint = getPivotLevelsEndpoint;
// Evaluate Indicators
const getIndicatorsEndpoint = async (req, res) => {
    try {
        const { symbol } = req.params;
        const timeframe = req.query.timeframe || "5m";
        const method = req.query.method || "classic";
        const indicators = await (0, pivotService_1.evaluateIndicators)(symbol, timeframe, method);
        if (!indicators) {
            return res.status(404).json({ error: "Failed to compute indicators. Make sure market feeds are running." });
        }
        return res.status(200).json(indicators);
    }
    catch (error) {
        console.error("Get Indicators Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getIndicatorsEndpoint = getIndicatorsEndpoint;
// Generate options chain based on current NIFTY spot index
const getOptionChain = async (req, res) => {
    try {
        const { index } = req.params; // e.g., "NIFTY50"
        const rawSpot = await redis_1.default.get("ltp:NIFTY-SPOT");
        const spot = rawSpot ? parseFloat(rawSpot) : 22100.0;
        // Standard strike step for NIFTY is 50 points
        const strikeStep = 50;
        const atmStrike = Math.round(spot / strikeStep) * strikeStep;
        const strikes = [];
        // Generate 5 ITM and 5 OTM strikes for both CE and PE
        for (let i = -5; i <= 5; i++) {
            const strikePrice = atmStrike + i * strikeStep;
            strikes.push({
                strikePrice,
                CE: `NIFTY${strikePrice}CE`,
                PE: `NIFTY${strikePrice}PE`
            });
        }
        return res.status(200).json({
            index,
            spotPrice: spot,
            atmStrike,
            strikes
        });
    }
    catch (error) {
        console.error("Get Option Chain Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.getOptionChain = getOptionChain;
