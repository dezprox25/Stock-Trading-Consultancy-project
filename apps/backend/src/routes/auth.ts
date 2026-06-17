import { Router } from "express";
import rateLimit from "express-rate-limit";
import { register, login, refresh, logout } from "../controllers/auth";
import { authenticate } from "../middleware/auth";

const router = Router();

// Specific rate limiting for login and registration requests (15 requests per 15 minutes)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Too many authentication requests. Please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", authRateLimiter, register);
router.post("/login", authRateLimiter, login);
router.post("/refresh", refresh);
router.post("/logout", authenticate, logout);

export default router;
