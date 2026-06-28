import dotenv from "dotenv";
import path from "path";

// Load configuration
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { runProductionZebuAuthTest } from "./testZebuAuth";

const run = async () => {
  console.log("=================================================");
  console.log("STARTING ZEBU LIFECYCLE PRODUCTION INTEGRATION TEST");
  console.log("=================================================");
  
  try {
    const report = await runProductionZebuAuthTest();
    console.log("\n=================================================");
    console.log("TEST RUN COMPLETE");
    console.log("=================================================");
    console.log(`Overall Status: ${report.overall}`);
    console.log("Steps detail:");
    console.log(JSON.stringify(report.steps, null, 2));
    
    if (report.overall === "PASS") {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed with critical error:", error);
    process.exit(1);
  }
};

run();
