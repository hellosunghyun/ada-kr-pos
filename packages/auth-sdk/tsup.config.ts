import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/hono.ts", "src/express.ts", "src/generic.ts"],
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
