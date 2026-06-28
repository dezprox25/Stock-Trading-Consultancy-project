"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAetramAuthTestEndpoint = exports.getModule2Status = void 0;
const trackerService_1 = require("../services/trackerService");
const module2InteractiveDataService_1 = require("../services/module2InteractiveDataService");
/**
 * Returns Module 2 configuration status and session count (safe, no secrets exposed)
 */
const getModule2Status = (req, res) => {
    const { aetramAuthService } = require("../services/aetramAuthService");
    const authStatus = aetramAuthService.getStatus();
    const dataSource = (0, module2InteractiveDataService_1.getModule2DataSource)();
    return res.status(200).json({
        configured: authStatus.configured,
        authenticated: authStatus.authenticated,
        waitingForConfiguration: authStatus.waitingForConfiguration,
        marketDataConnected: authStatus.marketDataConnected,
        optionChainConnected: authStatus.optionChainConnected,
        feedConnected: authStatus.feedConnected,
        lastLoginTime: authStatus.lastLoginTime,
        lastReconnect: authStatus.lastReconnect,
        retryCount: authStatus.retryCount,
        // Existing fields kept intact for backward compatibility
        status: authStatus.configured ? "configured" : "Waiting for Production Aetram Configuration",
        message: authStatus.configured ? "configured" : "Waiting for Production Aetram Configuration",
        dataSource,
        missingRequirements: dataSource === "UNAVAILABLE" ? (0, module2InteractiveDataService_1.getModule2MissingInteractiveConfig)() : [],
        activeSessionsCount: Object.keys(trackerService_1.activeSessions).length,
    });
};
exports.getModule2Status = getModule2Status;
/**
 * Executes simulated authentication lifecycle test for Aetram (Module 2)
 */
const runAetramAuthTestEndpoint = (req, res) => {
    const { aetramAuthService } = require("../services/aetramAuthService");
    const report = aetramAuthService.simulateTest();
    if (typeof report === "string") {
        return res.status(200).json({ message: report });
    }
    if (report.message) {
        return res.status(200).json({ message: report.message });
    }
    return res.status(200).json(report);
};
exports.runAetramAuthTestEndpoint = runAetramAuthTestEndpoint;
