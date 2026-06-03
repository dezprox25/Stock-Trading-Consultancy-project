"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionData = exports.resumeSession = exports.updateTrackerStrikes = exports.startTrackerSession = exports.initTrackerEngine = void 0;
const Module2Session_1 = require("../models/Module2Session");
const Module2StrikeTick_1 = require("../models/Module2StrikeTick");
const redis_1 = __importDefault(require("../config/redis"));
const socketService_1 = require("./socketService");
// In-memory cache for active tracker sessions to avoid database load
const activeSessions = {};
let boundaryTimer = null;
/**
 * Initializes the Module 2 tracking engine and schedules the minute boundary loop
 */
const initTrackerEngine = async () => {
    // Load any existing active sessions from DB on startup (self-healing)
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dbSessions = await Module2Session_1.Module2Session.find({
            created_at: { $gte: today }
        });
        for (const session of dbSessions) {
            await (0, exports.resumeSession)(session._id.toString());
        }
        console.log(`[TrackerEngine] Restored ${dbSessions.length} active sessions from database.`);
    }
    catch (error) {
        console.error("[TrackerEngine] Failed to restore sessions on startup:", error);
    }
    // Schedule the minute boundary checker
    scheduleNextMinuteBoundary();
};
exports.initTrackerEngine = initTrackerEngine;
/**
 * Schedules execution precisely on clock minute boundaries (00 seconds)
 */
const scheduleNextMinuteBoundary = () => {
    const now = Date.now();
    const delay = 60000 - (now % 60000);
    boundaryTimer = setTimeout(async () => {
        try {
            await executeMinuteBoundary();
        }
        catch (error) {
            console.error("[TrackerEngine] Error executing minute boundary:", error);
        }
        // Re-schedule
        scheduleNextMinuteBoundary();
    }, delay);
};
/**
 * Executed on every minute boundary. Captures prices, updates grids, and broadcasts events.
 */
const executeMinuteBoundary = async () => {
    const timestamp = new Date();
    const minutesSinceStart = getMinutesSinceStart();
    const timeString = timestamp.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit"
    });
    const sessionIds = Object.keys(activeSessions);
    if (sessionIds.length === 0)
        return;
    console.log(`[TrackerEngine] Boundary trigger at ${timeString}. Processing ${sessionIds.length} sessions...`);
    for (const sessionId of sessionIds) {
        const session = activeSessions[sessionId];
        for (const strike of session.selectedStrikes) {
            // 1. Fetch latest price from Redis cache
            const rawPrice = await redis_1.default.get(`ltp:${strike}`);
            let ltp = rawPrice ? Math.floor(parseFloat(rawPrice)) : 0;
            let strikeState = session.strikes[strike];
            // If strike state doesn't exist, initialize it
            if (!strikeState) {
                const dayOpen = ltp || 100; // default fallback if feed is not live yet
                strikeState = {
                    strike,
                    dayOpen,
                    dayHigh: dayOpen,
                    dayLow: dayOpen,
                    grid: [],
                    trendBadge: "FLAT",
                    isDowntrendActive: false,
                    isDeepLoss: false,
                    pctChange: 0
                };
                session.strikes[strike] = strikeState;
            }
            // If price from Redis is 0/missing, fallback to previous price
            if (ltp === 0 && strikeState.grid.length > 0) {
                ltp = strikeState.grid[strikeState.grid.length - 1].ltp;
            }
            else if (ltp === 0) {
                ltp = strikeState.dayOpen;
            }
            // Update High/Low boundaries
            strikeState.dayHigh = Math.max(strikeState.dayHigh, ltp);
            strikeState.dayLow = Math.min(strikeState.dayLow, ltp);
            strikeState.pctChange = Number((((ltp - strikeState.dayOpen) / strikeState.dayOpen) * 100).toFixed(2));
            // 2. Evaluate trend badge
            const previousBadge = strikeState.trendBadge;
            const recentLtpList = strikeState.grid.slice(-4).map(c => c.ltp);
            recentLtpList.push(ltp); // Include current tick to form 5-min lookback
            let newBadge = "FLAT";
            if (recentLtpList.length >= 5) {
                let higherHighs = 0;
                let lowerLows = 0;
                for (let i = 1; i < recentLtpList.length; i++) {
                    if (recentLtpList[i] > recentLtpList[i - 1])
                        higherHighs++;
                    if (recentLtpList[i] < recentLtpList[i - 1])
                        lowerLows++;
                }
                if (lowerLows >= 4) {
                    newBadge = "H_TO_L";
                }
                else if (higherHighs >= 4) {
                    newBadge = "L_TO_H";
                }
            }
            // Handle Trend Reversal Detection
            if (previousBadge === "H_TO_L" && newBadge === "FLAT" && recentLtpList.length >= 2 && recentLtpList[recentLtpList.length - 1] > recentLtpList[recentLtpList.length - 2]) {
                newBadge = "REVERSAL";
            }
            else if (previousBadge === "L_TO_H" && newBadge === "FLAT" && recentLtpList.length >= 2 && recentLtpList[recentLtpList.length - 1] < recentLtpList[recentLtpList.length - 2]) {
                newBadge = "REVERSAL";
            }
            strikeState.trendBadge = newBadge;
            // 3. Evaluate Call-Down Advisory Filter (CE options only)
            const isCE = strike.endsWith("CE");
            if (isCE) {
                // Deep Loss Check (>15% drop from baseline)
                if (ltp < strikeState.dayOpen * 0.85) {
                    strikeState.isDeepLoss = true;
                }
                // Downtrend Check (3 consecutive minutes declining)
                const recent3 = strikeState.grid.slice(-2).map(c => c.ltp);
                recent3.push(ltp);
                if (recent3.length >= 3 && recent3[0] > recent3[1] && recent3[1] > recent3[2]) {
                    strikeState.isDowntrendActive = true;
                }
                // Recovery Check (2 consecutive rising minutes clears all alerts)
                if (recent3.length >= 3 && recent3[recent3.length - 1] > recent3[recent3.length - 2] && recent3[recent3.length - 2] > recent3[recent3.length - 3]) {
                    strikeState.isDowntrendActive = false;
                    strikeState.isDeepLoss = false;
                }
            }
            // Create new cell
            const cell = {
                ltp,
                minute: minutesSinceStart,
                timestamp: timeString,
                isHigh: ltp === strikeState.dayHigh,
                isLow: ltp === strikeState.dayLow
            };
            strikeState.grid.push(cell);
            // 4. Save to Database
            await Module2StrikeTick_1.Module2StrikeTick.create({
                session_id: sessionId,
                strike,
                minute_timestamp: timestamp,
                ltp_integer: ltp,
                is_day_high: cell.isHigh,
                is_day_low: cell.isLow,
                pct_from_open: strikeState.pctChange,
                is_downtrend_flagged: strikeState.isDowntrendActive
            });
            // 5. Broadcast to connected clients
            (0, socketService_1.broadcastTrackerUpdate)(sessionId, {
                strike,
                cell,
                state: {
                    dayHigh: strikeState.dayHigh,
                    dayLow: strikeState.dayLow,
                    trendBadge: strikeState.trendBadge,
                    isDowntrendActive: strikeState.isDowntrendActive,
                    isDeepLoss: strikeState.isDeepLoss,
                    pctChange: strikeState.pctChange
                }
            });
        }
    }
};
/**
 * Starts a new Module 2 tracking session
 */
const startTrackerSession = async (userId, sessionType, indexSymbol, expiryDate, selectedStrikes) => {
    // Capture Day Open prices for each selected strike from Redis
    const dayOpenPrices = {};
    const strikes = {};
    for (const strike of selectedStrikes) {
        const rawPrice = await redis_1.default.get(`ltp:${strike}`);
        const ltp = rawPrice ? Math.floor(parseFloat(rawPrice)) : 100; // default baseline
        dayOpenPrices[strike] = ltp;
        strikes[strike] = {
            strike,
            dayOpen: ltp,
            dayHigh: ltp,
            dayLow: ltp,
            grid: [],
            trendBadge: "FLAT",
            isDowntrendActive: false,
            isDeepLoss: false,
            pctChange: 0
        };
    }
    // Create session record in DB
    const doc = await Module2Session_1.Module2Session.create({
        user_id: userId,
        session_type: sessionType,
        index_symbol: indexSymbol,
        expiry_date: expiryDate,
        selected_strikes_json: selectedStrikes,
        day_open_prices_json: dayOpenPrices
    });
    const sessionData = {
        sessionId: doc._id.toString(),
        userId,
        sessionType,
        indexSymbol,
        expiryDate,
        selectedStrikes,
        dayOpenPrices,
        strikes,
        createdAt: doc.created_at
    };
    // Add to local active sessions cache
    activeSessions[doc._id.toString()] = sessionData;
    return sessionData;
};
exports.startTrackerSession = startTrackerSession;
/**
 * Swaps strikes dynamically within an active tracking session without losing history for others
 */
const updateTrackerStrikes = async (sessionId, newStrikes) => {
    const session = activeSessions[sessionId];
    if (!session) {
        throw new Error("Active session not found");
    }
    // Identify new strikes to initialize baselines
    for (const strike of newStrikes) {
        if (!session.selectedStrikes.includes(strike)) {
            const rawPrice = await redis_1.default.get(`ltp:${strike}`);
            const ltp = rawPrice ? Math.floor(parseFloat(rawPrice)) : 100;
            session.dayOpenPrices[strike] = ltp;
            session.strikes[strike] = {
                strike,
                dayOpen: ltp,
                dayHigh: ltp,
                dayLow: ltp,
                grid: [],
                trendBadge: "FLAT",
                isDowntrendActive: false,
                isDeepLoss: false,
                pctChange: 0
            };
        }
    }
    // Remove retired strikes from the active selection (but we can keep memory cache history if needed,
    // or clean it up. Keeping it in Mongoose is fine since they are written to DB).
    session.selectedStrikes = newStrikes;
    // Update Database session configuration
    await Module2Session_1.Module2Session.findByIdAndUpdate(sessionId, {
        selected_strikes_json: newStrikes,
        day_open_prices_json: session.dayOpenPrices
    });
    return session;
};
exports.updateTrackerStrikes = updateTrackerStrikes;
/**
 * Resumes an active session from the database (e.g. on server restart)
 */
const resumeSession = async (sessionId) => {
    const doc = await Module2Session_1.Module2Session.findById(sessionId);
    if (!doc)
        return null;
    const strikes = {};
    const dayOpenPrices = doc.day_open_prices_json;
    // Load per-minute tick history from database to reconstruct the grid
    for (const strike of doc.selected_strikes_json) {
        const ticks = await Module2StrikeTick_1.Module2StrikeTick.find({ session_id: sessionId, strike }).sort({ minute_timestamp: 1 });
        const grid = ticks.map((t, idx) => ({
            ltp: t.ltp_integer,
            minute: idx,
            timestamp: t.minute_timestamp.toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit"
            }),
            isHigh: t.is_day_high,
            isLow: t.is_day_low
        }));
        const ltp = grid.length > 0 ? grid[grid.length - 1].ltp : (dayOpenPrices[strike] || 100);
        const dayHigh = ticks.reduce((max, t) => Math.max(max, t.ltp_integer), dayOpenPrices[strike] || 100);
        const dayLow = ticks.reduce((min, t) => Math.min(min, t.ltp_integer), dayOpenPrices[strike] || 100);
        const isDowntrendActive = grid.length > 0 ? ticks[ticks.length - 1].is_downtrend_flagged : false;
        const isDeepLoss = ltp < (dayOpenPrices[strike] || 100) * 0.85;
        // Estimate trend badge from reconstructed grid
        let trendBadge = "FLAT";
        if (grid.length >= 5) {
            const recent = grid.slice(-5).map(c => c.ltp);
            let up = 0, down = 0;
            for (let i = 1; i < recent.length; i++) {
                if (recent[i] > recent[i - 1])
                    up++;
                if (recent[i] < recent[i - 1])
                    down++;
            }
            if (down >= 4)
                trendBadge = "H_TO_L";
            else if (up >= 4)
                trendBadge = "L_TO_H";
        }
        strikes[strike] = {
            strike,
            dayOpen: dayOpenPrices[strike] || 100,
            dayHigh,
            dayLow,
            grid,
            trendBadge,
            isDowntrendActive,
            isDeepLoss,
            pctChange: Number((((ltp - (dayOpenPrices[strike] || 100)) / (dayOpenPrices[strike] || 100)) * 100).toFixed(2))
        };
    }
    const sessionData = {
        sessionId: doc._id.toString(),
        userId: doc.user_id.toString(),
        sessionType: doc.session_type,
        indexSymbol: doc.index_symbol,
        expiryDate: doc.expiry_date,
        selectedStrikes: doc.selected_strikes_json,
        dayOpenPrices,
        strikes,
        createdAt: doc.created_at
    };
    activeSessions[sessionId] = sessionData;
    return sessionData;
};
exports.resumeSession = resumeSession;
/**
 * Gets session data from cache or loads it from DB
 */
const getSessionData = async (sessionId) => {
    if (activeSessions[sessionId]) {
        return activeSessions[sessionId];
    }
    return await (0, exports.resumeSession)(sessionId);
};
exports.getSessionData = getSessionData;
/**
 * Helper to compute elapsed minutes since the baseline 9:15 AM (or session start)
 */
const getMinutesSinceStart = () => {
    const now = new Date();
    const start = new Date();
    start.setHours(9, 15, 0, 0);
    // If before 9:15 AM, return 0 (grid starts index 0)
    if (now.getTime() < start.getTime())
        return 0;
    return Math.floor((now.getTime() - start.getTime()) / 60000);
};
