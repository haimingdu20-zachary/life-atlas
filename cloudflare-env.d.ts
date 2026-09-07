declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS: Fetcher;
    MEDIA: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    ADMIN_EMAILS?: string;
  }
}
