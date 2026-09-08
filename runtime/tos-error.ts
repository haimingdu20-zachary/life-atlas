/** Normalize TOS errors without retaining credential-bearing HTTP requests. */
export async function storageError(cause: unknown) {
  const source = cause as { statusCode?: number; code?: string; data?: unknown };
  let code = source?.code;
  if (!code && source?.data) {
    try {
      let data = source.data;
      if (typeof data === "object" && data !== null && Symbol.asyncIterator in data) {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of data as AsyncIterable<Uint8Array>) {
          const bytes = Buffer.from(chunk);
          length += bytes.length;
          if (length > 8192) break;
          chunks.push(bytes);
        }
        data = Buffer.concat(chunks).toString("utf8");
      }
      if (Buffer.isBuffer(data)) data = data.toString("utf8");
      if (typeof data === "string") data = JSON.parse(data);
      code = (data as { Code?: string })?.Code;
    } catch { /* Keep the status even if a remote error body is malformed. */ }
  }
  const safeCode = typeof code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(code) ? code : "StorageRequestFailed";
  return Object.assign(new Error(`Cloud storage request failed (${source?.statusCode || 0}: ${safeCode})`), { statusCode: source?.statusCode, code: safeCode });
}
