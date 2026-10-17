import dotenv from "dotenv";
import { isE2eMode } from "./e2e-mode";

// In e2e mode source/.env (production DATABASE_URL, DEV_DATABASE_URL, …) must not leak into the process:
// the test harness passes everything the server needs explicitly.
if (!isE2eMode()) dotenv.config();
