export type AiProvider = "openai" | "deepseek";
export type AiCredential = { apiKey: string; model: string };
export type AiApiSettings = {
  provider: AiProvider;
  credentials: Record<AiProvider, AiCredential>;
  remember: boolean;
};

const sessionKey = "life-atlas-ai-session";
const persistentKey = "life-atlas-ai-persistent";
const defaults: AiApiSettings = {
  provider: "openai",
  credentials: {
    openai: { apiKey: "", model: "gpt-5.4-mini" },
    deepseek: { apiKey: "", model: "deepseek-v4-flash" },
  },
  remember: false,
};

function normalize(value: unknown, remember: boolean): AiApiSettings {
  const parsed = value as Partial<AiApiSettings> & { apiKey?: string; model?: string };
  if (parsed?.credentials) {
    return {
      provider: parsed.provider === "deepseek" ? "deepseek" : "openai",
      credentials: {
        openai: { ...defaults.credentials.openai, ...parsed.credentials.openai },
        deepseek: { ...defaults.credentials.deepseek, ...parsed.credentials.deepseek },
      },
      remember,
    };
  }
  return { ...defaults, credentials: { ...defaults.credentials, openai: { apiKey: parsed?.apiKey || "", model: parsed?.model || defaults.credentials.openai.model } }, remember };
}

export function loadAiSettings(): AiApiSettings {
  if (typeof window === "undefined") return defaults;
  for (const [storage, key, remember] of [[window.sessionStorage, sessionKey, false], [window.localStorage, persistentKey, true]] as const) {
    try {
      const value = storage.getItem(key);
      if (value) return normalize(JSON.parse(value), remember);
    } catch { /* Ignore malformed local settings. */ }
  }
  return defaults;
}

export function saveAiSettings(settings: AiApiSettings) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(sessionKey);
  window.localStorage.removeItem(persistentKey);
  const storage = settings.remember ? window.localStorage : window.sessionStorage;
  storage.setItem(settings.remember ? persistentKey : sessionKey, JSON.stringify({ provider: settings.provider, credentials: settings.credentials }));
  window.dispatchEvent(new CustomEvent("life-atlas-ai-settings-changed"));
}

export function clearAiSettings() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(sessionKey);
  window.localStorage.removeItem(persistentKey);
  window.dispatchEvent(new CustomEvent("life-atlas-ai-settings-changed"));
}

export function activeAiCredential(settings = loadAiSettings()) {
  return { provider: settings.provider, ...settings.credentials[settings.provider] };
}

export function aiRequestHeaders(): Record<string, string> {
  const active = activeAiCredential();
  return active.apiKey ? { "X-Life-Atlas-Provider": active.provider, "X-Life-Atlas-API-Key": active.apiKey, "X-Life-Atlas-Model": active.model } : { "X-Life-Atlas-Provider": active.provider };
}
