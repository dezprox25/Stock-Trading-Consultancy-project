"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
exports.Redis = ioredis_1.default;
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
let redis;
class MockRedis {
    store = new Map();
    async get(key) {
        return this.store.get(key) || null;
    }
    async set(key, value) {
        this.store.set(key, value);
        return "OK";
    }
    async setex(key, seconds, value) {
        this.store.set(key, value);
        setTimeout(() => this.store.delete(key), seconds * 1000);
        return "OK";
    }
    async ping() {
        return "PONG (In-Memory Mock Mode)";
    }
    on(event, callback) {
        if (event === "connect") {
            setTimeout(() => callback(), 50);
        }
        return this;
    }
}
try {
    redis = new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
    });
    redis.on("error", (err) => {
        if (!(redis instanceof MockRedis)) {
            console.warn("[Redis] Connection failed. Falling back to local in-memory Mock Redis cache.");
            redis = new MockRedis();
        }
    });
}
catch (error) {
    console.warn("[Redis] Initialization failed. Falling back to local in-memory Mock Redis cache.");
    redis = new MockRedis();
}
exports.default = redis;
