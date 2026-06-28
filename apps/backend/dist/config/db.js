"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = async () => {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stock_dashboard";
    const mongoUser = process.env.MONGO_USERNAME || process.env.MONGO_INITDB_ROOT_USERNAME || "";
    const mongoPass = process.env.MONGO_PASSWORD || process.env.MONGO_INITDB_ROOT_PASSWORD || "";
    // Extract database name from URI
    let dbName = "";
    try {
        const parsedUri = mongoUri.split("/");
        const lastPart = parsedUri[parsedUri.length - 1];
        dbName = lastPart.split("?")[0];
    }
    catch (e) {
        dbName = "stock_dashboard";
    }
    const isProduction = process.env.NODE_ENV === "production";
    console.log("[MongoDB] Waiting for database...");
    // Validate configuration at startup
    const missing = [];
    if (!mongoUri)
        missing.push("MONGODB_URI");
    if (!dbName)
        missing.push("Database Name");
    if (isProduction) {
        if (!mongoUser)
            missing.push("MONGO_USERNAME / MONGO_INITDB_ROOT_USERNAME");
        if (!mongoPass)
            missing.push("MONGO_PASSWORD / MONGO_INITDB_ROOT_PASSWORD");
    }
    if (missing.length > 0) {
        console.error("=================================================");
        console.error("[MongoDB] CRITICAL: Configuration Validation Failed!");
        console.error(`Missing fields: ${missing.join(", ")}`);
        console.error("=================================================");
        if (isProduction) {
            console.error("[MongoDB] Shutting down backend due to invalid configuration.");
            process.exit(1);
        }
        else {
            console.warn("[MongoDB] Warning: Local development fallback active. Continuing without authentication.");
        }
    }
    else {
        console.log("[MongoDB] Health Check Passed");
        if (mongoUser && mongoPass) {
            console.log("[MongoDB] Authentication Configured");
        }
    }
    mongoose_1.default.set("bufferCommands", false);
    const selectionTimeout = isProduction ? 10000 : 5000;
    let attempt = 0;
    while (true) {
        try {
            attempt++;
            if (attempt > 1) {
                console.log(`[MongoDB] Retry ${attempt - 1}...`);
            }
            const connectOptions = {
                serverSelectionTimeoutMS: selectionTimeout,
            };
            if (mongoUser && mongoPass) {
                connectOptions.user = mongoUser;
                connectOptions.pass = mongoPass;
                connectOptions.authSource = "admin";
            }
            await mongoose_1.default.connect(mongoUri, connectOptions);
            if (mongoUser && mongoPass) {
                console.log("[MongoDB] Authentication Successful");
            }
            const sanitizedUri = mongoUri.includes("@") ? mongoUri.split("@").pop() : mongoUri;
            console.log("[MongoDB] Connected successfully to:", sanitizedUri);
            console.log("[Backend] Starting Services");
            break;
        }
        catch (err) {
            console.error(`[MongoDB] Connection attempt ${attempt} failed: ${err.message}`);
            // Sleep for 3 seconds before next retry
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
};
exports.connectDB = connectDB;
