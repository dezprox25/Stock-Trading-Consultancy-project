import { Router } from "express";
import { getModule2Status, runAetramAuthTestEndpoint } from "../controllers/module2";

const router = Router();

// Endpoint to check configuration status and session statistics
router.get("/status", getModule2Status);
router.get("/test-auth", runAetramAuthTestEndpoint);

export default router;
