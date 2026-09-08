"use client";

import { useState, type FormEvent } from "react";
import { Compass } from "lucide-react";

export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!response.ok) { const data = await response.json() as { error?: string }; throw new Error(data.error || "暂时无法解锁，请稍后再试"); }
      window.location.assign("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "连接失败，请稍后再试"); setBusy(false); }
  }
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "radial-gradient(circle at 50% 35%, #173a42, #061116 70%)", color: "#e3eeea" }}>
    <form onSubmit={unlock} style={{ width: "100%", maxWidth: 360, display: "grid", gap: 18 }}>
      <Compass size={42} color="#ff9c69" />
      <h1 style={{ margin: 0, fontSize: 28 }}>你的人生地图</h1>
      <p style={{ margin: 0, color: "#9ab2ad", lineHeight: 1.7 }}>把走过的地方，留成自己的故事。<br />输入访问口令，打开你的私人记录。</p>
      <label htmlFor="password">访问口令</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} style={{ minHeight: 48, width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 16, borderRadius: 12, border: "1px solid #405a57", background: "#102528", color: "#fff" }} />
      {error && <p role="alert" style={{ color: "#ffb39b", margin: 0 }}>{error}</p>}
      <button disabled={busy} type="submit" style={{ minHeight: 48, border: 0, borderRadius: 12, background: "#ff9c69", color: "#182525", fontWeight: 600, fontSize: 16 }}>{busy ? "正在打开…" : "打开人生地图"}</button>
    </form>
  </main>;
}
