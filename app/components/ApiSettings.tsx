"use client";

import { AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, Trash2, X } from "lucide-react";
import { useState } from "react";
import { clearAiSettings, loadAiSettings, saveAiSettings, type AiCredential, type AiProvider } from "../lib/ai-settings";

export default function ApiSettings({ onClose }: { onClose: () => void }) {
  const [initial] = useState(() => loadAiSettings());
  const [provider, setProvider] = useState<AiProvider>(initial.provider);
  const [credentials, setCredentials] = useState(initial.credentials);
  const [remember, setRemember] = useState(initial.remember);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const active = credentials[provider];
  const providerName = provider === "deepseek" ? "DeepSeek" : "OpenAI";

  const updateActive = (patch: Partial<AiCredential>) => setCredentials(current => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  const switchProvider = (next: AiProvider) => { setProvider(next); setStatus(null); setShowKey(false); };

  const testConnection = async () => {
    if (!active.apiKey.trim()) return setStatus({ type: "error", message: "请先输入 API Key" });
    setTesting(true); setStatus(null);
    try {
      const response = await fetch("/api/ai/test", { method: "POST", headers: { "X-Life-Atlas-Provider": provider, "X-Life-Atlas-API-Key": active.apiKey.trim(), "X-Life-Atlas-Model": active.model.trim() } });
      const data = await response.json() as { ok?: boolean; model?: string; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error || "连接失败");
      setStatus({ type: "success", message: `${providerName} 连接成功，可使用模型 ${data.model || active.model}` });
    } catch (cause) { setStatus({ type: "error", message: cause instanceof Error ? cause.message : "连接失败" }); }
    finally { setTesting(false); }
  };

  const save = () => {
    if (!active.apiKey.trim()) return setStatus({ type: "error", message: "请先输入 API Key" });
    if (!active.model.trim()) return setStatus({ type: "error", message: "请输入模型 ID" });
    saveAiSettings({ provider, credentials: { ...credentials, [provider]: { apiKey: active.apiKey.trim(), model: active.model.trim() } }, remember });
    setStatus({ type: "success", message: `${providerName} ${remember ? "已保存到此设备" : "已为本次会话启用"}` });
  };

  const disconnect = () => {
    clearAiSettings();
    setCredentials({ openai: { apiKey: "", model: "gpt-5.4-mini" }, deepseek: { apiKey: "", model: "deepseek-v4-flash" } });
    setProvider("openai");
    setStatus({ type: "success", message: "已断开所有 API，将继续使用本地智能整理" });
  };

  return (
    <div className="api-settings-backdrop">
      <section className="api-settings-panel" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
        <header><div className="api-settings-icon"><KeyRound /></div><div><small>AI CONNECTION</small><h2 id="api-settings-title">连接 AI API</h2><p>可选择 OpenAI 或 DeepSeek，两家的密钥和模型分开保存。</p></div><button onClick={onClose} aria-label="关闭 API 设置"><X /></button></header>
        <div className="api-settings-body">
          <div className="provider-switch" aria-label="AI 提供商"><button className={provider === "openai" ? "active" : ""} aria-pressed={provider === "openai"} onClick={() => switchProvider("openai")}>OpenAI</button><button className={provider === "deepseek" ? "active" : ""} aria-pressed={provider === "deepseek"} onClick={() => switchProvider("deepseek")}>DeepSeek</button></div>
          <label><span>{providerName} API Key</span><div className="api-key-field"><input type={showKey ? "text" : "password"} value={active.apiKey} onChange={event => updateActive({ apiKey: event.target.value })} placeholder={provider === "deepseek" ? "sk-..." : "sk-proj-..."} autoComplete="off" /><button type="button" onClick={() => setShowKey(value => !value)} aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}>{showKey ? <EyeOff /> : <Eye />}</button></div><small>密钥只用于你主动发起的整理请求，不会写入人生记录数据库。</small></label>
          <label><span>模型 ID</span><input list={`${provider}-models`} value={active.model} onChange={event => updateActive({ model: event.target.value })} placeholder={provider === "deepseek" ? "deepseek-v4-flash" : "gpt-5.4-mini"} /><datalist id="openai-models"><option value="gpt-5.4-mini" /><option value="gpt-5.6-luna" /><option value="gpt-5.6-terra" /></datalist><datalist id="deepseek-models"><option value="deepseek-v4-flash" /></datalist><small>{provider === "deepseek" ? "DeepSeek Responses API 目前使用 deepseek-v4-flash。" : "可输入你账户可用的 OpenAI 模型。"}</small></label>
          <div className="remember-api"><input id="remember-ai-api" aria-label="记住在此设备" type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><label htmlFor="remember-ai-api"><strong>记住在此设备</strong><small>关闭浏览器后仍保留。仅建议在自己的私人电脑上启用。</small></label></div>
          {status && <div className={`api-test-status ${status.type}`}>{status.type === "success" ? <CheckCircle2 /> : <AlertCircle />}{status.message}</div>}
          <a className="api-key-link" href={provider === "deepseek" ? "https://platform.deepseek.com/api_keys" : "https://platform.openai.com/api-keys"} target="_blank" rel="noreferrer">前往 {providerName} 创建 API Key <ExternalLink size={13} /></a>
        </div>
        <footer><button className="disconnect-api" type="button" onClick={disconnect}><Trash2 size={14} />断开连接</button><span /><button type="button" onClick={testConnection} disabled={testing}>{testing && <LoaderCircle className="spin" />}测试连接</button><button className="save-api" type="button" onClick={save}>保存并启用</button></footer>
      </section>
    </div>
  );
}
