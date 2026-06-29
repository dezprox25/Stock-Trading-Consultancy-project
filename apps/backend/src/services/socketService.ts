import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/token";
import { setOnTickReceived } from "./dataFeed";
import { setOnPivotsUpdated, evaluateIndicators } from "./pivotService";
import { Tick, PivotLevels } from "@stock/shared";
import { getLatestModule1OiMetrics } from "./module1OiService";

let ioServer: Server | null = null;

/**
 * Initialize Socket.io server with JWT authentication and room handlers
 */
export const initSocketServer = (io: Server) => {
  ioServer = io;

  // Connection authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== "string") {
      return next(new Error("Authentication failed: Access token missing"));
    }

    try {
      const decoded = verifyAccessToken(token);
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error("Authentication failed: Access token invalid or expired"));
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id} (User: ${socket.data.userId})`);

    // Send initial latest OI metrics immediately on connection
    socket.emit("latest-oi", getLatestModule1OiMetrics());

    // 1. Join room to receive raw price ticks for a specific symbol
    socket.on("join:symbol", (symbol: string) => {
      socket.join(`market:${symbol}`);
      console.log(`[Socket] Client ${socket.id} subscribed to market ticks: ${symbol}`);
    });

    socket.on("leave:symbol", (symbol: string) => {
      socket.leave(`market:${symbol}`);
      console.log(`[Socket] Client ${socket.id} unsubscribed from market ticks: ${symbol}`);
    });

    // 2. Join room to receive real-time indicators (Call/Put signals)
    socket.on(
      "join:indicators",
      async (data: { symbol: string; timeframe: string; method: "classic" | "camarilla" | "fibonacci" }) => {
        const { symbol, timeframe, method } = data;
        const roomName = `indicators:${symbol}:${timeframe}:${method}`;
        socket.join(roomName);
        console.log(`[Socket] Client ${socket.id} subscribed to indicators: ${roomName}`);

        // Push initial indicator state immediately on join
        const indicators = await evaluateIndicators(symbol, timeframe, method);
        if (indicators) {
          socket.emit("indicators", indicators);
        }
      }
    );

    socket.on(
      "leave:indicators",
      (data: { symbol: string; timeframe: string; method: "classic" | "camarilla" | "fibonacci" }) => {
        const { symbol, timeframe, method } = data;
        const roomName = `indicators:${symbol}:${timeframe}:${method}`;
        socket.leave(roomName);
        console.log(`[Socket] Client ${socket.id} unsubscribed from indicators: ${roomName}`);
      }
    );

    // 3. Join room to receive option strike per-minute tracker updates
    socket.on("join:tracker", (sessionId: string) => {
      socket.join(`tracker:${sessionId}`);
      console.log(`[Socket] Client ${socket.id} subscribed to option tracker session: ${sessionId}`);
    });

    socket.on("leave:tracker", (sessionId: string) => {
      socket.leave(`tracker:${sessionId}`);
      console.log(`[Socket] Client ${socket.id} unsubscribed from option tracker session: ${sessionId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Throttling state for indicators and latest-oi updates to prevent CPU/IO flooding
  const lastIndicatorEmitTime = new Map<string, number>();
  const indicatorTimeouts = new Map<string, NodeJS.Timeout>();
  
  let lastLatestOiEmitTime = 0;
  let latestOiTimeout: NodeJS.Timeout | null = null;

  // Wire tick ingestion callback to broadcast raw price updates and trigger real-time indicator updates
  setOnTickReceived(async (tick: Tick) => {
    if (!ioServer) return;

    // Broadcast raw tick to market room
    ioServer.to(`market:${tick.symbol}`).emit("tick", tick);

    // Broadcast latest computed OI metrics at most once every 500ms
    const now = Date.now();
    if (now - lastLatestOiEmitTime >= 500) {
      ioServer.emit("latest-oi", getLatestModule1OiMetrics());
      lastLatestOiEmitTime = now;
      if (latestOiTimeout) {
        clearTimeout(latestOiTimeout);
        latestOiTimeout = null;
      }
    } else if (!latestOiTimeout) {
      latestOiTimeout = setTimeout(() => {
        if (ioServer) {
          ioServer.emit("latest-oi", getLatestModule1OiMetrics());
          lastLatestOiEmitTime = Date.now();
        }
        latestOiTimeout = null;
      }, 500);
    }

    // If this is NIFTY-FUT, trigger indicator evaluations (throttled to at most once per 500ms per active room)
    if (tick.symbol === "NIFTY-FUT") {
      const timeframes = ["1m", "3m", "5m", "custom"];
      const methods = ["classic", "camarilla", "fibonacci"] as const;

      for (const tf of timeframes) {
        for (const m of methods) {
          const roomName = `indicators:${tick.symbol}:${tf}:${m}`;
          
          // Only compute and emit if there are active sockets connected to this room
          const clients = ioServer.sockets.adapter.rooms.get(roomName);
          if (clients && clients.size > 0) {
            const lastEmit = lastIndicatorEmitTime.get(roomName) || 0;
            const currentTime = Date.now();
            
            const performEvaluation = async () => {
              if (!ioServer) return;
              const indicators = await evaluateIndicators(tick.symbol, tf, m);
              if (indicators) {
                ioServer.to(roomName).emit("indicators", indicators);
              }
              lastIndicatorEmitTime.set(roomName, Date.now());
            };

            if (currentTime - lastEmit >= 500) {
              performEvaluation();
              const existingTimeout = indicatorTimeouts.get(roomName);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
                indicatorTimeouts.delete(roomName);
              }
            } else if (!indicatorTimeouts.has(roomName)) {
              const timeout = setTimeout(() => {
                performEvaluation();
                indicatorTimeouts.delete(roomName);
              }, 500);
              indicatorTimeouts.set(roomName, timeout);
            }
          }
        }
      }
    }
  });

  // Wire pivot recalculated callback to broadcast fresh levels
  setOnPivotsUpdated(async (pivots: Record<string, PivotLevels>) => {
    if (!ioServer) return;

    // Broadcast levels for each method
    for (const [method, levels] of Object.entries(pivots)) {
      const roomName = `indicators:${levels.symbol}:${levels.timeframe}:${method}`;
      ioServer.to(roomName).emit("pivots", levels);
    }
  });
};

/**
 * Broadcasts option tracker cell ticks for Module 2 sessions
 */
export const broadcastTrackerUpdate = (sessionId: string, data: any) => {
  if (ioServer) {
    ioServer.to(`tracker:${sessionId}`).emit("tracker_update", data);
  }
};
