// Run explicitly with deployment credentials; uses only new disposable objects.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { TosClient } from "@volcengine/tos-sdk";

for (const key of ["ATLAS_TOS_ACCESS_KEY_ID", "ATLAS_TOS_SECRET_ACCESS_KEY", "ATLAS_TOS_BUCKET"]) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}
const client = new TosClient({
  accessKeyId: process.env.ATLAS_TOS_ACCESS_KEY_ID,
  accessKeySecret: process.env.ATLAS_TOS_SECRET_ACCESS_KEY,
  region: process.env.ATLAS_TOS_REGION || "cn-beijing",
  endpoint: process.env.ATLAS_TOS_ENDPOINT || "tos-cn-beijing.volces.com",
  maxRetryCount: 0,
});
const bucket = process.env.ATLAS_TOS_BUCKET;
const key = `life-atlas/deployment-check/${randomUUID()}`;
let created = false;
try {
  await client.putObject({ bucket, key, body: Buffer.from("first"), forbidOverwrite: true });
  created = true;
  const original = await client.getObjectV2({ bucket, key, dataType: "buffer" });
  assert.equal(original.data.content.toString(), "first");
  const etag = original.headers.etag;
  assert.ok(etag, "The snapshot must have an ETag");
  await assert.rejects(
    client.putObject({ bucket, key, body: Buffer.from("duplicate"), forbidOverwrite: true }),
    error => [409, 412].includes(error.statusCode),
    "Initial writes must not overwrite an existing object",
  );
  await client.putObject({ bucket, key, body: Buffer.from("second"), ifMatch: etag });
  await assert.rejects(
    client.putObject({ bucket, key, body: Buffer.from("stale"), ifMatch: etag }),
    error => error.statusCode === 412,
    "A stale snapshot must never overwrite the current snapshot",
  );
  const latest = await client.getObjectV2({ bucket, key, dataType: "buffer" });
  assert.equal(latest.data.content.toString(), "second");
  const stream = await client.getObjectV2({ bucket, key });
  const chunks = [];
  for await (const chunk of stream.data.content) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), "second");
  console.log("TOS upload, download, streaming and conditional writes passed.");
} catch (error) {
  // Do not print SDK request objects, which contain credential-bearing headers.
  console.error("TOS check failed:", error.name, error.statusCode || "", error.code || "", error instanceof assert.AssertionError ? error.message : "");
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      await client.deleteObject({ bucket, key });
      console.log("Disposable storage check object removed.");
    } catch (error) {
      console.error("Storage check cleanup failed:", error.statusCode || "", error.code || "");
      process.exitCode = 1;
    }
  }
}
