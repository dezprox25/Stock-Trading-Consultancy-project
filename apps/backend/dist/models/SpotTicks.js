"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpotTicks = void 0;
const mongoose_1 = require("mongoose");
const SpotTicksSchema = new mongoose_1.Schema({
    symbol: {
        type: String,
        required: true,
        index: true,
    },
    ltp: {
        type: Number,
        required: true,
    },
    timestamp: {
        type: Date,
        required: true,
        index: true,
    },
    volume: {
        type: Number,
        default: 0,
    },
});
// TTL index to automatically delete records older than 24 hours (86400 seconds)
SpotTicksSchema.index({ timestamp: 1 }, { expireAfterSeconds: 86400 });
exports.SpotTicks = (0, mongoose_1.model)("SpotTicks", SpotTicksSchema);
