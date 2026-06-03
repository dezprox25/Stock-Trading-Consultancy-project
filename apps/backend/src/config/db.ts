import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stock_dashboard";
    
    // Disable query buffering so that requests fail immediately instead of hanging
    mongoose.set("bufferCommands", false);
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 1500, // 1.5 seconds timeout
    });
    console.log("MongoDB connected successfully to:", mongoUri);
  } catch (error) {
    console.warn("[MongoDB] Connection failed. Falling back to local in-memory mock database mode.");
    // We deliberately do not exit the process so the application can run in demo mode.
  }
};
