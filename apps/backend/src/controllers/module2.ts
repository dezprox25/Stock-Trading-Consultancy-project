import { Request, Response } from "express";
import { activeSessions } from "../services/trackerService";
import { getModule2DataSource, getModule2MissingInteractiveConfig } from "../services/module2InteractiveDataService";

/**
 * Returns Module 2 configuration status and session count (safe, no secrets exposed)
 */
export const getModule2Status = (req: Request, res: Response) => {
  const { aetramAuthService } = require("../services/aetramAuthService");
  const authStatus = aetramAuthService.getStatus();
  
  const dataSource = getModule2DataSource();
  
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
    missingRequirements: dataSource === "UNAVAILABLE" ? getModule2MissingInteractiveConfig() : [],
    activeSessionsCount: Object.keys(activeSessions).length,
  });
};

/**
 * Executes simulated authentication lifecycle test for Aetram (Module 2)
 */
export const runAetramAuthTestEndpoint = (req: Request, res: Response) => {
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
