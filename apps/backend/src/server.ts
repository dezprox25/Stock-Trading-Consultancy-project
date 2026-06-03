import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import dotenv from "dotenv";

// Load configuration parameters
dotenv.config();

import { connectDB } from "./config/db";
import redis from "./config/redis";
import authRouter from "./routes/auth";
import marketRouter from "./routes/market";
import trackerRouter from "./routes/tracker";
import { initPivotService } from "./services/pivotService";
import { initDataFeed } from "./services/dataFeed";
import { initSocketServer } from "./services/socketService";
import { initTrackerEngine } from "./services/trackerService";

const app = express();
const server = http.createServer(app);

// Configure socket server base
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT"],
    credentials: true,
  },
  pingTimeout: 60000,
});

// Security & utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: "*", // In production this will match the client URL
    credentials: true,
  })
);
app.use(express.json());

// Mount authentication router
app.use("/auth", authRouter);
app.use("/api/auth", authRouter);

// Mount market and tracker routers
app.use("/api", marketRouter);
app.use("/api/module2", trackerRouter);

// Global Rate Limiter (Applied to general REST routes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per window
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", globalLimiter);

// Health Check Endpoint
app.get("/health", async (req, res) => {
  const mongoStatus = mongooseConnectionStatus();
  let redisStatus = "disconnected";

  try {
    await redis.ping();
    redisStatus = "connected";
  } catch (err) {
    redisStatus = "error";
  }

  res.json({
    status: "healthy",
    timestamp: new Date(),
    services: {
      mongodb: mongoStatus,
      redis: redisStatus,
    },
  });
});

// Mongoose connection status resolver
function mongooseConnectionStatus() {
  const states: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const mongoose = require("mongoose");
  return states[mongoose.connection.readyState] || "unknown";
}

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Application Error:", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Establish MongoDB Atlas Connection
  await connectDB();

  // Validate Redis Connection
  try {
    const redisPingResult = await redis.ping();
    console.log("Redis cache ping successful:", redisPingResult);
  } catch (error) {
    console.error("Warning: Redis cache could not be contacted:", error);
  }

  // Initialize core trading services
  initPivotService();
  initSocketServer(io);
  initTrackerEngine();
  initDataFeed();

  // Start HTTP / WebSocket Server
  server.listen(PORT, () => {
    console.log(
      `[Server] Live Trading Display Dashboard listening on port ${PORT} in ${
        process.env.NODE_ENV || "development"
      } mode.`
    );
  });
};

startServer().catch((error) => {
  console.error("Fatal: Backend server failed to start:", error);
  process.exit(1);
});

export { app, server, io };
