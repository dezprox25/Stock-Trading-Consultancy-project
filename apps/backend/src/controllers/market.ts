import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { Watchlist } from "../models/Watchlist";
import { FuturesOHLC } from "../models/FuturesOHLC";
import redis from "../config/redis";
import { WatchlistSchema, Module1ConfigSchema } from "@stock/shared";
import { getActiveCandle } from "../services/ohlcAggregator";
import { getPivotLevels, evaluateIndicators } from "../services/pivotService";

// Local in-memory watchlists store for when MongoDB is offline
const inMemoryWatchlists = new Map<string, { symbols: string[]; columnPrefs: any }>();

// Seed default watchlists for guest users
inMemoryWatchlists.set("60c72b2f9b1d8a0015f8e567", {
  symbols: ["NIFTY-SPOT", "NIFTY-FUT"],
  columnPrefs: { pivots: true, indicators: true }
});

// Fetch User Watchlist
export const getWatchlist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let symbols = ["NIFTY-SPOT", "NIFTY-FUT"];
    let columnPrefs = { pivots: true, indicators: true };

    try {
      let list = await Watchlist.findOne({ user_id: userId });
      if (!list) {
        list = await Watchlist.create({
          user_id: userId,
          symbols_json: symbols,
          column_prefs_json: columnPrefs
        });
      }
      symbols = list.symbols_json;
      columnPrefs = list.column_prefs_json;
    } catch (err) {
      console.warn("[Market] MongoDB offline. Loading watchlist from in-memory cache.");
      if (!inMemoryWatchlists.has(userId)) {
        inMemoryWatchlists.set(userId, { symbols, columnPrefs });
      }
      const cached = inMemoryWatchlists.get(userId)!;
      symbols = cached.symbols;
      columnPrefs = cached.columnPrefs;
    }

    return res.status(200).json({
      symbols,
      columnPrefs
    });
  } catch (error) {
    console.error("Fetch Watchlist Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Update User Watchlist
export const updateWatchlist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parseResult = WatchlistSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { symbols, columnPrefs } = parseResult.data;

    try {
      await Watchlist.findOneAndUpdate(
        { user_id: userId },
        { symbols_json: symbols, column_prefs_json: columnPrefs || {} },
        { new: true, upsert: true }
      );
    } catch (err) {
      console.warn("[Market] MongoDB offline. Updating watchlist in memory.");
    }

    inMemoryWatchlists.set(userId, { symbols, columnPrefs: columnPrefs || {} });

    return res.status(200).json({
      message: "Watchlist updated successfully",
      symbols,
      columnPrefs: columnPrefs || {}
    });
  } catch (error) {
    console.error("Update Watchlist Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get Spot Price
export const getSpotPrice = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const price = await redis.get(`ltp:${symbol}`);
    
    if (!price) {
      return res.status(404).json({ error: `Price for symbol ${symbol} not found` });
    }

    return res.status(200).json({
      symbol,
      ltp: parseFloat(price),
      timestamp: new Date()
    });
  } catch (error) {
    console.error("Get Spot Price Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get Futures LTP and current active Candle
export const getFuturesData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const timeframe = (req.query.timeframe as string) || "5m";

    const price = await redis.get(`ltp:${symbol}`);
    const candle = getActiveCandle(symbol, timeframe);

    return res.status(200).json({
      symbol,
      ltp: price ? parseFloat(price) : 0,
      activeCandle: candle
    });
  } catch (error) {
    console.error("Get Futures Data Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get completed OHLC candles from Database
export const getOHLCBars = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { symbol, tf } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    let bars = [];
    try {
      const dbBars = await FuturesOHLC.find({ symbol, timeframe: tf })
        .sort({ bar_time: -1 })
        .limit(limit);
      bars = dbBars.reverse().map((b) => ({
        symbol: b.symbol,
        timeframe: b.timeframe,
        open: b.bar_open,
        high: b.bar_high,
        low: b.bar_low,
        close: b.bar_close,
        openTime: new Date(b.bar_time).getTime(),
        volume: b.volume
      }));
    } catch (err) {
      console.warn(`[Market] MongoDB offline. Generating mock historical OHLC bars for ${symbol} (${tf}).`);
      // Generate mock completed bars
      const now = Date.now();
      const tfMs = tf === "5m" ? 5 * 60 * 1000 : 60000;
      let price = 22100;
      
      for (let i = limit; i > 0; i--) {
        const barTime = new Date(now - i * tfMs);
        const change = (Math.random() - 0.5) * 20;
        const open = price;
        const close = price + change;
        const high = Math.max(open, close) + Math.random() * 10;
        const low = Math.min(open, close) - Math.random() * 10;
        
        bars.push({
          symbol,
          timeframe: tf,
          open: Math.round(open * 100) / 100,
          high: Math.round(high * 100) / 100,
          low: Math.round(low * 100) / 100,
          close: Math.round(close * 100) / 100,
          openTime: barTime.getTime(),
          volume: Math.floor(Math.random() * 5000) + 1000
        });
        price = close;
      }
    }

    return res.status(200).json(bars);
  } catch (error) {
    console.error("Get OHLC Bars Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};


// Get computed pivots (all 3 methods)
export const getPivotLevelsEndpoint = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { symbol, tf } = req.params;

    const classic = await getPivotLevels(symbol, tf, "classic");
    const camarilla = await getPivotLevels(symbol, tf, "camarilla");
    const fibonacci = await getPivotLevels(symbol, tf, "fibonacci");

    return res.status(200).json({
      symbol,
      timeframe: tf,
      classic,
      camarilla,
      fibonacci
    });
  } catch (error) {
    console.error("Get Pivot Levels Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Evaluate Indicators
export const getIndicatorsEndpoint = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { symbol } = req.params;
    const timeframe = (req.query.timeframe as string) || "5m";
    const method = (req.query.method as "classic" | "camarilla" | "fibonacci") || "classic";

    const indicators = await evaluateIndicators(symbol, timeframe, method);
    if (!indicators) {
      return res.status(404).json({ error: "Failed to compute indicators. Make sure market feeds are running." });
    }

    return res.status(200).json(indicators);
  } catch (error) {
    console.error("Get Indicators Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Generate options chain based on current NIFTY spot index
export const getOptionChain = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { index } = req.params; // e.g., "NIFTY50"
    const rawSpot = await redis.get("ltp:NIFTY-SPOT");
    const spot = rawSpot ? parseFloat(rawSpot) : 22100.0;

    // Standard strike step for NIFTY is 50 points
    const strikeStep = 50;
    const atmStrike = Math.round(spot / strikeStep) * strikeStep;

    const strikes: Array<{ strikePrice: number; CE: string; PE: string }> = [];

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
  } catch (error) {
    console.error("Get Option Chain Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

