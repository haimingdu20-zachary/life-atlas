import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await mkdir("dist/standalone/node_modules/sql.js/dist", { recursive: true });
await cp(require.resolve("sql.js/dist/sql-wasm.wasm"), "dist/standalone/node_modules/sql.js/dist/sql-wasm.wasm");
console.log("Volcengine standalone build prepared");
