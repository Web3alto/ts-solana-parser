import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/lib.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: [
    "@solana/kit",
    "@solana-program/address-lookup-table",
    "zod",
    "node:zlib",
  ],
  tsconfig: "tsconfig.build.json",
});
