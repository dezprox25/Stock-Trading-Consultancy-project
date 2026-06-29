"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSecrets = exports.config = exports.maskSecret = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// In development, load local .env file
if (process.env.NODE_ENV !== "production") {
    dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../../.env") });
    dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
}
const maskSecret = (val) => {
    if (!val)
        return "********";
    if (val.length <= 4)
        return "****";
    return `${val[0]}*****${val[val.length - 1]}`;
};
exports.maskSecret = maskSecret;
const getEnv = (key, required = false, fallback = "") => {
    const val = process.env[key];
    if (!val && required) {
        throw new Error(`CRITICAL CONFIGURATION ERROR: Required environment variable "${key}" is missing.`);
    }
    return (val || fallback).trim();
};
exports.config = {
    port: parseInt(process.env.PORT || "5001", 10),
    nodeEnv: process.env.NODE_ENV || "development",
    jwt: {
        secret: getEnv("JWT_SECRET", true),
        refreshSecret: getEnv("JWT_REFRESH_SECRET", true),
    },
    mongodb: {
        uri: getEnv("MONGODB_URI", false, "mongodb://127.0.0.1:27017/stock_dashboard"),
        username: process.env.MONGO_USERNAME || process.env.MONGO_INITDB_ROOT_USERNAME || "",
        password: process.env.MONGO_PASSWORD || process.env.MONGO_INITDB_ROOT_PASSWORD || "",
    },
    zebu: {
        clientId: getEnv("ZEBU_CLIENT_ID"),
        userId: getEnv("ZEBU_USER_ID"),
        apiKey: getEnv("MOD1_API_KEY") || getEnv("BROKER_API_KEY"),
        apiSecret: getEnv("MOD1_API_SECRET") || getEnv("BROKER_API_SECRET"),
        password: getEnv("ZEBU_PASSWORD"),
        factor2: getEnv("ZEBU_FACTOR2"),
    },
    dynamicAtm: {
        enabled: getEnv("ENABLE_DYNAMIC_ATM", false, "false") === "true",
        masterContractUrl: getEnv("ATM_MASTER_CONTRACT_URL", false, "https://go.mynt.in/NFO_symbols.txt.zip"),
        refreshIntervalMs: parseInt(getEnv("ATM_MASTER_REFRESH_INTERVAL", false, "86400000"), 10),
        strikeRange: parseInt(getEnv("ATM_STRIKE_RANGE", false, "5"), 10),
        expiryStrategy: getEnv("ATM_EXPIRY_STRATEGY", false, "nearest"),
    }
};
const validateSecrets = () => {
    const isProduction = exports.config.nodeEnv === "production";
    console.log("=================================================");
    console.log("[Security] Validating Environment Configurations...");
    console.log("=================================================");
    console.log(`[Config] NODE_ENV=${exports.config.nodeEnv}`);
    console.log(`[Config] JWT_SECRET=${(0, exports.maskSecret)(exports.config.jwt.secret)}`);
    console.log(`[Config] JWT_REFRESH_SECRET=${(0, exports.maskSecret)(exports.config.jwt.refreshSecret)}`);
    console.log(`[Config] MONGODB_URI=${exports.config.mongodb.uri}`);
    console.log(`[Config] MONGO_USERNAME=${(0, exports.maskSecret)(exports.config.mongodb.username)}`);
    console.log(`[Config] MONGO_PASSWORD=${(0, exports.maskSecret)(exports.config.mongodb.password)}`);
    console.log(`[Config] ZEBU_CLIENT_ID=${exports.config.zebu.clientId}`);
    console.log(`[Config] ZEBU_API_KEY=${(0, exports.maskSecret)(exports.config.zebu.apiKey)}`);
    console.log(`[Config] ZEBU_PASSWORD=${(0, exports.maskSecret)(exports.config.zebu.password)}`);
    console.log(`[Config] ENABLE_DYNAMIC_ATM=${exports.config.dynamicAtm.enabled}`);
    console.log(`[Config] ATM_STRIKE_RANGE=${exports.config.dynamicAtm.strikeRange}`);
    const missingSecrets = [];
    if (!exports.config.jwt.secret)
        missingSecrets.push("JWT_SECRET");
    if (!exports.config.jwt.refreshSecret)
        missingSecrets.push("JWT_REFRESH_SECRET");
    if (isProduction) {
        if (!exports.config.mongodb.username)
            missingSecrets.push("MONGO_USERNAME / MONGO_INITDB_ROOT_USERNAME");
        if (!exports.config.mongodb.password)
            missingSecrets.push("MONGO_PASSWORD / MONGO_INITDB_ROOT_PASSWORD");
        if (!exports.config.zebu.apiKey)
            missingSecrets.push("MOD1_API_KEY / BROKER_API_KEY");
        if (!exports.config.zebu.apiSecret)
            missingSecrets.push("MOD1_API_SECRET / BROKER_API_SECRET");
        if (!exports.config.zebu.password)
            missingSecrets.push("ZEBU_PASSWORD");
        if (!exports.config.zebu.factor2)
            missingSecrets.push("ZEBU_FACTOR2");
    }
    if (missingSecrets.length > 0) {
        console.error("=================================================");
        console.error(`[Security] CRITICAL CONFIGURATION FAULT: Missing secrets: ${missingSecrets.join(", ")}`);
        console.error("=================================================");
        throw new Error(`Critical secrets missing: ${missingSecrets.join(", ")}`);
    }
    console.log("[Security] Environment Configuration Validation Successful.");
    console.log("=================================================");
};
exports.validateSecrets = validateSecrets;
