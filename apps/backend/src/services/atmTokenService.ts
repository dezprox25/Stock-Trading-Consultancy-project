import fs from "fs";
import path from "path";
import { config } from "../config/config";

// --- Task 2: Interfaces and Models ---

export interface MasterContract {
  loadedAt: Date;
  contracts: OptionContract[];
}

export interface OptionContract {
  tradingSymbol: string;
  exchange: string;
  token: string;
  expiry: string; // Expiry date format e.g. YYYY-MM-DD or DD-MMM-YY
  strike: number;
  optionType: "CE" | "PE";
}

export interface StrikeToken {
  key: string;      // e.g., "NFO|56188"
  exchange: string; // e.g., "NFO"
  token: string;    // e.g., "56188"
  symbol: string;   // e.g., "NIFTY23JUN26C21600"
}

export interface ExpiryInfo {
  nearestExpiry: string;
  allExpiries: string[];
}

export interface SubscriptionGroup {
  spot: string;
  futures: string;
  ceTokens: StrikeToken[];
  peTokens: StrikeToken[];
  subscriptionList: string[]; // List of formatted strings e.g. "NFO|56188:NIFTY23JUN26C21600"
}

export interface ATMConfiguration {
  enabled: boolean;
  masterContractUrl: string;
  refreshIntervalMs: number;
  strikeRange: number;
  expiryStrategy: string;
}

export interface ZebuInstrument {
  key: string;
  exchange: string;
  token: string;
  symbol: string;
}

// Cache storage for parsed contracts and subscription group
let parsedContracts: OptionContract[] = [];
let activeSubscriptionGroup: SubscriptionGroup | null = null;
let lastRefreshTime: Date | null = null;

// --- Task 11: Configuration ---
export const getATMConfiguration = (): ATMConfiguration => {
  return {
    enabled: config.dynamicAtm.enabled,
    masterContractUrl: config.dynamicAtm.masterContractUrl,
    refreshIntervalMs: config.dynamicAtm.refreshIntervalMs,
    strikeRange: config.dynamicAtm.strikeRange,
    expiryStrategy: config.dynamicAtm.expiryStrategy,
  };
};

// --- Task 3: ATM Strike Calculation Logic ---
/**
 * Calculates the nearest NIFTY ATM strike price from the live price.
 * NIFTY strikes are spaced at intervals of 50.
 * Examples:
 * 24182 -> 24200
 * 24224 -> 24200
 * 24227 -> 24250
 */
export const calculateATMStrike = (price: number): number => {
  const step = 50; // Nifty standard strike interval
  return Math.round(price / step) * step;
};

// --- Task 4: Configurable Strike Window ---
/**
 * Generates the list of strike prices in the strike window.
 * Default range is 5 (ATM-5 to ATM+5, total 11 strikes).
 */
export const generateStrikeWindow = (atmStrike: number, range: number = 5, step: number = 50): number[] => {
  const strikes: number[] = [];
  for (let i = -range; i <= range; i++) {
    strikes.push(atmStrike + i * step);
  }
  return strikes;
};

// --- Task 5: Master Contract Parser ---
/**
 * Accept CSV text content and parse it into an OptionContract list.
 * Columns typically include: Exchange, Token, TradingSymbol, Expiry, StrikePrice, OptionType
 */
export const parseMasterContractContent = (content: string): OptionContract[] => {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

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

  const contracts: OptionContract[] = [];
  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const columns = lines[i].split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
    
    let exchange = "";
    let token = "";
    let tradingSymbol = "";
    let expiry = "";
    let strike = 0;
    let optionType: "CE" | "PE" | null = null;

    if (hasHeader) {
      if (exchangeIdx !== -1) exchange = columns[exchangeIdx];
      if (tokenIdx !== -1) token = columns[tokenIdx];
      if (tradingSymbolIdx !== -1) tradingSymbol = columns[tradingSymbolIdx];
      if (expiryIdx !== -1) expiry = columns[expiryIdx];
      
      if (strikeIdx !== -1) {
        strike = parseFloat(columns[strikeIdx]) || 0;
      }
      
      if (optionTypeIdx !== -1) {
        const rawType = columns[optionTypeIdx]?.toUpperCase();
        if (rawType.includes("CE") || rawType === "CALL") optionType = "CE";
        else if (rawType.includes("PE") || rawType === "PUT") optionType = "PE";
      }
    } else {
      // Fallback structure
      if (columns.length >= 6) {
        exchange = columns[0];
        token = columns[1];
        tradingSymbol = columns[2];
        expiry = columns[3];
        strike = parseFloat(columns[4]) || 0;
        const rawType = columns[5]?.toUpperCase();
        if (rawType.includes("CE") || rawType === "CALL") optionType = "CE";
        else if (rawType.includes("PE") || rawType === "PUT") optionType = "PE";
      }
    }

    // Inference logic from trading symbol if fields missing
    if (!optionType && tradingSymbol) {
      const upperSymbol = tradingSymbol.toUpperCase();
      if (upperSymbol.endsWith("CE") || /\d+CE$/.test(upperSymbol)) {
        optionType = "CE";
      } else if (upperSymbol.endsWith("PE") || /\d+PE$/.test(upperSymbol)) {
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

/**
 * Load master contract file from filesystem (Task 5 core)
 * Do NOT download files. Just reads a local prepared file path if provided.
 */
export const loadMasterContractFromFile = async (filePath: string): Promise<OptionContract[]> => {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[ATM] Master contract file not found at: ${absolutePath}`);
      return [];
    }
    const content = await fs.promises.readFile(absolutePath, "utf-8");
    parsedContracts = parseMasterContractContent(content);
    lastRefreshTime = new Date();
    console.log(`[ATM] Master contract loaded: successfully parsed ${parsedContracts.length} options contracts.`);
    return parsedContracts;
  } catch (error: any) {
    console.error(`[ATM] Error reading master contract file:`, error?.message || error);
    return [];
  }
};

// --- Task 6: Token Resolver ---
/**
 * Resolves list of CE and PE options tokens from a parsed contract database based on strike window
 */
export const resolveTokens = (
  contracts: OptionContract[],
  strikeWindow: number[],
  targetExpiry?: string
): { ceTokens: StrikeToken[]; peTokens: StrikeToken[] } => {
  const expiryToUse = targetExpiry || getExpiryInfo(contracts).nearestExpiry;
  
  const filtered = contracts.filter(c => 
    c.expiry === expiryToUse && 
    strikeWindow.includes(c.strike)
  );

  const ceTokens: StrikeToken[] = [];
  const peTokens: StrikeToken[] = [];

  for (const contract of filtered) {
    const tokenObj: StrikeToken = {
      key: `${contract.exchange}|${contract.token}`,
      exchange: contract.exchange,
      token: contract.token,
      symbol: contract.tradingSymbol
    };

    if (contract.optionType === "CE") {
      ceTokens.push(tokenObj);
    } else if (contract.optionType === "PE") {
      peTokens.push(tokenObj);
    }
  }

  // Sort helper to match ascending strike price order
  const sortByStrike = (a: StrikeToken, b: StrikeToken) => {
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

/**
 * Extracts expiry information from parsed contracts (Task 2 helper)
 */
export const getExpiryInfo = (contracts: OptionContract[]): ExpiryInfo => {
  const expiries = Array.from(new Set(contracts.map(c => c.expiry))).filter(Boolean);
  
  const parseExpiryToDate = (exp: string): Date => {
    const parsed = Date.parse(exp);
    if (!isNaN(parsed)) return new Date(parsed);
    
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

// --- Task 7: Subscription Builder ---
/**
 * Formats options, spot, and futures tokens into the subscription format: Exchange|Token:TradingSymbol
 */
export const buildSubscriptionList = (
  ceTokens: StrikeToken[],
  peTokens: StrikeToken[],
  spotToken: string = "NSE|26000:NIFTY-SPOT",
  futuresToken: string = "NFO|62329:NIFTY-FUT"
): SubscriptionGroup => {
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

// --- Task 10: Logging & Module Preparations ---

// --- Task 8: Integration Point & Task 10 logging ---
/**
 * Single startup entry point for initializing Dynamic ATM Module configuration.
 * Returns immediately unless config.dynamicAtm.enabled is true.
 */
export const initializeDynamicATM = (): void => {
  const isEnabled = config.dynamicAtm.enabled;
  
  if (!isEnabled) {
    console.log("[ATM] Dynamic ATM disabled");
    return;
  }
  
  console.log("[ATM] Dynamic ATM module initialized");
  console.log("[ATM] Waiting for permission to authenticate");
  
  // Preparing backend prepared states without performing live logins / WebSocket setups.
};

/**
 * Interface entry to simulate or execute strike modifications based on index price updates
 */
export const updateATMStrikeFromPrice = (liveNiftyPrice: number): SubscriptionGroup | null => {
  if (parsedContracts.length === 0) {
    console.warn("[ATM] Cannot update ATM strike: Master contract is empty or not parsed.");
    return null;
  }

  const atmStrike = calculateATMStrike(liveNiftyPrice);
  const strikeRange = config.dynamicAtm.strikeRange;
  const strikeWindow = generateStrikeWindow(atmStrike, strikeRange);

  const { ceTokens, peTokens } = resolveTokens(parsedContracts, strikeWindow);
  
  const spotToken = process.env.ZEBU_NIFTY_SPOT_TOKEN || "NSE|26000:NIFTY-SPOT";
  const futuresToken = process.env.ZEBU_NIFTY_FUT_TOKEN || "NFO|62329:NIFTY-FUT";

  activeSubscriptionGroup = buildSubscriptionList(ceTokens, peTokens, spotToken, futuresToken);

  console.log(`[ATM] Updated ATM Strike to ${atmStrike} (Nifty Price: ${liveNiftyPrice})`);
  console.log(`[ATM] Resolved ${ceTokens.length} CE and ${peTokens.length} PE tokens inside strike range [${strikeWindow[0]} - ${strikeWindow[strikeWindow.length - 1]}]`);

  return activeSubscriptionGroup;
};

/**
 * Exposes active instruments matching the structural ZebuInstrument model
 */
export const getDynamicAtmInstruments = (): ZebuInstrument[] => {
  if (!activeSubscriptionGroup) return [];

  const instruments: ZebuInstrument[] = [];
  
  const parseTokenString = (tokenStr: string): ZebuInstrument | null => {
    if (!tokenStr) return null;
    const [exchangeToken, symbolFromEnv] = tokenStr.split(":");
    if (!exchangeToken || !symbolFromEnv) return null;
    const [exchange, token] = exchangeToken.split("|");
    if (!exchange || !token) return null;
    return {
      key: `${exchange}|${token}`,
      exchange,
      token,
      symbol: symbolFromEnv
    };
  };

  const spotInst = parseTokenString(activeSubscriptionGroup.spot);
  if (spotInst) instruments.push(spotInst);

  const futInst = parseTokenString(activeSubscriptionGroup.futures);
  if (futInst) instruments.push(futInst);

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

export const isDynamicAtmEnabled = (): boolean => {
  return config.dynamicAtm.enabled;
};
