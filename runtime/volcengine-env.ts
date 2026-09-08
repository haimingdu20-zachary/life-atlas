import { TosClient } from "@volcengine/tos-sdk";
import { Readable } from "node:stream";
import { SnapshotDatabase, WriteConflict, type SnapshotStore } from "./snapshot-database";
import { storageError } from "./tos-error";

const migrations = import.meta.glob<string>("../drizzle/*.sql", { eager: true, query: "?raw", import: "default" });
let client: TosClient | undefined;

function tos() {
  if (client) return client;
  for (const name of ["ATLAS_TOS_ACCESS_KEY_ID", "ATLAS_TOS_SECRET_ACCESS_KEY", "ATLAS_TOS_BUCKET"]) {
    if (!process.env[name]) throw new Error(`Missing required storage setting: ${name}`);
  }
  client = new TosClient({
    accessKeyId: process.env.ATLAS_TOS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.ATLAS_TOS_SECRET_ACCESS_KEY!,
    region: process.env.ATLAS_TOS_REGION || "cn-beijing",
    endpoint: process.env.ATLAS_TOS_ENDPOINT || "tos-cn-beijing.volces.com",
    maxRetryCount: 0,
  });
  return client;
}

function bucket() { return process.env.ATLAS_TOS_BUCKET!; }
function status(cause: unknown) { return (cause as { statusCode?: number })?.statusCode; }
const key = "life-atlas/database.sqlite";

const store: SnapshotStore = {
  async read() {
    try {
      const object = await tos().getObjectV2({ bucket: bucket(), key, dataType: "buffer" });
      const etag = object.headers.etag;
      if (!etag) throw new Error("Storage returned no ETag; refusing unsafe database writes");
      return { bytes: new Uint8Array(object.data.content), etag };
    } catch (cause) {
      const error = await storageError(cause);
      if (error.statusCode === 404 && error.code === "NoSuchKey") return null;
      throw error;
    }
  },
  async commit(bytes, etag) {
    try {
      await tos().putObject({ bucket: bucket(), key, body: Buffer.from(bytes), contentType: "application/vnd.sqlite3", ...(etag ? { ifMatch: etag } : { forbidOverwrite: true }) });
    } catch (cause) {
      if (status(cause) === 412 || (!etag && status(cause) === 409)) throw new WriteConflict("Snapshot changed");
      throw await storageError(cause);
    }
  },
};

const media = {
  async get(objectKey: string) {
    try {
      const object = await tos().getObjectV2({ bucket: bucket(), key: `life-atlas/media/${objectKey}` });
      return { body: Readable.toWeb(object.data.content as Readable), size: Number(object.headers["content-length"]) };
    } catch (cause) {
      const error = await storageError(cause);
      if (error.statusCode === 404 && error.code === "NoSuchKey") return null;
      throw error;
    }
  },
  async put(objectKey: string, body: ReadableStream, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = Buffer.from(await new Response(body).arrayBuffer());
    try {
      await tos().putObject({ bucket: bucket(), key: `life-atlas/media/${objectKey}`, body: bytes, contentType: options?.httpMetadata?.contentType || "application/octet-stream", forbidOverwrite: true });
    } catch (cause) { throw await storageError(cause); }
  },
  async delete(objectKey: string) {
    try { await tos().deleteObject({ bucket: bucket(), key: `life-atlas/media/${objectKey}` }); }
    catch (cause) { throw await storageError(cause); }
  },
};

export const env = {
  DB: new SnapshotDatabase(store, migrations) as unknown as D1Database,
  MEDIA: media as unknown as R2Bucket,
  get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY; },
  get OPENAI_MODEL() { return process.env.OPENAI_MODEL; },
  get DEEPSEEK_API_KEY() { return process.env.DEEPSEEK_API_KEY; },
  get DEEPSEEK_MODEL() { return process.env.DEEPSEEK_MODEL; },
  get ADMIN_EMAILS() { return process.env.ADMIN_EMAILS; },
};
