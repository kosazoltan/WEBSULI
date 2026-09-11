import { defineConfig } from "@playwright/test";
import config from "./playwright.game-release.config";

// Real admin frontend; API fixtures avoid connecting local tests to production.
export default defineConfig({ ...config, testMatch: ["workflow.spec.ts"] });
