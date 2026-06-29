import WebSocket from "ws";
import { Tick } from "@stock/shared";
import { getZebuOAuthMissingConfig, resolveZebuSessionToken } from "./zebuOAuthService";
import { config } from "../config/config";
import { getDynamicAtmInstruments, isDynamicAtmEnabled } from "./atmTokenService";

type DataSource = "LIVE_MARKET_API" | "SIMULATOR";

let wsConnected = false;
export const isZebuLiveConnected = () => wsConnected;

interface ZebuInstrument {
  key: string;
  exchange: string;
  token: string;
  symbol: string;
}

interface ZebuClient {
  close: () => void;
}

const isPlaceholder = (value?: string) =>
  !value || value.includes("your-") || value.includes("placeholder");

const getZebuWsUrl = () => process.env.ZEBU_WS_URL || process.env.CLIENT_API_URL || "";
const getZebuUserId = () => process.env.ZEBU_CLIENT_ID || process.env.ZEBU_USER_ID || "";
const getZebuAccountId = () => process.env.ZEBU_ACCOUNT_ID || getZebuUserId();
const getZebuSessionToken = () => process.env.ZEBU_SUSERTOKEN || process.env.ZEBU_SESSION_TOKEN || "";

const sanitizeFeedUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url ? "[configured]" : "[missing]";
  }
};

const parseInstrumentEnv = (value?: string): ZebuInstrument[] => {
  if (!value || isPlaceholder(value)) return [];

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [exchangeToken, symbolFromEnv] = part.split(":");
      const [exchange, token] = exchangeToken.split("|");
      if (!exchange || !token || !symbolFromEnv) return null;

      return {
        key: `${exchange}|${token}`,
        exchange,
        token,
        symbol: symbolFromEnv,
      };
    })
    .filter((instrument): instrument is ZebuInstrument => instrument !== null);
};

const getModule1ZebuInstruments = (): ZebuInstrument[] => {
  if (isDynamicAtmEnabled()) {
    const dynamicInstruments = getDynamicAtmInstruments();
    if (dynamicInstruments.length > 0) {
      return dynamicInstruments;
    }
    console.log("[ATM] Dynamic ATM enabled but no dynamic instruments resolved yet. Falling back to hardcoded environment tokens.");
  }

  return [
    ...parseInstrumentEnv(process.env.ZEBU_NIFTY_SPOT_TOKEN || "NSE|26000:NIFTY-SPOT"),
    ...parseInstrumentEnv(process.env.ZEBU_NIFTY_FUT_TOKEN),
    ...parseInstrumentEnv(process.env.ZEBU_NIFTY_CE_TOKENS),
    ...parseInstrumentEnv(process.env.ZEBU_NIFTY_PE_TOKENS),
  ];
};

export const getZebuMissingConfig = () => {
  const missing: string[] = [];
  const wsUrl = getZebuWsUrl();
  const instruments = getModule1ZebuInstruments();

  if (!/^wss?:\/\//.test(wsUrl) || isPlaceholder(wsUrl)) missing.push("ZEBU_WS_URL or CLIENT_API_URL");
  if (isPlaceholder(getZebuUserId())) missing.push("ZEBU_CLIENT_ID or ZEBU_USER_ID");
  
  const hasDirectAuth = !isPlaceholder(process.env.ZEBU_PASSWORD) &&
                        !isPlaceholder(process.env.ZEBU_FACTOR2) &&
                        !isPlaceholder(process.env.ZEBU_VENDOR_CODE) &&
                        !isPlaceholder(process.env.ZEBU_LOGIN_URL);
  
  const hasToken = !isPlaceholder(getZebuSessionToken());
  const hasOAuth = getZebuOAuthMissingConfig().length === 0;

  if (!hasToken && !hasDirectAuth && !hasOAuth) {
    missing.push("ZEBU_SUSERTOKEN/ZEBU_SESSION_TOKEN, QuickAuth credentials, or complete Zebu OAuth config");
  }
  if (isPlaceholder(process.env.MOD1_API_KEY)) missing.push("MOD1_API_KEY");
  if (isPlaceholder(process.env.MOD1_API_SECRET)) missing.push("MOD1_API_SECRET");
  if (instruments.length === 0) {
    missing.push("ZEBU_NIFTY_FUT_TOKEN, ZEBU_NIFTY_CE_TOKENS, ZEBU_NIFTY_PE_TOKENS");
  }

  return missing;
};

export const isZebuMarketDataConfigured = () => {
  if (isDynamicAtmEnabled()) {
    const dynamicInsts = getDynamicAtmInstruments();
    if (dynamicInsts.length === 0) {
      // Waiting for permission to authenticate and load master contract
      return false;
    }
  }
  return getZebuMissingConfig().length === 0;
};

const buildInstrumentMap = (instruments: ZebuInstrument[]) => {
  const symbolByKey = new Map<string, string>();
  for (const instrument of instruments) {
    symbolByKey.set(instrument.key, instrument.symbol);
    symbolByKey.set(instrument.token, instrument.symbol);
  }
  return symbolByKey;
};

const toTick = (payload: any, symbolByKey: Map<string, string>): Tick | null => {
  const exchange = payload.e || payload.exch || payload.exchange;
  const token = payload.tk || payload.token || payload.instrumentToken;
  const mappedSymbol = symbolByKey.get(`${exchange}|${token}`) || symbolByKey.get(String(token));
  const symbol = mappedSymbol || payload.tsym || payload.tradingSymbol || payload.symbol;
  const rawLtp = payload.lp ?? payload.ltp ?? payload.lastPrice ?? payload.last_price ?? payload.price;
  const rawOi = payload.oi ?? payload.openInterest ?? payload.open_interest;
  const ltp = Number(rawLtp);

  if (!symbol || Number.isNaN(ltp)) return null;

  return {
    symbol: String(symbol),
    ltp,
    timestamp: payload.ft ? new Date(Number(payload.ft) * 1000) : new Date(),
    volume: payload.v ? Number(payload.v) : payload.volume ? Number(payload.volume) : 0,
    oi: rawOi !== undefined ? Number(rawOi) : undefined,
  };
};

export const startZebuMarketDataFeed = (
  onTick: (tick: Tick) => Promise<void>,
  onDataSource: (dataSource: DataSource) => void,
  onFallback: (reason: string) => void,
): ZebuClient => {
  const wsUrl = getZebuWsUrl();
  const instruments = getModule1ZebuInstruments();
  const symbolByKey = buildInstrumentMap(instruments);
  const subscribeKeys = instruments.map((instrument) => instrument.key).join("#");

  console.log(`[Module1/Zebu] Connecting to live feed: ${sanitizeFeedUrl(wsUrl)}`);

  const ws = new WebSocket(wsUrl);
  let liveConnected = false;

  ws.on("open", async () => {
    wsConnected = true;
    let sessionToken: string | null = null;
    try {
      sessionToken = await resolveZebuSessionToken();
    } catch (error) {
      ws.close();
      onFallback("Zebu OAuth token exchange failed");
      return;
    }

    if (!sessionToken) {
      ws.close();
      onFallback("missing Zebu session token and OAuth token exchange config");
      return;
    }

    const connectMessage = {
      t: "c",
      uid: getZebuUserId(),
      actid: getZebuAccountId(),
      susertoken: sessionToken,
      source: process.env.ZEBU_SOURCE || "API",
    };

    ws.send(JSON.stringify(connectMessage));
    ws.send(JSON.stringify({ t: "t", k: subscribeKeys }));

    liveConnected = true;
    onDataSource("LIVE_MARKET_API");
    console.log("[Module1/Zebu] Live feed connected");
  });

  ws.on("message", async (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      const records = Array.isArray(payload) ? payload : [payload];

      for (const record of records) {
        // Intercept connection acknowledgement
        if (record && record.t === "ck") {
          if (record.s === "OK") {
            console.log("[Zebu] WebSocket connection acknowledged by server.");
          } else {
            console.error(`[Zebu] WebSocket authentication failed: ${record.msg || record.message || JSON.stringify(record)}`);
            ws.close();
            onFallback(`Socket Authentication Failure: ${record.msg || record.message || "Not Ok"}`);
            return;
          }
        }

        const tick = toTick(record, symbolByKey);
        if (tick) await onTick(tick);
      }
    } catch (error) {
      console.warn("[Module1/Zebu] Ignored malformed market tick payload.");
    }
  });

  ws.on("close", () => {
    wsConnected = false;
    const reason = liveConnected ? "live feed closed" : "live feed closed before connection";
    onDataSource("SIMULATOR");
    onFallback(reason);
  });

  ws.on("error", () => {
    wsConnected = false;
    onDataSource("SIMULATOR");
    onFallback("live feed connection error");
  });

  return {
    close: () => ws.close(),
  };
};
