import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";

// data/inventory.json is the single source of truth; serve it in dev and emit it into dist/.
const invPath = path.resolve("data/inventory.json");

export default defineConfig({
  base: "./",
  plugins: [
    {
      name: "inventory-json",
      configureServer(server) {
        server.middlewares.use("/inventory.json", (_req, res) => {
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(fs.readFileSync(invPath));
        });
      },
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "inventory.json", source: fs.readFileSync(invPath) });
      },
    },
  ],
  build: { chunkSizeWarningLimit: 2500 },
});
