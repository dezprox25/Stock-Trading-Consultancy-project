import dotenv from "dotenv";
import path from "path";

// Load configuration
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { aetramAuthService } from "../services/aetramAuthService";

const run = async () => {
  console.log("=================================================");
  console.log("STARTING AETRAM INFRASTRUCTURE VERIFICATION");
  console.log("=================================================");
  
  const status = aetramAuthService.getStatus();
  console.log(`\nConfigured status: ${status.configured ? "configured" : "Waiting for Production Aetram Configuration"}`);
  
  if (status.waitingForConfiguration) {
    console.log("✓ CORRECTLY DETECTED: Missing production URLs. Returned safety state.");
  } else {
    console.log("✗ ERROR: Did not return the correct safety state.");
    process.exit(1);
  }

  const testReport = aetramAuthService.simulateTest();
  console.log("\nSimulated Test Report:");
  console.log(JSON.stringify(testReport, null, 2));

  console.log("\n=================================================");
  console.log("AETRAM INFRASTRUCTURE VERIFICATION COMPLETE: PASS");
  console.log("=================================================");
  process.exit(0);
};

run();
