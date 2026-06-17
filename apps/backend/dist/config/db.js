"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI ||
            "mongodb://127.0.0.1:27017/stock_dashboard";
        mongoose_1.default.set("bufferCommands", false);
        await mongoose_1.default.connect(mongoUri, {
            serverSelectionTimeoutMS: 1500,
        });
        console.log("MongoDB connected successfully to:", mongoUri);
    }
    catch (error) {
        console.warn("[MongoDB] Connection failed. Falling back to local in-memory mock database mode.");
    }
};
exports.connectDB = connectDB;
