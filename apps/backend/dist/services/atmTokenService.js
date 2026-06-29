"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDynamicAtmEnabled = exports.getDynamicAtmInstruments = exports.updateATMStrikeFromPrice = exports.initializeDynamicATM = exports.buildSubscriptionList = exports.getExpiryInfo = exports.resolveTokens = exports.loadMasterContractFromFile = exports.parseMasterContractContent = exports.generateStrikeWindow = exports.calculateATMStrike = exports.getATMConfiguration = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config/config");
// Cache storage for parsed contracts and subscription group
let parsedContracts = [];
let activeSubscriptionGroup = null;
let lastRefreshTime = null;
// --- Task 11: Configuration ---
const getATMConfiguration = () => {
    return {
        enabled: config_1.config.dynamicAtm.enabled,
        masterContractUrl: config_1.config.dynamicAtm.masterContractUrl,
        refreshIntervalMs: config_1.config.dynamicAtm.refreshIntervalMs,
        strikeRange: config_1.config.dynamicAtm.strikeRange,
        expiryStrategy: config_1.config.dynamicAtm.expiryStrategy,
    };
};
exports.getATMConfiguration = getATMConfiguration;
// --- Task 3: ATM Strike Calculation Logic ---
/**
 * Calculates the nearest NIFTY ATM strike price from the live price.
 * NIFTY strikes are spaced at intervals of 50.
 * Examples:
 * 24182 -> 24200
 * 24224 -> 24200
 * 24227 -> 24250
 */
const calculateATMStrike = (price) => {
    const step = 50; // Nifty standard strike interval
    return Math.round(price / step) * step;
};
exports.calculateATMStrike = calculateATMStrike;
// --- Task 4: Configurable Strike Window ---
/**
 * Generates the list of strike prices in the strike window.
 * Default range is 5 (ATM-5 to ATM+5, total 11 strikes).
 */
const generateStrikeWindow = (atmStrike, range = 5, step = 50) => {
    const strikes = [];
    for (let i = -range; i <= range; i++) {
        strikes.push(atmStrike + i * step);
    }
    return strikes;
};
exports.generateStrikeWindow = generateStrikeWindow;
// --- Task 5: Master Contract Parser ---
/**
 * Accept CSV text content and parse it into an OptionContract list.
 * Columns typically include: Exchange, Token, TradingSymbol, Expiry, StrikePrice, OptionType
 */
const parseMasterContractContent = (content) => {
    const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0)
        return [];
    // Determine headers if present
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(",").map(h => h.trim());
    const hasHeader = headers.includes("token") || headers.includes("exchange") || headers.includes("tradingsymbol") || headers.includes("symbol");
    let exchangeIdx = -1;
    let tokenIdx = -1;
    let tradingSymbolIdx = -1;
    let expiryIdx = -1;
    let strikeIdx = -1;
    let optionTypeIdx = -1;
    if (hasHeader) {
        exchangeIdx = headers.findIndex(h => h.includes("exchange") || h === "exch");
        tokenIdx = headers.findIndex(h => h === "token" || h === "code" || h.includes("instrumenttoken"));
        tradingSymbolIdx = headers.findIndex(h => h.includes("symbol") || h.includes("tradingsymbol") || h === "tsym");
        expiryIdx = headers.findIndex(h => h === "expiry" || h.includes("expdate") || h.includes("expirydate"));
        strikeIdx = headers.findIndex(h => h.includes("strike") || h === "strike_price");
        optionTypeIdx = headers.findIndex(h => h.includes("optiontype") || h.includes("opt_type") || h === "opttype" || h === "type");
    }
    const contracts = [];
    const startIdx = hasHeader ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
        const columns = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
        let exchange = "";
        let token = "";
        let tradingSymbol = "";
        let expiry = "";
        let strike = 0;
        let optionType = null;
        if (hasHeader) {
            if (exchangeIdx !== -1)
                exchange = columns[exchangeIdx];
            if (tokenIdx !== -1)
                token = columns[tokenIdx];
            if (tradingSymbolIdx !== -1)
                tradingSymbol = columns[tradingSymbolIdx];
            if (expiryIdx !== -1)
                expiry = columns[expiryIdx];
            if (strikeIdx !== -1) {
                strike = parseFloat(columns[strikeIdx]) || 0;
            }
            if (optionTypeIdx !== -1) {
                const rawType = columns[optionTypeIdx]?.toUpperCase();
                if (rawType.includes("CE") || rawType === "CALL")
                    optionType = "CE";
                else if (rawType.includes("PE") || rawType === "PUT")
                    optionType = "PE";
            }
        }
        else {
            // Fallback structure
            if (columns.length >= 6) {
                exchange = columns[0];
                token = columns[1];
                tradingSymbol = columns[2];
                expiry = columns[3];
                strike = parseFloat(columns[4]) || 0;
                const rawType = columns[5]?.toUpperCase();
                if (rawType.includes("CE") || rawType === "CALL")
                    optionType = "CE";
                else if (rawType.includes("PE") || rawType === "PUT")
                    optionType = "PE";
            }
        }
        // Inference logic from trading symbol if fields missing
        if (!optionType && tradingSymbol) {
            const upperSymbol = tradingSymbol.toUpperCase();
            if (upperSymbol.endsWith("CE") || /\d+CE$/.test(upperSymbol)) {
                optionType = "CE";
            }
            else if (upperSymbol.endsWith("PE") || /\d+PE$/.test(upperSymbol)) {
                optionType = "PE";
            }
        }
        if (strike === 0 && tradingSymbol) {
            const match = tradingSymbol.match(/(\d+)(CE|PE)$/i);
            if (match) {
                strike = parseFloat(match[1]) || 0;
            }
        }
        if (exchange && token && tradingSymbol && strike > 0 && optionType) {
            contracts.push({
                tradingSymbol,
                exchange,
                token,
                expiry,
                strike,
                optionType
            });
        }
    }
    return contracts;
};
exports.parseMasterContractContent = parseMasterContractContent;
/**
 * Load master contract file from filesystem (Task 5 core)
 * Do NOT download files. Just reads a local prepared file path if provided.
 */
const loadMasterContractFromFile = async (filePath) => {
    try {
        const absolutePath = path_1.default.isAbsolute(filePath) ? filePath : path_1.default.resolve(filePath);
        if (!fs_1.default.existsSync(absolutePath)) {
            console.warn(`[ATM] Master contract file not found at: ${absolutePath}`);
            return [];
        }
        const content = await fs_1.default.promises.readFile(absolutePath, "utf-8");
        parsedContracts = (0, exports.parseMasterContractContent)(content);
        lastRefreshTime = new Date();
        console.log(`[ATM] Master contract loaded: successfully parsed ${parsedContracts.length} options contracts.`);
        return parsedContracts;
    }
    catch (error) {
        console.error(`[ATM] Error reading master contract file:`, error?.message || error);
        return [];
    }
};
exports.loadMasterContractFromFile = loadMasterContractFromFile;
// --- Task 6: Token Resolver ---
/**
 * Resolves list of CE and PE options tokens from a parsed contract database based on strike window
 */
const resolveTokens = (contracts, strikeWindow, targetExpiry) => {
    const expiryToUse = targetExpiry || (0, exports.getExpiryInfo)(contracts).nearestExpiry;
    const filtered = contracts.filter(c => c.expiry === expiryToUse &&
        strikeWindow.includes(c.strike));
    const ceTokens = [];
    const peTokens = [];
    for (const contract of filtered) {
        const tokenObj = {
            key: `${contract.exchange}|${contract.token}`,
            exchange: contract.exchange,
            token: contract.token,
            symbol: contract.tradingSymbol
        };
        if (contract.optionType === "CE") {
            ceTokens.push(tokenObj);
        }
        else if (contract.optionType === "PE") {
            peTokens.push(tokenObj);
        }
    }
    // Sort helper to match ascending strike price order
    const sortByStrike = (a, b) => {
        const contractA = filtered.find(c => c.token === a.token);
        const contractB = filtered.find(c => c.token === b.token);
        if (contractA && contractB) {
            return contractA.strike - contractB.strike;
        }
        return 0;
    };
    ceTokens.sort(sortByStrike);
    peTokens.sort(sortByStrike);
    return { ceTokens, peTokens };
};
exports.resolveTokens = resolveTokens;
/**
 * Extracts expiry information from parsed contracts (Task 2 helper)
 */
const getExpiryInfo = (contracts) => {
    const expiries = Array.from(new Set(contracts.map(c => c.expiry))).filter(Boolean);
    const parseExpiryToDate = (exp) => {
        const parsed = Date.parse(exp);
        if (!isNaN(parsed))
            return new Date(parsed);
        // Custom parser for standard DDMMMYY format (e.g. 26JUN26)
        const cleanExp = exp.replace(/-/g, "").toUpperCase();
        const ddmmyyMatch = cleanExp.match(/^(\d{2})([A-Z]{3})(\d{2})$/);
        if (ddmmyyMatch) {
            const day = parseInt(ddmmyyMatch[1], 10);
            const monthStr = ddmmyyMatch[2];
            const year = 2000 + parseInt(ddmmyyMatch[3], 10);
            const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const monthIdx = months.indexOf(monthStr);
            if (monthIdx !== -1) {
                return new Date(year, monthIdx, day);
            }
        }
        return new Date(0);
    };
    const sortedExpiries = expiries.sort((a, b) => {
        return parseExpiryToDate(a).getTime() - parseExpiryToDate(b).getTime();
    });
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const futureExpiries = sortedExpiries.filter(exp => {
        const d = parseExpiryToDate(exp);
        return d.getTime() >= now.getTime();
    });
    const nearestExpiry = futureExpiries.length > 0 ? futureExpiries[0] : (sortedExpiries.length > 0 ? sortedExpiries[0] : "");
    return {
        nearestExpiry,
        allExpiries: sortedExpiries
    };
};
exports.getExpiryInfo = getExpiryInfo;
// --- Task 7: Subscription Builder ---
/**
 * Formats options, spot, and futures tokens into the subscription format: Exchange|Token:TradingSymbol
 */
const buildSubscriptionList = (ceTokens, peTokens, spotToken = "NSE|26000:NIFTY-SPOT", futuresToken = "NFO|62329:NIFTY-FUT") => {
    const formattedCe = ceTokens.map(t => `${t.key}:${t.symbol}`);
    const formattedPe = peTokens.map(t => `${t.key}:${t.symbol}`);
    const subscriptionList = [
        spotToken,
        futuresToken,
        ...formattedCe,
        ...formattedPe
    ];
    return {
        spot: spotToken,
        futures: futuresToken,
        ceTokens,
        peTokens,
        subscriptionList
    };
};
exports.buildSubscriptionList = buildSubscriptionList;
// --- Task 10: Logging & Module Preparations ---
// --- Task 8: Integration Point & Task 10 logging ---
/**
 * Single startup entry point for initializing Dynamic ATM Module configuration.
 * Returns immediately unless config.dynamicAtm.enabled is true.
 */
const initializeDynamicATM = () => {
    const isEnabled = config_1.config.dynamicAtm.enabled;
    if (!isEnabled) {
        console.log("[ATM] Dynamic ATM disabled");
        return;
    }
    console.log("[ATM] Dynamic ATM module initialized");
    console.log("[ATM] Waiting for permission to authenticate");
    // Preparing backend prepared states without performing live logins / WebSocket setups.
};
exports.initializeDynamicATM = initializeDynamicATM;
/**
 * Interface entry to simulate or execute strike modifications based on index price updates
 */
const updateATMStrikeFromPrice = (liveNiftyPrice) => {
    if (parsedContracts.length === 0) {
        console.warn("[ATM] Cannot update ATM strike: Master contract is empty or not parsed.");
        return null;
    }
    const atmStrike = (0, exports.calculateATMStrike)(liveNiftyPrice);
    const strikeRange = config_1.config.dynamicAtm.strikeRange;
    const strikeWindow = (0, exports.generateStrikeWindow)(atmStrike, strikeRange);
    const { ceTokens, peTokens } = (0, exports.resolveTokens)(parsedContracts, strikeWindow);
    const spotToken = process.env.ZEBU_NIFTY_SPOT_TOKEN || "NSE|26000:NIFTY-SPOT";
    const futuresToken = process.env.ZEBU_NIFTY_FUT_TOKEN || "NFO|62329:NIFTY-FUT";
    activeSubscriptionGroup = (0, exports.buildSubscriptionList)(ceTokens, peTokens, spotToken, futuresToken);
    console.log(`[ATM] Updated ATM Strike to ${atmStrike} (Nifty Price: ${liveNiftyPrice})`);
    console.log(`[ATM] Resolved ${ceTokens.length} CE and ${peTokens.length} PE tokens inside strike range [${strikeWindow[0]} - ${strikeWindow[strikeWindow.length - 1]}]`);
    return activeSubscriptionGroup;
};
exports.updateATMStrikeFromPrice = updateATMStrikeFromPrice;
/**
 * Exposes active instruments matching the structural ZebuInstrument model
 */
const getDynamicAtmInstruments = () => {
    if (!activeSubscriptionGroup)
        return [];
    const instruments = [];
    const parseTokenString = (tokenStr) => {
        if (!tokenStr)
            return null;
        const [exchangeToken, symbolFromEnv] = tokenStr.split(":");
        if (!exchangeToken || !symbolFromEnv)
            return null;
        const [exchange, token] = exchangeToken.split("|");
        if (!exchange || !token)
            return null;
        return {
            key: `${exchange}|${token}`,
            exchange,
            token,
            symbol: symbolFromEnv
        };
    };
    const spotInst = parseTokenString(activeSubscriptionGroup.spot);
    if (spotInst)
        instruments.push(spotInst);
    const futInst = parseTokenString(activeSubscriptionGroup.futures);
    if (futInst)
        instruments.push(futInst);
    for (const t of activeSubscriptionGroup.ceTokens) {
        instruments.push({
            key: t.key,
            exchange: t.exchange,
            token: t.token,
            symbol: t.symbol
        });
    }
    for (const t of activeSubscriptionGroup.peTokens) {
        instruments.push({
            key: t.key,
            exchange: t.exchange,
            token: t.token,
            symbol: t.symbol
        });
    }
    return instruments;
};
exports.getDynamicAtmInstruments = getDynamicAtmInstruments;
const isDynamicAtmEnabled = () => {
    return config_1.config.dynamicAtm.enabled;
};
exports.isDynamicAtmEnabled = isDynamicAtmEnabled;
