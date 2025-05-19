#!/usr/bin/env node

import { startServer } from "./server.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const wasmPath = process.argv[2];

  if (!wasmPath) {
    console.error("Please provide a path to a WASM file");
    process.exit(1);
  }

  try {
    // Convert to absolute path if it's relative
    const absoluteWasmPath = path.isAbsolute(wasmPath)
      ? wasmPath
      : path.resolve(process.cwd(), wasmPath);

    await startServer(absoluteWasmPath);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main();
