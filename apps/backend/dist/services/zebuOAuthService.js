"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getZebuOAuthStatus = exports.resolveZebuSessionToken = exports.getCachedZebuSessionToken = exports.buildZebuAuthorizeUrl = exports.hasZebuOAuthConfig = exports.getZebuOAuthMissingConfig = exports.setZebuAuthCode = void 0;
const axios_1 = __importDefault(require("axios"));
let inMemorySessionToken = null;
let inMemoryAuthCode = null;
const isPlaceholder = (value) => !value || value.includes("your-") || value.includes("placeholder");
const getClientId = () => process.env.ZEBU_CLIENT_ID || "";
const getUserId = () => process.env.ZEBU_USER_ID || getClientId();
const getApiKey = () => process.env.MOD1_API_KEY || process.env.BROKER_API_KEY || "";
const getApiSecret = () => process.env.MOD1_API_SECRET || process.env.BROKER_API_SECRET || "";
const getRedirectUrl = () => process.env.ZEBU_REDIRECT_URL || process.env.REDIRECT_URL || "";
const getTokenUrl = () => process.env.ZEBU_OAUTH_TOKEN_URL || "";
const getAuthorizeUrl = () => process.env.ZEBU_OAUTH_AUTHORIZE_URL || "";
const getAuthCode = () => inMemoryAuthCode || process.env.ZEBU_AUTH_CODE || "";
const setZebuAuthCode = (code) => {
    inMemoryAuthCode = code;
};
exports.setZebuAuthCode = setZebuAuthCode;
const getZebuOAuthMissingConfig = () => {
    const missing = [];
    if (isPlaceholder(getClientId()))
        missing.push("ZEBU_CLIENT_ID");
    if (isPlaceholder(getApiKey()))
        missing.push("MOD1_API_KEY or BROKER_API_KEY");
    if (isPlaceholder(getApiSecret()))
        missing.push("MOD1_API_SECRET or BROKER_API_SECRET");
    if (isPlaceholder(getRedirectUrl()))
        missing.push("ZEBU_REDIRECT_URL or REDIRECT_URL");
    if (isPlaceholder(getTokenUrl()))
        missing.push("ZEBU_OAUTH_TOKEN_URL");
    if (isPlaceholder(getAuthCode()))
        missing.push("ZEBU_AUTH_CODE or callback code");
    return missing;
};
exports.getZebuOAuthMissingConfig = getZebuOAuthMissingConfig;
const hasZebuOAuthConfig = () => (0, exports.getZebuOAuthMissingConfig)().length === 0;
exports.hasZebuOAuthConfig = hasZebuOAuthConfig;
const buildZebuAuthorizeUrl = () => {
    const authorizeUrl = getAuthorizeUrl();
    if (isPlaceholder(authorizeUrl))
        return null;
    const url = new URL(authorizeUrl);
    url.searchParams.set("client_id", getClientId());
    url.searchParams.set("userid", getUserId());
    url.searchParams.set("redirect_uri", getRedirectUrl());
    url.searchParams.set("response_type", "code");
    return url.toString();
};
exports.buildZebuAuthorizeUrl = buildZebuAuthorizeUrl;
const extractSessionToken = (payload) => payload?.susertoken ||
    payload?.sessionToken ||
    payload?.session_token ||
    payload?.access_token ||
    payload?.token ||
    payload?.data?.susertoken ||
    payload?.data?.sessionToken ||
    payload?.data?.access_token;
const getCachedZebuSessionToken = () => inMemorySessionToken;
exports.getCachedZebuSessionToken = getCachedZebuSessionToken;
const resolveZebuSessionToken = async () => {
    if (inMemorySessionToken)
        return inMemorySessionToken;
    const envToken = process.env.ZEBU_SUSERTOKEN || process.env.ZEBU_SESSION_TOKEN;
    if (!isPlaceholder(envToken)) {
        inMemorySessionToken = envToken;
        return inMemorySessionToken;
    }
    if (!(0, exports.hasZebuOAuthConfig)())
        return null;
    const brokerApiKey = `${getUserId()}:::${getClientId()}`;
    const response = await axios_1.default.post(getTokenUrl(), {
        code: getAuthCode(),
        redirect_uri: getRedirectUrl(),
        grant_type: "authorization_code",
        client_id: getClientId(),
        api_key: getApiKey(),
        broker_api_key: brokerApiKey,
    }, {
        headers: {
            "Content-Type": "application/json",
            "x-api-key": getApiKey(),
            "x-api-secret": getApiSecret(),
            "x-broker-api-key": brokerApiKey,
            "x-broker-api-secret": getApiSecret(),
        },
    });
    const token = extractSessionToken(response.data);
    if (!token || typeof token !== "string") {
        throw new Error("Zebu OAuth token response did not include a session token.");
    }
    inMemorySessionToken = token;
    return inMemorySessionToken;
};
exports.resolveZebuSessionToken = resolveZebuSessionToken;
const getZebuOAuthStatus = () => ({
    hasCachedSessionToken: Boolean(inMemorySessionToken),
    authorizeUrl: (0, exports.buildZebuAuthorizeUrl)(),
    missing: (0, exports.getZebuOAuthMissingConfig)(),
});
exports.getZebuOAuthStatus = getZebuOAuthStatus;
