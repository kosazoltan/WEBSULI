import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "dist",
  packages: "external",
  alias: {
    "@shared": path.resolve(__dirname, "shared"),
    "@assets": path.resolve(__dirname, "attached_assets"),
  },
}).catch(() => process.exit(1));

