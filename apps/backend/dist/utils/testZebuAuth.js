"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runProductionZebuAuthTest = void 0;
const zebuOAuthService_1 = require("../services/zebuOAuthService");
const zebuAuthService_1 = require("../services/zebuAuthService");
const runProductionZebuAuthTest = async () => {
    const steps = [];
    const runStep = async (name, fn) => {
        try {
            await fn();
            steps.push({ name, status: "PASS" });
            console.log(`[Test] PASSED: ${name}`);
        }
        catch (err) {
            const errorMsg = err?.message || String(err);
            steps.push({ name, status: "FAIL", error: errorMsg });
            console.error(`[Test] FAILED: ${name} -> ${errorMsg}`);
            throw err; // Halt the sequence on failure
        }
    };
    try {
        // 1. Initial Login
        await runStep("Initial Login", async () => {
            (0, zebuOAuthService_1.setIgnoreEnvToken)(false); // Start clean
            const token = await zebuAuthService_1.zebuAuthService.login();
            if (!token) {
                throw new Error("No token returned from login.");
            }
        });
        // 2. Session Token Created & Stored
        await runStep("Session Token Created & Stored", async () => {
            const token = zebuOAuthService_1.tokenManager.getToken();
            if (!token) {
                throw new Error("Token was not saved in TokenManager.");
            }
            if (!zebuOAuthService_1.tokenManager.isTokenValid()) {
                throw new Error("TokenManager reports token as invalid.");
            }
        });
        // 3. Feed Connected
        await runStep("Feed Connected", async () => {
            await zebuAuthService_1.zebuAuthService.connectFeed();
            // Wait up to 5 seconds for WebSocket to connect
            let connected = false;
            for (let i = 0; i < 50; i++) {
                const status = zebuAuthService_1.zebuAuthService.getStatus();
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
            zebuOAuthService_1.tokenManager.forceExpire();
            if (!zebuOAuthService_1.tokenManager.isTokenExpired()) {
                throw new Error("TokenManager did not report token as expired.");
            }
        });
        // 5. Token Cleared
        await runStep("Token Cleared", async () => {
            const token = zebuOAuthService_1.tokenManager.getToken();
            if (token !== null) {
                throw new Error("getToken() did not return null for expired token.");
            }
        });
        // 6. Re-authentication Successful & New Token Generated
        await runStep("Re-authentication Successful & New Token Generated", async () => {
            // Bypassing environmental tokens so it uses login method
            (0, zebuOAuthService_1.setIgnoreEnvToken)(true);
            const prevLoginTime = zebuAuthService_1.zebuAuthService.getStatus().lastLoginTime;
            // Attempt connectFeed while token is expired; should auto-authenticate first
            await zebuAuthService_1.zebuAuthService.connectFeed();
            const newStatus = zebuAuthService_1.zebuAuthService.getStatus();
            if (!zebuOAuthService_1.tokenManager.isTokenValid()) {
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
                const status = zebuAuthService_1.zebuAuthService.getStatus();
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
    }
    catch (err) {
        console.error("[Test] Test halted early due to failure.");
    }
    finally {
        // Restore clean state
        (0, zebuOAuthService_1.setIgnoreEnvToken)(false);
    }
    const overall = steps.every((s) => s.status === "PASS") && steps.length === 7 ? "PASS" : "FAIL";
    return {
        overall,
        steps,
        timestamp: new Date().toISOString(),
    };
};
exports.runProductionZebuAuthTest = runProductionZebuAuthTest;
