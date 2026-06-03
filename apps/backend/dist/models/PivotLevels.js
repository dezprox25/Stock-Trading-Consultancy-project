"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PivotLevels = void 0;
const mongoose_1 = require("mongoose");
const PivotLevelsSchema = new mongoose_1.Schema({
    symbol: {
        type: String,
        required: true,
        index: true,
    },
    date: {
        type: Date,
        required: true,
    },
    timeframe: {
        type: String,
        enum: ["1m", "3m", "5m", "custom"],
        required: true,
    },
    method: {
        type: String,
        enum: ["classic", "camarilla", "fibonacci"],
        required: true,
    },
    pivot: {
        type: Number,
        required: true,
    },
    r1: { type: Number, required: true },
    r2: { type: Number, required: true },
    r3: { type: Number, required: true },
    r4: { type: Number }, // Optional, Camarilla exclusive
    s1: { type: Number, required: true },
    s2: { type: Number, required: true },
    s3: { type: Number, required: true },
    s4: { type: Number }, // Optional, Camarilla exclusive
    computed_at: {
        type: Date,
        default: Date.now,
        index: true,
    },
});
// Compound Index to fetch computed pivots quickly
PivotLevelsSchema.index({ symbol: 1, timeframe: 1, computed_at: -1 });
exports.PivotLevels = (0, mongoose_1.model)("PivotLevels", PivotLevelsSchema);
