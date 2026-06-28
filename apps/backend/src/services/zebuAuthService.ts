import { tokenManager, isZebuAuthError, handleZebuAuthError, resolveZebuSessionToken } from "./zebuOAuthService";
import { startZebuMarketDataFeed } from "./zebuMarketDataClient";
import { Tick } from "@stock/shared";

interface SessionStatus {
  authenticated: boolean;
  sessionActive: boolean;
  websocketConnected: boolean;
  lastLoginTime: string | null;
  lastReconnect: string | null;
  retryCount: number;
}

class ZebuAuthService {
  private lastLoginTime: Date | null = null;
  private lastReconnect: Date | null = null;
  private retryCount: number = 0;
  private isConnecting: boolean = false;
  private wsConnected: boolean = false;
  private activeClient: { close: () => void } | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  private onTickCallback: ((tick: Tick) => Promise<void>) | null = null;
  private onDataSourceCallback: ((dataSource: "LIVE_MARKET_API" | "SIMULATOR") => void) | null = null;
  private onFallbackCallback: ((reason: string) => void) | null = null;

  public getStatus(): SessionStatus {
    const authenticated = tokenManager.isTokenValid();
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
  public async login(): Promise<string> {
    console.log("[Zebu] Login Started");
    try {
      const token = await resolveZebuSessionToken();
      if (!token) {
        throw new Error("Failed to generate Zebu session token.");
      }
      this.lastLoginTime = new Date();
      console.log("[Zebu] Login Successful");
      console.log("[Zebu] Session Token Generated");
      return token;
    } catch (error) {
      console.log("[Zebu] Authentication Failed");
      throw error;
    }
  }

  public setWebsocketConnected(connected: boolean) {
    this.wsConnected = connected;
    if (connected) {
      this.lastReconnect = new Date();
      this.retryCount = 0;
      console.log("[Zebu] WebSocket Connected");
      console.log("[Zebu] Reconnected Successfully");
    }
  }

  // Starts the data feed loop with exponential backoff & token expiry checks
  public async startFeed(
    onTick: (tick: Tick) => Promise<void>,
    onDataSource: (dataSource: "LIVE_MARKET_API" | "SIMULATOR") => void,
    onFallback: (reason: string) => void
  ) {
    this.onTickCallback = onTick;
    this.onDataSourceCallback = onDataSource;
    this.onFallbackCallback = onFallback;
    this.retryCount = 0;
    
    await this.connectFeed();
  }

  public async connectFeed() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      // Check token status before reconnecting
      if (tokenManager.isTokenExpired()) {
        console.log("[Zebu] Token Expired");
        console.log("[Zebu] Re-authenticating...");
        await this.login();
        console.log("[Zebu] New Session Token Generated");
      }

      // Close previous client if any
      if (this.activeClient) {
        try {
          this.activeClient.close();
        } catch (e) {}
        this.activeClient = null;
      }

      this.activeClient = startZebuMarketDataFeed(
        async (tick) => {
          if (this.onTickCallback) await this.onTickCallback(tick);
        },
        (src) => {
          if (src === "LIVE_MARKET_API") {
            this.setWebsocketConnected(true);
          } else {
            this.wsConnected = false;
          }
          if (this.onDataSourceCallback) this.onDataSourceCallback(src);
        },
        async (reason) => {
          this.wsConnected = false;
          console.log(`[Zebu] Feed connection callback message received: ${reason}`);
          
          // Check if this was an auth error
          if (isZebuAuthError(reason)) {
            handleZebuAuthError(reason);
          }

          this.handleReconnect();
        }
      );
    } catch (err: any) {
      this.wsConnected = false;
      console.error("[Zebu] Error during connectFeed:", err?.message || err);
      if (isZebuAuthError(err)) {
        handleZebuAuthError(err);
      }
      this.handleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private handleReconnect() {
    if (this.reconnectTimeout) return;

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

  public async forceReauthenticate() {
    console.log("[Zebu] Forcing manual re-authentication...");
    tokenManager.clearToken();
    if (this.activeClient) {
      try {
        this.activeClient.close();
      } catch (e) {}
    }
    await this.connectFeed();
  }

  public stopFeed() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.activeClient) {
      try {
        this.activeClient.close();
      } catch (e) {}
      this.activeClient = null;
    }
    this.wsConnected = false;
  }
}

export const zebuAuthService = new ZebuAuthService();
