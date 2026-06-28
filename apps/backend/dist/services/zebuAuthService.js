"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zebuAuthService = void 0;
const zebuOAuthService_1 = require("./zebuOAuthService");
const zebuMarketDataClient_1 = require("./zebuMarketDataClient");
class ZebuAuthService {
    lastLoginTime = null;
    lastReconnect = null;
    retryCount = 0;
    isConnecting = false;
    wsConnected = false;
    activeClient = null;
    reconnectTimeout = null;
    onTickCallback = null;
    onDataSourceCallback = null;
    onFallbackCallback = null;
    getStatus() {
        const authenticated = zebuOAuthService_1.tokenManager.isTokenValid();
        return {
            authenticated,
            sessionActive: authenticated && this.wsConnected,
            websocketConnected: this.wsConnected,
            lastLoginTime: this.lastLoginTime ? this.lastLoginTime.toISOString() : null,
            lastReconnect: this.lastReconnect ? this.lastReconnect.toISOString() : null,
            retryCount: this.retryCount,
        };
    }
    // Login / Re-authenticate
    async login() {
        console.log("[Zebu] Login Started");
        try {
            const token = await (0, zebuOAuthService_1.resolveZebuSessionToken)();
            if (!token) {
                throw new Error("Failed to generate Zebu session token.");
            }
            this.lastLoginTime = new Date();
            console.log("[Zebu] Login Successful");
            console.log("[Zebu] Session Token Generated");
            return token;
        }
        catch (error) {
            console.log("[Zebu] Authentication Failed");
            throw error;
        }
    }
    setWebsocketConnected(connected) {
        this.wsConnected = connected;
        if (connected) {
            this.lastReconnect = new Date();
            this.retryCount = 0;
            console.log("[Zebu] WebSocket Connected");
            console.log("[Zebu] Reconnected Successfully");
        }
    }
    // Starts the data feed loop with exponential backoff & token expiry checks
    async startFeed(onTick, onDataSource, onFallback) {
        this.onTickCallback = onTick;
        this.onDataSourceCallback = onDataSource;
        this.onFallbackCallback = onFallback;
        this.retryCount = 0;
        await this.connectFeed();
    }
    async connectFeed() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.isConnecting)
            return;
        this.isConnecting = true;
        try {
            // Check token status before reconnecting
            if (zebuOAuthService_1.tokenManager.isTokenExpired()) {
                console.log("[Zebu] Token Expired");
                console.log("[Zebu] Re-authenticating...");
                await this.login();
                console.log("[Zebu] New Session Token Generated");
            }
            // Close previous client if any
            if (this.activeClient) {
                try {
                    this.activeClient.close();
                }
                catch (e) { }
                this.activeClient = null;
            }
            this.activeClient = (0, zebuMarketDataClient_1.startZebuMarketDataFeed)(async (tick) => {
                if (this.onTickCallback)
                    await this.onTickCallback(tick);
            }, (src) => {
                if (src === "LIVE_MARKET_API") {
                    this.setWebsocketConnected(true);
                }
                else {
                    this.wsConnected = false;
                }
                if (this.onDataSourceCallback)
                    this.onDataSourceCallback(src);
            }, async (reason) => {
                this.wsConnected = false;
                console.log(`[Zebu] Feed connection callback message received: ${reason}`);
                // Check if this was an auth error
                if ((0, zebuOAuthService_1.isZebuAuthError)(reason)) {
                    (0, zebuOAuthService_1.handleZebuAuthError)(reason);
                }
                this.handleReconnect();
            });
        }
        catch (err) {
            this.wsConnected = false;
            console.error("[Zebu] Error during connectFeed:", err?.message || err);
            if ((0, zebuOAuthService_1.isZebuAuthError)(err)) {
                (0, zebuOAuthService_1.handleZebuAuthError)(err);
            }
            this.handleReconnect();
        }
        finally {
            this.isConnecting = false;
        }
    }
    handleReconnect() {
        if (this.reconnectTimeout)
            return;
        if (this.retryCount >= 5) {
            console.log("[Zebu] [Zebu] Authentication Failed");
            console.error("[Zebu] Critical Error: Max reconnect retries reached. Active feed stopped.");
            if (this.onFallbackCallback) {
                this.onFallbackCallback("Max reconnect retries reached");
            }
            return;
        }
        this.retryCount++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delayMs = Math.min(Math.pow(2, this.retryCount - 1) * 1000, 16000);
        console.log(`[Zebu] Reconnect scheduled in ${delayMs / 1000} seconds (Retry ${this.retryCount}/5)...`);
        this.reconnectTimeout = setTimeout(async () => {
            await this.connectFeed();
        }, delayMs);
    }
    async forceReauthenticate() {
        console.log("[Zebu] Forcing manual re-authentication...");
        zebuOAuthService_1.tokenManager.clearToken();
        if (this.activeClient) {
            try {
                this.activeClient.close();
            }
            catch (e) { }
        }
        await this.connectFeed();
    }
    stopFeed() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.activeClient) {
            try {
                this.activeClient.close();
            }
            catch (e) { }
            this.activeClient = null;
        }
        this.wsConnected = false;
    }
}
exports.zebuAuthService = new ZebuAuthService();
