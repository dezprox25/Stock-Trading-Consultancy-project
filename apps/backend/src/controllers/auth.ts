import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/User";
import { Watchlist } from "../models/Watchlist";
import { RegisterSchema, LoginSchema } from "@stock/shared";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/token";
import redis from "../config/redis";
import { sendOtpEmail } from "../services/emailService";

// Helper to parse cookies manually from raw header
const getCookie = (req: Request, name: string): string | null => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").reduce((acc, curr) => {
    const [k, v] = curr.split("=");
    if (k && v) {
      acc[k.trim()] = decodeURIComponent(v.trim());
    }
    return acc;
  }, {} as Record<string, string>);
  return cookies[name] || null;
};

// Generate a 6-digit OTP
const generateOtp = (): string =>
  crypto.randomInt(100000, 999999).toString();

// User Registration — saves user unverified, sends OTP
export const register = async (req: Request, res: Response) => {
  try {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { email, password, name } = parseResult.data;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (!existingUser.isVerified) {
        // Resend OTP for unverified users
        const otp = generateOtp();
        existingUser.otpCode = otp;
        existingUser.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
        await existingUser.save();
        await sendOtpEmail(email, otp);
        return res.status(200).json({
          message: "Account pending verification. A new OTP has been sent to your email.",
          requiresVerification: true,
          email,
        });
      }
      return res.status(409).json({ error: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    const newUser = await User.create({
      email,
      password: hashedPassword,
      name,
      status: "active",
      isVerified: false,
      otpCode: otp,
      otpExpires,
    });

    await Watchlist.create({
      user_id: newUser._id,
      symbols_json: [],
      column_prefs_json: {},
    });

    // Send OTP email
    try {
      await sendOtpEmail(email, otp);
    } catch (mailErr) {
      console.error("[Auth] Failed to send OTP email:", mailErr);
      // Still return success but warn about email
      return res.status(201).json({
        message: "Account created but OTP email failed to send. Check SMTP config.",
        requiresVerification: true,
        email,
        _devOtp: process.env.NODE_ENV === "development" ? otp : undefined,
      });
    }

    return res.status(201).json({
      message: "Account created! Check your email for the verification code.",
      requiresVerification: true,
      email,
    });
  } catch (error) {
    console.error("Registration Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Verify OTP — confirms email and activates account
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "Account is already verified" });
    }

    if (!user.otpCode || !user.otpExpires) {
      return res.status(400).json({ error: "No OTP found. Please register again." });
    }

    if (new Date() > user.otpExpires) {
      return res.status(400).json({ error: "OTP has expired. Please register again to get a new one." });
    }

    if (user.otpCode !== otp.trim()) {
      return res.status(400).json({ error: "Incorrect OTP. Please try again." });
    }

    // Mark verified and clear OTP
    user.isVerified = true;
    user.otpCode = null as any;
    user.otpExpires = null as any;
    await user.save();

    // Auto-login after verification
    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    res.cookie("refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Email verified successfully!",
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// User Login — blocks unverified accounts
export const login = async (req: Request, res: Response) => {
  try {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.errors });
    }

    const { email, password } = parseResult.data;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isVerified) {
      // Resend OTP so they can verify
      const otp = generateOtp();
      user.otpCode = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      try { await sendOtpEmail(email, otp); } catch (_) {}
      return res.status(403).json({
        error: "Email not verified. A new OTP has been sent to your email.",
        requiresVerification: true,
        email,
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match || user.status === "inactive") {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user._id.toString());
    const refreshToken = generateRefreshToken(user._id.toString());

    res.cookie("refresh", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// Token Refresh
export const refresh = async (req: Request, res: Response) => {
  try {
    const refreshToken = getCookie(req, "refresh");
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token not provided" });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);

    if (!user || user.status === "inactive") {
      return res.status(401).json({ error: "User is no longer active" });
    }

    const newAccessToken = generateAccessToken(user._id.toString());

    return res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Token Refresh Error:", error);
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
};

// User Logout
export const logout = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.exp) {
          const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
          if (ttl > 0) {
            await redis.setex(`blacklist:${token}`, ttl, "1");
          }
        }
      } catch (_) {}
    }

    res.clearCookie("refresh", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};
