"use client";

import {
  Activity, Bot, BookOpen, Database, ExternalLink, FileAudio, Film, Gauge, HardDrive,
  Image as ImageIcon, LayoutDashboard, MapPin, RefreshCw, Route, Search, ShieldCheck,
  Target, Trash2, UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { aiRequestHeaders } from "../lib/ai-settings";

type Section = "overview" | "entries" | "goals" | "tracks" | "system";
type AdminIdentity = { displayName: string; email: string; local: boolean };
type EntryRow = { id: string; title: string; occurredAt: string; locationName: string; category: string; visibility: string; emotion: string; significance: number; createdAt: string };
type GoalRow = { id: string; title: string; targetDate: string; domain: string; status: string; progress: number; locationName: string; createdAt: string };
type TrackRow = { id: string; title: string; startDate: string; endDate: string; status: string; progress: number; color: string; createdAt: string };
type MediaType = { type: "image" | "video" | "audio" | "file"; count: number; bytes: number };
type AdminData = {
  identity: AdminIdentity;
  stats: { entries: number; goals: number; activeGoals: number; tracks: number; mediaCount: number; mediaBytes: number };
  entries: EntryRow[];
  goals: GoalRow[];
  tracks: TrackRow[];
  mediaTypes: MediaType[];
  years: Array<{ year: string; count: number }>;
  generatedAt: string;
};

const navItems: Array<{ key: Section; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "数据概览", icon: LayoutDashboard },
  { key: "entries", label: "经历管理", icon: BookOpen },
  { key: "goals", label: "目标管理", icon: Target },
  { key: "tracks", label: "人生主线", icon: Route },
  { key: "system", label: "媒体与系统", icon: HardDrive },
];
const categoryLabels: Record<string, string> = { growth: "成长", adventure: "探索", work: "作品", relationship: "关系", health: "身心", reflection: "反思" };
const domainLabels: Record<string, string> = { career: "事业", relationship: "关系", health: "身心", creation: "创作", wealth: "财富", exploration: "探索" };
const statusLabels: Record<string, string> = { planned: "未开始", active: "进行中", complete: "已完成", paused: "暂缓" };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function AdminDashboard({ initialIdentity }: { initialIdentity: AdminIdentity }) {
  const [active, setActive] = useState<Section>("overview");
  const [data, setData] = useState<AdminData | null>(null);
  const [aiStatus, setAiStatus] = useState<{ mode: string; model: string; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [overviewResponse, aiResponse] = await Promise.all([
        fetch("/api/admin/overview", { cache: "no-store" }),
        fetch("/api/ai/refine", { headers: aiRequestHeaders(), cache: "no-store" }),
      ]);
      const overview = await overviewResponse.json() as AdminData & { error?: string };
      if (!overviewResponse.ok) throw new Error(overview.error || "后台数据加载失败");
      setData(overview);
      if (aiResponse.ok) setAiStatus(await aiResponse.json() as { mode: string; model: string; configured: boolean });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "后台数据加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const removeRecord = async (kind: "entry" | "goal" | "track", id: string, title: string) => {
    if (!window.confirm(`确定删除“${title}”吗？此操作无法撤销。`)) return;
    setDeleting(`${kind}-${id}`); setError("");
    try {
      const response = await fetch(`/api/admin/records?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("删除失败，请稍后重试");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除失败"); }
    finally { setDeleting(""); }
  };

  const query = search.trim().toLowerCase();
  const entries = useMemo(() => (data?.entries || []).filter(item => !query || `${item.title} ${item.locationName} ${categoryLabels[item.category] || item.category}`.toLowerCase().includes(query)), [data?.entries, query]);
  const goals = useMemo(() => (data?.goals || []).filter(item => !query || `${item.title} ${item.locationName} ${domainLabels[item.domain] || item.domain}`.toLowerCase().includes(query)), [data?.goals, query]);
  const tracks = useMemo(() => (data?.tracks || []).filter(item => !query || item.title.toLowerCase().includes(query)), [data?.tracks, query]);
  const identity = data?.identity || initialIdentity;
  const maxYearCount = Math.max(1, ...(data?.years || []).map(item => Number(item.count)));

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="admin-brand" href="/"><span>生</span><div><strong>Life Atlas</strong><small>ADMIN CONSOLE</small></div></Link>
      <nav>{navItems.map(item => { const Icon = item.icon; return <button className={active === item.key ? "active" : ""} onClick={() => { setActive(item.key); setSearch(""); }} key={item.key}><Icon size={17} /><span>{item.label}</span></button>; })}</nav>
      <div className="admin-sidebar-footer"><span><UserRound size={15} /></span><div><strong>{identity.displayName}</strong><small>{identity.local ? "本地安全模式" : identity.email}</small></div></div>
    </aside>

    <section className="admin-workspace">
      <header className="admin-topbar"><div><small>管理后台</small><h1>{navItems.find(item => item.key === active)?.label}</h1></div><div className="admin-top-actions">{active !== "overview" && <label><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索当前数据" /></label>}<button onClick={() => void load()} disabled={loading} aria-label="刷新后台数据"><RefreshCw className={loading ? "spin" : ""} size={16} /></button><Link href="/" target="_blank">打开用户端<ExternalLink size={14} /></Link></div></header>

      <div className="admin-content">
        {error && <div className="admin-error">{error}</div>}
        {loading && !data ? <div className="admin-loading"><RefreshCw className="spin" />正在读取运营数据…</div> : data && <>
          {active === "overview" && <Overview data={data} maxYearCount={maxYearCount} onNavigate={setActive} />}
          {active === "entries" && <EntriesTable entries={entries} deleting={deleting} onDelete={removeRecord} />}
          {active === "goals" && <GoalsTable goals={goals} deleting={deleting} onDelete={removeRecord} />}
          {active === "tracks" && <TracksTable tracks={tracks} deleting={deleting} onDelete={removeRecord} />}
          {active === "system" && <SystemPanel data={data} aiStatus={aiStatus} />}
        </>}
      </div>
    </section>
  </main>;
}

function Overview({ data, maxYearCount, onNavigate }: { data: AdminData; maxYearCount: number; onNavigate: (value: Section) => void }) {
  const cards = [
    { label: "人生经历", value: data.stats.entries, note: "已记录内容", icon: BookOpen, section: "entries" as Section },
    { label: "全部目标", value: data.stats.goals, note: `${data.stats.activeGoals} 个进行中`, icon: Target, section: "goals" as Section },
    { label: "人生主线", value: data.stats.tracks, note: "长期方向", icon: Route, section: "tracks" as Section },
    { label: "媒体文件", value: data.stats.mediaCount, note: formatBytes(data.stats.mediaBytes), icon: HardDrive, section: "system" as Section },
  ];
  return <div className="admin-overview">
    <section className="admin-welcome"><div><small>OVERVIEW</small><h2>内容与数据运行正常</h2><p>集中查看人生地图中的记录、目标、媒体文件和 AI 服务状态。</p></div><span><ShieldCheck size={22} />管理员视图</span></section>
    <section className="admin-stat-grid">{cards.map(card => { const Icon = card.icon; return <button onClick={() => onNavigate(card.section)} key={card.label}><span><Icon size={18} /></span><div><small>{card.label}</small><strong>{card.value}</strong><p>{card.note}</p></div></button>; })}</section>
    <section className="admin-overview-grid">
      <article className="admin-panel"><header><div><small>MEMORY GROWTH</small><h3>历年经历数量</h3></div><Activity size={18} /></header><div className="admin-year-chart">{data.years.length ? data.years.map(item => <div key={item.year}><span>{item.count}</span><i style={{ height: `${Math.max(10, Number(item.count) / maxYearCount * 100)}%` }} /><small>{item.year}</small></div>) : <p>还没有经历数据</p>}</div></article>
      <article className="admin-panel"><header><div><small>RECENT</small><h3>最近记录</h3></div><BookOpen size={18} /></header><div className="admin-recent-list">{data.entries.slice(0, 5).map(entry => <button onClick={() => onNavigate("entries")} key={entry.id}><span>{new Date(entry.occurredAt).getDate()}</span><div><strong>{entry.title}</strong><small><MapPin size={11} />{entry.locationName}</small></div></button>)}</div></article>
    </section>
  </div>;
}

function EntriesTable({ entries, deleting, onDelete }: { entries: EntryRow[]; deleting: string; onDelete: (kind: "entry", id: string, title: string) => void }) {
  return <section className="admin-table-panel"><header><div><small>CONTENT</small><h2>经历记录</h2><p>共 {entries.length} 条匹配记录</p></div></header><div className="admin-table-wrap"><table><thead><tr><th>经历</th><th>发生时间</th><th>地点</th><th>分类</th><th>可见性</th><th>权重</th><th /></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td><strong>{entry.title}</strong><small>{entry.emotion || "calm"}</small></td><td>{formatDate(entry.occurredAt)}</td><td>{entry.locationName}</td><td><span className="admin-badge">{categoryLabels[entry.category] || entry.category}</span></td><td>{entry.visibility === "public" ? "公开" : entry.visibility === "shared" ? "指定可见" : "仅自己"}</td><td>{entry.significance}/5</td><td><button className="admin-delete" onClick={() => onDelete("entry", entry.id, entry.title)} disabled={deleting === `entry-${entry.id}`}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div></section>;
}

function GoalsTable({ goals, deleting, onDelete }: { goals: GoalRow[]; deleting: string; onDelete: (kind: "goal", id: string, title: string) => void }) {
  return <section className="admin-table-panel"><header><div><small>PLANNING</small><h2>目标管理</h2><p>共 {goals.length} 个匹配目标</p></div></header><div className="admin-table-wrap"><table><thead><tr><th>目标</th><th>领域</th><th>计划日期</th><th>状态</th><th>进度</th><th>地点</th><th /></tr></thead><tbody>{goals.map(goal => <tr key={goal.id}><td><strong>{goal.title}</strong></td><td><span className="admin-badge">{domainLabels[goal.domain] || goal.domain}</span></td><td>{formatDate(goal.targetDate)}</td><td>{statusLabels[goal.status] || goal.status}</td><td><div className="admin-progress"><i style={{ width: `${goal.progress}%` }} /><span>{goal.progress}%</span></div></td><td>{goal.locationName || "—"}</td><td><button className="admin-delete" onClick={() => onDelete("goal", goal.id, goal.title)} disabled={deleting === `goal-${goal.id}`}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div></section>;
}

function TracksTable({ tracks, deleting, onDelete }: { tracks: TrackRow[]; deleting: string; onDelete: (kind: "track", id: string, title: string) => void }) {
  return <section className="admin-table-panel"><header><div><small>DIRECTION</small><h2>人生主线</h2><p>共 {tracks.length} 条匹配主线</p></div></header><div className="admin-track-grid">{tracks.map(track => <article key={track.id} style={{ "--track-color": track.color } as CSSProperties}><i /><small>{formatDate(track.startDate)} — {formatDate(track.endDate)}</small><h3>{track.title}</h3><div className="admin-progress"><i style={{ width: `${track.progress}%` }} /><span>{track.progress}%</span></div><footer><span>{track.status === "complete" ? "已完成" : track.status === "paused" ? "已暂缓" : "进行中"}</span><button className="admin-delete" onClick={() => onDelete("track", track.id, track.title)} disabled={deleting === `track-${track.id}`}><Trash2 size={14} /></button></footer></article>)}</div></section>;
}

function SystemPanel({ data, aiStatus }: { data: AdminData; aiStatus: { mode: string; model: string; configured: boolean } | null }) {
  const mediaIcons = { image: ImageIcon, video: Film, audio: FileAudio, file: Database };
  return <div className="admin-system-grid">
    <section className="admin-panel admin-media-panel"><header><div><small>STORAGE</small><h3>媒体存储</h3></div><HardDrive size={18} /></header><strong>{formatBytes(data.stats.mediaBytes)}</strong><p>{data.stats.mediaCount} 个文件，单个文件上限 75MB</p><div>{data.mediaTypes.map(item => { const Icon = mediaIcons[item.type] || Database; return <article key={item.type}><span><Icon size={17} /></span><div><strong>{item.type === "image" ? "图片" : item.type === "video" ? "视频" : item.type === "audio" ? "音频" : "其他文件"}</strong><small>{item.count} 个 · {formatBytes(Number(item.bytes))}</small></div></article>; })}</div></section>
    <section className="admin-panel admin-service-panel"><header><div><small>AI SERVICE</small><h3>AI 服务</h3></div><Bot size={18} /></header><div className={`admin-service-state ${aiStatus?.configured ? "online" : "local"}`}><i /><span><strong>{aiStatus?.configured ? "模型已连接" : "本地整理模式"}</strong><small>{aiStatus?.model || "local-editor"}</small></span></div><p>AI 只在用户主动点击“帮我整理”时调用，并且不会自动编造经历内容。</p></section>
    <section className="admin-panel admin-access-panel"><header><div><small>ACCESS</small><h3>访问与权限</h3></div><ShieldCheck size={18} /></header><div><Gauge size={19} /><span><strong>管理员后台已隔离</strong><small>本机可直接访问；线上访问需要登录，并可用 ADMIN_EMAILS 限制管理员邮箱。</small></span></div><div><UserRound size={19} /><span><strong>当前为单用户数据结构</strong><small>尚未建立多用户数据归属与成员管理。</small></span></div></section>
  </div>;
}
