import { Schema, model } from "mongoose";

const Module2SessionSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    session_type: {
      type: String,
      enum: ["CE", "PE", "mixed"],
      required: true,
    },
    index_symbol: {
      type: String,
      required: true,
    },
    expiry_date: {
      type: String,
      required: true,
    },
    selected_strikes_json: {
      type: [String],
      default: [],
    },
    day_open_prices_json: {
      type: Object, // Map of strike -> baseline price
      default: {},
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

export const Module2Session = model("Module2Session", Module2SessionSchema);
