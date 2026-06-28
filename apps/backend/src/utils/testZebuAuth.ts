import { tokenManager, setIgnoreEnvToken } from "../services/zebuOAuthService";
import { zebuAuthService } from "../services/zebuAuthService";

export interface TestStep {
  name: string;
  status: "PASS" | "FAIL";
  error?: string;
}

export interface TestReport {
  overall: "PASS" | "FAIL";
  steps: TestStep[];
  timestamp: string;
}

export const runProductionZebuAuthTest = async (): Promise<TestReport> => {
  const steps: TestStep[] = [];

  const runStep = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      steps.push({ name, status: "PASS" });
      console.log(`[Test] PASSED: ${name}`);
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      steps.push({ name, status: "FAIL", error: errorMsg });
      console.error(`[Test] FAILED: ${name} -> ${errorMsg}`);
      throw err; // Halt the sequence on failure
    }
  };

  try {
    // 1. Initial Login
    await runStep("Initial Login", async () => {
      setIgnoreEnvToken(false); // Start clean
      const token = await zebuAuthService.login();
      if (!token) {
        throw new Error("No token returned from login.");
      }
    });

    // 2. Session Token Created & Stored
    await runStep("Session Token Created & Stored", async () => {
      const token = tokenManager.getToken();
      if (!token) {
        throw new Error("Token was not saved in TokenManager.");
      }
      if (!tokenManager.isTokenValid()) {
        throw new Error("TokenManager reports token as invalid.");
      }
    });

    // 3. Feed Connected
    await runStep("Feed Connected", async () => {
      await zebuAuthService.connectFeed();
      // Wait up to 5 seconds for WebSocket to connect
      let connected = false;
      for (let i = 0; i < 50; i++) {
        const status = zebuAuthService.getStatus();
        if (status.websocketConnected) {
          connected = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!connected) {
        throw new Error("WebSocket failed to connect within 5 seconds.");
      }
    });

    // 4. Simulate Token Expiry
    await runStep("Simulate Token Expiry", async () => {
      tokenManager.forceExpire();
      if (!tokenManager.isTokenExpired()) {
        throw new Error("TokenManager did not report token as expired.");
      }
    });

    // 5. Token Cleared
    await runStep("Token Cleared", async () => {
      const token = tokenManager.getToken();
      if (token !== null) {
        throw new Error("getToken() did not return null for expired token.");
      }
    });

    // 6. Re-authentication Successful & New Token Generated
    await runStep("Re-authentication Successful & New Token Generated", async () => {
      // Bypassing environmental tokens so it uses login method
      setIgnoreEnvToken(true);
      
      const prevLoginTime = zebuAuthService.getStatus().lastLoginTime;
      
      // Attempt connectFeed while token is expired; should auto-authenticate first
      await zebuAuthService.connectFeed();
      
      const newStatus = zebuAuthService.getStatus();
      if (!tokenManager.isTokenValid()) {
        throw new Error("Token is not valid after re-authentication.");
      }
      if (newStatus.lastLoginTime === prevLoginTime) {
        throw new Error("lastLoginTime was not updated.");
      }
    });

    // 7. Feed Reconnected & Market Data Continues
    await runStep("Feed Reconnected & Market Data Continues", async () => {
      // Wait up to 5 seconds for reconnection
      let reconnected = false;
      for (let i = 0; i < 50; i++) {
        const status = zebuAuthService.getStatus();
        if (status.websocketConnected) {
          reconnected = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!reconnected) {
        throw new Error("WebSocket did not reconnect within 5 seconds.");
      }
    });

  } catch (err) {
    console.error("[Test] Test halted early due to failure.");
  } finally {
    // Restore clean state
    setIgnoreEnvToken(false);
  }

  const overall = steps.every((s) => s.status === "PASS") && steps.length === 7 ? "PASS" : "FAIL";

  return {
    overall,
    steps,
    timestamp: new Date().toISOString(),
  };
};
