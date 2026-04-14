import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: "es2020",
  outDir: "dist",
  banner: {
    js: `/**
 * @heyblank-labs/json-flux v0.1.0
 * Flow, shape, and transform JSON effortlessly
 * MIT License
 */`,
  },
});
