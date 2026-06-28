"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load configuration
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
const aetramAuthService_1 = require("../services/aetramAuthService");
const run = async () => {
    console.log("=================================================");
    console.log("STARTING AETRAM INFRASTRUCTURE VERIFICATION");
    console.log("=================================================");
    const status = aetramAuthService_1.aetramAuthService.getStatus();
    console.log(`\nConfigured status: ${status.configured ? "configured" : "Waiting for Production Aetram Configuration"}`);
    if (status.waitingForConfiguration) {
        console.log("✓ CORRECTLY DETECTED: Missing production URLs. Returned safety state.");
    }
    else {
        console.log("✗ ERROR: Did not return the correct safety state.");
        process.exit(1);
    }
    const testReport = aetramAuthService_1.aetramAuthService.simulateTest();
    console.log("\nSimulated Test Report:");
    console.log(JSON.stringify(testReport, null, 2));
    console.log("\n=================================================");
    console.log("AETRAM INFRASTRUCTURE VERIFICATION COMPLETE: PASS");
    console.log("=================================================");
    process.exit(0);
};
run();
