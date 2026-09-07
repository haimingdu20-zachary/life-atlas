"use client";

import { Compass, LoaderCircle } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";

export default function VisitorSession({ children, initialReady = false }: { children: ReactNode; initialReady?: boolean }) {
  const [ready, setReady] = useState(initialReady);
  const [error, setError] = useState("");
  useEffect(() => {
    if (ready) return;
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("无法建立数据空间");
      setReady(true);
    }).catch(cause => { if ((cause as Error).name !== "AbortError") setError("暂时无法打开，请刷新重试"); });
    return () => controller.abort();
  }, [ready]);
  if (!ready) return <main className="visitor-session-loading"><span><Compass size={24} /></span>{error ? <p>{error}</p> : <><LoaderCircle className="spin" size={18} /><p>正在打开你的人生地图…</p></>}</main>;
  return children;
}
