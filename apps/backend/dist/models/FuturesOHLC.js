"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuturesOHLC = void 0;
const mongoose_1 = require("mongoose");
const FuturesOHLCSchema = new mongoose_1.Schema({
    symbol: {
        type: String,
        required: true,
        index: true,
    },
    timeframe: {
        type: String,
        required: true,
        index: true,
    },
    bar_open: {
        type: Number,
        required: true,
    },
    bar_high: {
        type: Number,
        required: true,
    },
    bar_low: {
        type: Number,
        required: true,
    },
    bar_close: {
        type: Number,
        required: true,
    },
    bar_time: {
        type: Date,
        required: true,
        index: true,
    },
    volume: {
        type: Number,
        default: 0,
    },
});
// Index to query the latest candles for pivot calculation
FuturesOHLCSchema.index({ symbol: 1, timeframe: 1, bar_time: -1 });
exports.FuturesOHLC = (0, mongoose_1.model)("FuturesOHLC", FuturesOHLCSchema);
