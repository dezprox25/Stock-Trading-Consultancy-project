"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load configuration
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
const testZebuAuth_1 = require("./testZebuAuth");
const run = async () => {
    console.log("=================================================");
    console.log("STARTING ZEBU LIFECYCLE PRODUCTION INTEGRATION TEST");
    console.log("=================================================");
    try {
        const report = await (0, testZebuAuth_1.runProductionZebuAuthTest)();
        console.log("\n=================================================");
        console.log("TEST RUN COMPLETE");
        console.log("=================================================");
        console.log(`Overall Status: ${report.overall}`);
        console.log("Steps detail:");
        console.log(JSON.stringify(report.steps, null, 2));
        if (report.overall === "PASS") {
            process.exit(0);
        }
        else {
            process.exit(1);
        }
    }
    catch (error) {
        console.error("Test execution failed with critical error:", error);
        process.exit(1);
    }
};
run();
