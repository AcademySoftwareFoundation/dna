import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],      // your public entry
  format: ["esm", "cjs"],       // ESM for Vite/browser, CJS for Node users
  dts: true,                    // emit .d.ts
  clean: true,
  sourcemap: true,
  treeshake: true,
  minify: false,                // set true for publishing if you like
  target: "ES2020",             // safe modern baseline for Vite/esbuild
});