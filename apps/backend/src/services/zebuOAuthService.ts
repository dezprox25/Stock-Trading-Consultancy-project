import axios from "axios";
import crypto from "crypto";

const sha256 = (text: string) => {
  return crypto.createHash("sha256").update(text).digest("hex");
};

// Centralized Token Manager
class ZebuTokenManager {
  private token: string | null = null;
  private expiresAt: Date | null = null;
  private isForcedExpired: boolean = false;
  private tokenLifetimeMs = 24 * 60 * 60 * 1000; // 24 hours default

  public getToken(): string | null {
    if (this.isTokenExpired()) {
      return null;
    }
    return this.token;
  }

  public setToken(token: string, lifetimeMs: number = this.tokenLifetimeMs): void {
    this.token = token;
    this.expiresAt = new Date(Date.now() + lifetimeMs);
    this.isForcedExpired = false;
    console.log(`[Zebu] Token Stored (Expires at: ${this.expiresAt.toISOString()})`);
  }

  public clearToken(): void {
    this.token = null;
    this.expiresAt = null;
    this.isForcedExpired = false;
    console.log(`[Zebu] Token Cleared`);
  }

  public isTokenValid(): boolean {
    return !!this.token && !this.isTokenExpired();
  }

  public isTokenExpired(): boolean {
    if (this.isForcedExpired) {
      return true;
    }
    if (!this.token || !this.expiresAt) {
      return true;
    }
    return Date.now() > this.expiresAt.getTime();
  }

  public forceExpire(): void {
    this.isForcedExpired = true;
    console.log(`[Zebu] Token Expired (Forced Expiry Simulated)`);
  }
}

export const tokenManager = new ZebuTokenManager();

let inMemoryAuthCode: string | null = null;
let ignoreEnvToken = false;

export const setIgnoreEnvToken = (val: boolean) => {
  ignoreEnvToken = val;
};

const isPlaceholder = (value?: string) =>
  !value || value.includes("your-") || value.includes("placeholder");

const getClientId = () => process.env.ZEBU_CLIENT_ID || "";
const getUserId = () => process.env.ZEBU_USER_ID || getClientId();
const getApiKey = () => process.env.MOD1_API_KEY || process.env.BROKER_API_KEY || "";
const getApiSecret = () => process.env.MOD1_API_SECRET || process.env.BROKER_API_SECRET || "";
const getRedirectUrl = () => process.env.ZEBU_REDIRECT_URL || process.env.REDIRECT_URL || "";
const getTokenUrl = () => process.env.ZEBU_OAUTH_TOKEN_URL || "";
const getAuthorizeUrl = () => process.env.ZEBU_OAUTH_AUTHORIZE_URL || "";
const getAuthCode = () => inMemoryAuthCode || process.env.ZEBU_AUTH_CODE || "";

export const setZebuAuthCode = (code: string) => {
  inMemoryAuthCode = code;
};

export const getZebuOAuthMissingConfig = () => {
  const missing: string[] = [];

  if (isPlaceholder(getClientId())) missing.push("ZEBU_CLIENT_ID");
  if (isPlaceholder(getApiKey())) missing.push("MOD1_API_KEY or BROKER_API_KEY");
  if (isPlaceholder(getApiSecret())) missing.push("MOD1_API_SECRET or BROKER_API_SECRET");
  if (isPlaceholder(getRedirectUrl())) missing.push("ZEBU_REDIRECT_URL or REDIRECT_URL");
  if (isPlaceholder(getTokenUrl())) missing.push("ZEBU_OAUTH_TOKEN_URL");
  if (isPlaceholder(getAuthCode())) missing.push("ZEBU_AUTH_CODE or callback code");

  return missing;
};

export const hasZebuOAuthConfig = () => getZebuOAuthMissingConfig().length === 0;

export const buildZebuAuthorizeUrl = () => {
  const authorizeUrl = getAuthorizeUrl();
  if (isPlaceholder(authorizeUrl)) return null;

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", getClientId());
  url.searchParams.set("userid", getUserId());
  url.searchParams.set("redirect_uri", getRedirectUrl());
  url.searchParams.set("response_type", "code");
  return url.toString();
};

const extractSessionToken = (payload: any) =>
  payload?.susertoken ||
  payload?.sessionToken ||
  payload?.session_token ||
  payload?.access_token ||
  payload?.token ||
  payload?.data?.susertoken ||
  payload?.data?.sessionToken ||
  payload?.data?.access_token;

export const getCachedZebuSessionToken = () => tokenManager.getToken();

export const resolveZebuSessionToken = async () => {
  // Check token manager cache first
  const cachedToken = tokenManager.getToken();
  if (cachedToken) return cachedToken;

  if (!ignoreEnvToken) {
    const envToken = process.env.ZEBU_SUSERTOKEN || process.env.ZEBU_SESSION_TOKEN;
    if (!isPlaceholder(envToken)) {
      tokenManager.setToken(envToken!);
      return envToken!;
    }
  }

  // 1. Try QuickAuth Direct Login first if credentials exist
  const uid = (process.env.ZEBU_USER_ID || process.env.ZEBU_CLIENT_ID || "").trim();
  const pwd = (process.env.ZEBU_PASSWORD || "").trim();
  const factor2 = (process.env.ZEBU_FACTOR2 || "").trim();
  const vc = (process.env.ZEBU_VENDOR_CODE || "").trim();
  const appkey = (process.env.MOD1_API_KEY || process.env.BROKER_API_KEY || "").trim();
  const loginUrl = (process.env.ZEBU_LOGIN_URL || "").trim();

  if (uid && pwd && factor2 && vc && appkey && loginUrl) {
    try {
      console.log("[ZebuAuth] Attempting direct QuickAuth login...");
      const pwdHash = sha256(pwd);
      const appkeyHash = sha256(`${uid}|${appkey}`);
      
      const payload = {
        apkversion: "1.0.0",
        uid,
        pwd: pwdHash,
        factor2,
        imei: (process.env.ZEBU_IMEI || "abc1234").trim(),
        source: "API",
        vc,
        appkey: appkeyHash
      };

      const dataString = `jData=${JSON.stringify(payload)}`;
      const response = await axios.post(loginUrl, dataString, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      });

      if (response.data && response.data.stat === "Ok" && response.data.susertoken) {
        console.log("[ZebuAuth] QuickAuth login successful.");
        tokenManager.setToken(response.data.susertoken);
        return response.data.susertoken;
      } else {
        console.warn("[ZebuAuth] QuickAuth login failed, response:", response.data);
      }
    } catch (err: any) {
      console.error("[ZebuAuth] QuickAuth login error:", err?.message || err);
    }
  }

  if (!hasZebuOAuthConfig()) return null;

  const brokerApiKey = `${getUserId()}:::${getClientId()}`;
  const response = await axios.post(
    getTokenUrl(),
    {
      code: getAuthCode(),
      redirect_uri: getRedirectUrl(),
      grant_type: "authorization_code",
      client_id: getClientId(),
      api_key: getApiKey(),
      broker_api_key: brokerApiKey,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
        "x-api-secret": getApiSecret(),
        "x-broker-api-key": brokerApiKey,
        "x-broker-api-secret": getApiSecret(),
      },
    },
  );

  const token = extractSessionToken(response.data);
  if (!token || typeof token !== "string") {
    throw new Error("Zebu OAuth token response did not include a session token.");
  }

  tokenManager.setToken(token);
  return token;
};

export const getZebuOAuthStatus = () => ({
  hasCachedSessionToken: tokenManager.isTokenValid(),
  authorizeUrl: buildZebuAuthorizeUrl(),
  missing: getZebuOAuthMissingConfig(),
});

// Reusable Authentication Error Handler
export const isZebuAuthError = (error: any): boolean => {
  if (!error) return false;

  // 1. Axios / HTTP Errors
  if (error.response) {
    const status = error.response.status;
    if (status === 401 || status === 403) {
      return true;
    }
    const data = error.response.data;
    if (data) {
      const dataStr = typeof data === "string" ? data : JSON.stringify(data);
      const lower = dataStr.toLowerCase();
      if (
        lower.includes("unauthorized") ||
        lower.includes("forbidden") ||
        lower.includes("invalid session") ||
        lower.includes("expired session") ||
        lower.includes("invalid token") ||
        lower.includes("session expired") ||
        lower.includes("token expired") ||
        lower.includes("not_ok") ||
        lower.includes("not ok")
      ) {
        return true;
      }
    }
  }

  // 2. Generic Errors or Custom Message Strings
  const errMsg = typeof error === "string" ? error : error.message || "";
  const lowerMsg = errMsg.toLowerCase();
  if (
    lowerMsg.includes("401") ||
    lowerMsg.includes("403") ||
    lowerMsg.includes("unauthorized") ||
    lowerMsg.includes("forbidden") ||
    lowerMsg.includes("invalid session") ||
    lowerMsg.includes("expired session") ||
    lowerMsg.includes("invalid token") ||
    lowerMsg.includes("session expired") ||
    lowerMsg.includes("token expired") ||
    lowerMsg.includes("socket authentication failure") ||
    lowerMsg.includes("not_ok") ||
    lowerMsg.includes("not ok")
  ) {
    return true;
  }

  return false;
};

export const handleZebuAuthError = (error: any) => {
  console.log(`[Zebu] Authentication Failed: ${typeof error === "string" ? error : error.message || JSON.stringify(error)}`);
  console.log(`[Zebu] Token Expired`);
  tokenManager.clearToken();
  setIgnoreEnvToken(true);
};
