import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/hono.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
  external: ["hono"],
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".js",
    };
  },
});
