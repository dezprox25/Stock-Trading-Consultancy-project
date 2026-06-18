import { Request, Response } from "express";
import { activeSessions } from "../services/trackerService";

/**
 * Returns Module 2 configuration status and session count (safe, no secrets exposed)
 */
export const getModule2Status = (req: Request, res: Response) => {
  const isConfigured = !!(process.env.MOD2_API_KEY && process.env.MOD2_API_SECRET);
  res.json({
    status: isConfigured ? "configured" : "missing_credentials",
    activeSessionsCount: Object.keys(activeSessions).length,
  });
};
