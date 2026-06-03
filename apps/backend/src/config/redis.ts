import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

class MockRedis {
  private store = new Map<string, string>();
  
  async get(key: string) {
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: string) {
    this.store.set(key, value);
    return "OK";
  }
  
  async setex(key: string, seconds: number, value: string) {
    this.store.set(key, value);
    setTimeout(() => this.store.delete(key), seconds * 1000);
    return "OK";
  }
  
  async ping() {
    return "PONG (In-Memory Mock Mode)";
  }
  
  on(event: string, callback: Function) {
    if (event === "connect") {
      setTimeout(() => callback(), 50);
    }
    return this;
  }
}

let activeClient: any;

try {
  activeClient = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 1500,
  });

  activeClient.on("error", (err: any) => {
    if (!(activeClient instanceof MockRedis)) {
      console.warn("[Redis] Connection failed. Falling back to local in-memory Mock Redis cache.");
      const oldClient = activeClient;
      activeClient = new MockRedis();
      try {
        oldClient.disconnect();
      } catch (e) {
        // ignore error during disconnect
      }
    }
  });
} catch (error) {
  console.warn("[Redis] Initialization failed. Falling back to local in-memory Mock Redis cache.");
  activeClient = new MockRedis();
}

// Proxy wrapper to expose the active client dynamically to all modules importing it
const proxy = new Proxy({}, {
  get(target, prop, receiver) {
    const value = activeClient[prop];
    if (typeof value === "function") {
      return function (...args: any[]) {
        return value.apply(activeClient, args);
      };
    }
    return value;
  }
});

export default proxy;
export { Redis };

