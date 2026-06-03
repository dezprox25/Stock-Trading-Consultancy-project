import { Schema, model } from "mongoose";

const SpotTicksSchema = new Schema({
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

export const SpotTicks = model("SpotTicks", SpotTicksSchema);
