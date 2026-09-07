"use client";
/* eslint-disable @next/next/no-img-element -- private memory media is served through authenticated local endpoints */

import {
  CalendarRange, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound, Film, Images,
  Link2, LoaderCircle, MapPin, Pencil, Plus, Quote, Target, Trash2, Volume2, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LifeDomain, LifeEntry, LifeGoal, LifeGoalEdge, LifeMedia, LifeProfile, LifeTrack } from "../lib/types";

type Props = { entries: LifeEntry[]; onClose: () => void; onEntrySelect: (id: string) => void };
type DomainKey = LifeGoal["domain"];
type ScaleMode = "year" | "three" | "ten" | "life";
type DomainFilter = "all" | DomainKey;
type DomainOption = { key: DomainKey; label: string; omen: string; color: string; custom?: boolean };
type TimelineItem = {
  id: string;
  kind: "goal" | "entry";
  date: string;
  domain: DomainKey;
  title: string;
  summary: string;
  goal?: LifeGoal;
  entry?: LifeEntry;
};
type TimelineGroup = {
  key: string;
  label: string;
  subtitle: string;
  targetDate: string;
  sortValue: number;
  isCurrent: boolean;
  items: TimelineItem[];
};

const domains: DomainOption[] = [
  { key: "career", label: "事业", omen: "作品与职业", color: "#79c8ff" },
  { key: "relationship", label: "关系", omen: "重要的人", color: "#c29aff" },
  { key: "health", label: "身心", omen: "身体与恢复", color: "#82dfb3" },
  { key: "creation", label: "创作", omen: "表达与创造", color: "#ff9665" },
  { key: "wealth", label: "财富", omen: "资源与选择", color: "#f2cf68" },
  { key: "exploration", label: "探索", omen: "旅行与世界", color: "#82d9df" },
];

const scaleLabels: Array<{ key: ScaleMode; label: string }> = [
  { key: "year", label: "今年" },
  { key: "three", label: "未来 3 年" },
  { key: "ten", label: "未来 10 年" },
  { key: "life", label: "一生" },
];
const domainByEntry: Record<string, DomainKey> = { work: "career", relationship: "relationship", health: "health", growth: "creation", reflection: "creation", adventure: "exploration" };
const statusLabels = { planned: "未开始", active: "进行中", complete: "已完成", paused: "暂缓" } as const;
const emotionLabels: Record<string, string> = { calm: "平静", joy: "快乐", excitement: "兴奋", moved: "感动", longing: "思念", sadness: "悲伤", regret: "遗憾", anxiety: "焦虑", anger: "愤怒", loneliness: "孤独", confusion: "迷茫", relief: "释然" };
const phaseLabels: Record<string, string> = { turning: "人生转折", low: "低谷", rebirth: "重新开始" };

function addMonths(date: Date, months: number) { const value = new Date(date); value.setMonth(value.getMonth() + months); return value; }
function monthsBetween(from: Date, to: Date) { return (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth(); }
function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function fallbackBirthDate() { const now = new Date(); return new Date(now.getFullYear() - 25, now.getMonth(), 1); }
function ageParts(birth: Date, value: string | Date) { const total = Math.max(0, monthsBetween(birth, new Date(value))); return { years: Math.floor(total / 12), months: total % 12 }; }
function displayDate(value: Date) { return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`; }
function memoryQuote(entry: LifeEntry) {
  const source = (entry.rawDetail || entry.detail || entry.summary || "").replace(/【[^】]+】/g, "").trim();
  const candidates = source.split(/(?<=[。！？])/).map(value => value.trim()).filter(value => value.length >= 6);
  const selected = candidates.find(value => value.length >= 12 && value.length <= 72) || candidates[0] || entry.summary || entry.title;
  return selected.length > 82 ? `${selected.slice(0, 81)}…` : selected;
}
function entryEmotion(entry: LifeEntry) {
  return (entry.emotions?.length ? entry.emotions : [entry.emotion || "calm"]).map(value => emotionLabels[value]).filter(Boolean).join("、") || "平静";
}

export default function LifeMainline({ entries, onClose, onEntrySelect }: Props) {
  const [profile, setProfile] = useState<LifeProfile | null>(null);
  const [tracks, setTracks] = useState<LifeTrack[]>([]);
  const [customDomains, setCustomDomains] = useState<LifeDomain[]>([]);
  const [goals, setGoals] = useState<LifeGoal[]>([]);
  const [edges, setEdges] = useState<LifeGoalEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("three");
  const [activeDomain, setActiveDomain] = useState<DomainFilter>("all");
  const [profileOpen, setProfileOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<LifeDomain | null>(null);
  const [editingGoal, setEditingGoal] = useState<LifeGoal | null>(null);
  const [editingTrack, setEditingTrack] = useState<LifeTrack | null>(null);
  const [draftDomain, setDraftDomain] = useState<DomainKey>("career");
  const [draftTargetDate, setDraftTargetDate] = useState("");
  const [mediaByEntry, setMediaByEntry] = useState<Record<string, LifeMedia[]>>({});
  const [selectedMemory, setSelectedMemory] = useState<LifeEntry | null>(null);
  const nowMarkerRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    const [profileResponse, trackResponse, goalResponse, domainResponse] = await Promise.all([fetch("/api/life-profile"), fetch("/api/tracks"), fetch("/api/goals"), fetch("/api/domains")]);
    if (!profileResponse.ok || !trackResponse.ok || !goalResponse.ok || !domainResponse.ok) throw new Error("无法读取人生时间轴");
    const profileData = await profileResponse.json() as { profile: LifeProfile | null };
    const trackData = await trackResponse.json() as { tracks: LifeTrack[] };
    const goalData = await goalResponse.json() as { goals: LifeGoal[]; edges: LifeGoalEdge[] };
    const domainData = await domainResponse.json() as { domains: LifeDomain[] };
    setProfile(profileData.profile); setTracks(trackData.tracks || []); setGoals(goalData.goals || []); setEdges(goalData.edges || []); setCustomDomains(domainData.domains || []);
  };

  useEffect(() => {
    let active = true;
    async function loadTimeline() {
      try {
        const profileResponse = await fetch("/api/life-profile");
        if (!profileResponse.ok) throw new Error("profile failed");
        const profileData = await profileResponse.json() as { profile: LifeProfile | null };
        if (active) setProfile(profileData.profile);
      } catch {
        if (active) setError("个人档案暂时无法读取");
      }
      try {
        const [trackResponse, goalResponse, domainResponse] = await Promise.all([fetch("/api/tracks"), fetch("/api/goals"), fetch("/api/domains")]);
        if (!trackResponse.ok || !goalResponse.ok || !domainResponse.ok) throw new Error("timeline failed");
        const trackData = await trackResponse.json() as { tracks: LifeTrack[] };
        const goalData = await goalResponse.json() as { goals: LifeGoal[]; edges: LifeGoalEdge[] };
        const domainData = await domainResponse.json() as { domains: LifeDomain[] };
        if (active) { setTracks(trackData.tracks || []); setGoals(goalData.goals || []); setEdges(goalData.edges || []); setCustomDomains(domainData.domains || []); }
      } catch {
        if (active) setError("人生时间轴暂时无法读取");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTimeline();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!entries.length) return;
    const controller = new AbortController();
    const ids = entries.map(entry => entry.id).join(",");
    fetch(`/api/media?entryIds=${encodeURIComponent(ids)}`, { signal: controller.signal })
      .then(async response => await response.json() as { media?: LifeMedia[] })
      .then(data => {
        const grouped: Record<string, LifeMedia[]> = {};
        for (const media of data.media || []) (grouped[media.entryId] ||= []).push(media);
        setMediaByEntry(grouped);
      })
      .catch(cause => { if ((cause as Error).name !== "AbortError") setMediaByEntry({}); });
    return () => controller.abort();
  }, [entries]);

  const birth = useMemo(() => profile?.birthDate ? new Date(profile.birthDate) : fallbackBirthDate(), [profile]);
  const currentMonths = Math.max(0, monthsBetween(birth, new Date()));
  const currentAge = `${Math.floor(currentMonths / 12)}岁${currentMonths % 12}个月`;
  const domainOptions = useMemo<DomainOption[]>(() => [...domains, ...customDomains.map(domain => ({ key: domain.id, label: domain.label, omen: domain.description || "自定义领域", color: domain.color, custom: true }))], [customDomains]);
  const memorySequence = useMemo(() => [...entries].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()), [entries]);
  const featuredMemory = useMemo(() => {
    const now = new Date();
    return [...entries].filter(entry => new Date(entry.occurredAt) <= now).sort((a, b) => {
      const score = (entry: LifeEntry) => {
        const date = new Date(entry.occurredAt);
        const anniversary = date.getMonth() === now.getMonth() && date.getDate() === now.getDate() ? 1000 : 0;
        const media = mediaByEntry[entry.id] || [];
        return anniversary + entry.significance * 30 + (media.some(item => item.contentType.startsWith("image/") || item.contentType.startsWith("video/")) ? 80 : 0) + (media.some(item => item.contentType.startsWith("audio/")) ? 25 : 0) + Math.min((entry.detail || "").length, 200) / 10;
      };
      return score(b) - score(a);
    })[0] || null;
  }, [entries, mediaByEntry]);

  const timelineGroups = useMemo<TimelineGroup[]>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const start = new Date(currentYear, 0, 1);
    const end = scaleMode === "year" ? new Date(currentYear + 1, 0, 1) : scaleMode === "three" ? new Date(currentYear + 3, 0, 1) : scaleMode === "ten" ? new Date(currentYear + 10, 0, 1) : null;
    const visible = (date: string) => {
      const value = new Date(date);
      return !Number.isNaN(value.getTime()) && (!end || (value >= start && value < end));
    };
    const items: TimelineItem[] = [
      ...goals.map(goal => ({ id: `goal-${goal.id}`, kind: "goal" as const, date: goal.targetDate, domain: goal.domain, title: goal.title, summary: goal.nextStep || goal.description || "点击补充下一步行动", goal })),
      ...entries.map(entry => ({ id: `entry-${entry.id}`, kind: "entry" as const, date: entry.occurredAt, domain: domainByEntry[entry.category] || "creation", title: entry.title, summary: memoryQuote(entry), entry })),
    ].filter(item => visible(item.date) && (activeDomain === "all" || item.domain === activeDomain));

    const groups = new Map<string, TimelineGroup>();
    const addGroup = (date: Date) => {
      const year = date.getFullYear();
      const quarter = Math.floor(date.getMonth() / 3);
      const isQuarter = scaleMode === "year";
      const key = isQuarter ? `${year}-Q${quarter}` : String(year);
      if (groups.has(key)) return groups.get(key)!;
      const target = isQuarter ? new Date(year, quarter * 3 + 2, 1) : year === currentYear ? addMonths(now, 6) : new Date(year, 5, 30);
      const parts = ageParts(birth, target);
      const group: TimelineGroup = {
        key,
        label: isQuarter ? `${year}年 · 第${["一", "二", "三", "四"][quarter]}季度` : `${year}年`,
        subtitle: profile ? `约 ${parts.years} 岁` : isQuarter ? `${quarter * 3 + 1}—${quarter * 3 + 3}月` : "按目标日期排列",
        targetDate: isoDate(target),
        sortValue: isQuarter ? year * 10 + quarter : year,
        isCurrent: year === currentYear && (!isQuarter || quarter === currentQuarter),
        items: [],
      };
      groups.set(key, group);
      return group;
    };

    if (scaleMode === "year") {
      for (let quarter = 0; quarter < 4; quarter += 1) addGroup(new Date(currentYear, quarter * 3, 1));
    } else if (scaleMode === "three" || scaleMode === "ten") {
      const count = scaleMode === "three" ? 3 : 10;
      for (let index = 0; index < count; index += 1) addGroup(new Date(currentYear + index, 0, 1));
    } else {
      addGroup(now);
    }

    items.forEach(item => addGroup(new Date(item.date)).items.push(item));
    groups.forEach(group => group.items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    return Array.from(groups.values()).sort((a, b) => a.sortValue - b.sortValue);
  }, [activeDomain, birth, entries, goals, profile, scaleMode]);

  const saveGoal = async (payload: Partial<LifeGoal> & { prerequisiteId?: string | null }) => {
    const response = await fetch("/api/goals", { method: payload.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "保存目标失败");
    await refresh(); setGoalOpen(false); setEditingGoal(null);
  };

  const deleteGoal = async (goal: LifeGoal) => {
    if (!window.confirm(`确定删除目标“${goal.title}”吗？`)) return;
    const response = await fetch(`/api/goals?id=${encodeURIComponent(goal.id)}`, { method: "DELETE" });
    if (!response.ok) return setError("删除目标失败");
    await refresh(); setGoalOpen(false); setEditingGoal(null);
  };

  const saveProfile = async (payload: Partial<LifeProfile>) => {
    const response = await fetch("/api/life-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { profile?: LifeProfile; error?: string };
    if (!response.ok || !data.profile) throw new Error(data.error || "保存档案失败");
    setProfile(data.profile); setProfileOpen(false);
  };

  const saveTrack = async (payload: Partial<LifeTrack>) => {
    const response = await fetch("/api/tracks", { method: payload.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "保存主线失败");
    await refresh(); setTrackOpen(false); setEditingTrack(null);
  };

  const saveDomain = async (payload: Pick<LifeDomain, "label" | "description" | "color"> & { id?: string }) => {
    const response = await fetch("/api/domains", { method: payload.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { domain?: LifeDomain; error?: string };
    if (!response.ok || !data.domain) throw new Error(data.error || "保存领域失败");
    setCustomDomains(current => payload.id ? current.map(domain => domain.id === data.domain!.id ? data.domain! : domain) : [...current, data.domain!]);
    setDomainOpen(false); setEditingDomain(null);
  };

  const deleteDomain = async (domain: LifeDomain) => {
    const response = await fetch(`/api/domains?id=${encodeURIComponent(domain.id)}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "删除领域失败");
    setCustomDomains(current => current.filter(item => item.id !== domain.id));
    if (activeDomain === domain.id) setActiveDomain("all");
    setDomainOpen(false); setEditingDomain(null);
  };

  const openGoalForDomain = (domain: DomainKey, targetDate = isoDate(addMonths(new Date(), 6))) => {
    setDraftDomain(domain);
    setDraftTargetDate(targetDate);
    setEditingGoal(null);
    setGoalOpen(true);
  };

  const openGoalForPeriod = (targetDate: string) => openGoalForDomain(activeDomain === "all" ? "career" : activeDomain, targetDate);
  const activeGoals = goals.filter(goal => goal.status === "active").length;
  const focusNow = () => nowMarkerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  const featuredMedia = featuredMemory ? mediaByEntry[featuredMemory.id] || [] : [];
  const featuredCover = featuredMedia.find(value => value.contentType.startsWith("image/")) || featuredMedia.find(value => value.contentType.startsWith("video/"));
  const featuredDate = featuredMemory ? new Date(featuredMemory.occurredAt) : null;
  const featuredYearsAgo = featuredDate ? Math.max(0, new Date().getFullYear() - featuredDate.getFullYear()) : 0;
  const featuredIsAnniversary = featuredDate ? featuredDate.getMonth() === new Date().getMonth() && featuredDate.getDate() === new Date().getDate() : false;
  const selectedMemoryIndex = selectedMemory ? memorySequence.findIndex(entry => entry.id === selectedMemory.id) : -1;

  const renderItem = (item: TimelineItem) => {
    const domain = domainOptions.find(value => value.key === item.domain) || domains[0];
    const date = new Date(item.date);
    if (item.kind === "goal" && item.goal) {
      const goal = item.goal;
      const prerequisite = edges.find(edge => edge.toGoalId === goal.id && edge.relation === "depends");
      return <button type="button" className={`timeline-item-card goal ${goal.status}`} style={{ "--domain-color": domain.color } as CSSProperties} onClick={() => { setEditingGoal(goal); setGoalOpen(true); }} aria-label={`编辑目标 ${goal.title}`} key={item.id}>
        <span className="timeline-item-marker"><Target size={14} /></span>
        <span className="timeline-item-content"><small><i style={{ background: domain.color }} />{domain.label} · {displayDate(date)} · {statusLabels[goal.status]}</small><strong>{goal.title}</strong><p>{item.summary}</p><span className="timeline-progress"><i style={{ width: `${goal.progress}%` }} /></span></span>
        <span className="timeline-item-meta"><b>{goal.progress}%</b>{prerequisite && <Link2 size={13} />}</span>
      </button>;
    }
    if (!item.entry) return null;
    const entry = item.entry;
    const media = mediaByEntry[entry.id] || [];
    const cover = media.find(value => value.contentType.startsWith("image/")) || media.find(value => value.contentType.startsWith("video/"));
    const imageCount = media.filter(value => value.contentType.startsWith("image/")).length;
    const hasAudio = media.some(value => value.contentType.startsWith("audio/"));
    const hasVideo = media.some(value => value.contentType.startsWith("video/"));
    return <article className={`memory-postcard ${cover ? "has-cover" : "text-only"}`} style={{ "--domain-color": domain.color } as CSSProperties} key={item.id}>
      <button type="button" className="memory-postcard-open" onClick={() => setSelectedMemory(entry)} aria-label={`回放经历 ${entry.title}`}>
        {cover?.contentType.startsWith("image/") && <img className="memory-postcard-cover" src={cover.url} alt="" />}
        {cover?.contentType.startsWith("video/") && <video className="memory-postcard-cover" src={cover.url} muted playsInline preload="metadata"><track kind="captions" /></video>}
        <span className="memory-postcard-overlay" />
        <span className="memory-postcard-body">
          <small><i style={{ background: domain.color }} />真实经历 · {domain.label} · {displayDate(date)}</small>
          <strong>{entry.title}</strong>
          <q>{item.summary}</q>
          <span className="memory-postcard-cues"><em><MapPin size={12} />{entry.locationName}</em>{entry.people && <em>与 {entry.people}</em>}<em>{entryEmotion(entry)}</em>{entry.lifePhase && <em>{phaseLabels[entry.lifePhase]}</em>}</span>
        </span>
        <span className="memory-postcard-media">{imageCount > 0 && <em><Images size={13} />{imageCount}</em>}{hasVideo && <em><Film size={13} />视频</em>}{hasAudio && <em><Volume2 size={13} />语音</em>}<ChevronRight size={17} /></span>
      </button>
      {hasAudio && <audio className="memory-inline-audio" controls preload="none" src={media.find(value => value.contentType.startsWith("audio/"))?.url}><track kind="captions" />你的浏览器不支持音频播放。</audio>}
    </article>;
  };

  return (
    <section className="star-chart-shell">
      <header className="star-chart-topbar">
        <div className="star-title"><small>LIFE TIMELINE</small><h1>人生时间线</h1><p>沿着一条方向回看经历，也安排未来目标。</p></div>
        <div className="star-top-actions">
          <button onClick={() => setProfileOpen(true)}><CircleUserRound size={16} />个人档案</button>
          <button onClick={() => { setEditingTrack(null); setTrackOpen(true); }}><CalendarRange size={16} />新建主线</button>
          <button className="ignite-goal" onClick={() => openGoalForDomain(activeDomain === "all" ? "career" : activeDomain)}><Plus size={16} />新建目标</button>
          <button className="close-star-chart" onClick={onClose} aria-label="关闭人生主线"><X size={19} /></button>
        </div>
      </header>

      <div className="timeline-planner">
        <div className="timeline-planner-toolbar">
          <div className="planner-toolbar-row"><div className="timeline-scale" aria-label="时间范围">{scaleLabels.map(item => <button className={scaleMode === item.key ? "active" : ""} onClick={() => setScaleMode(item.key)} key={item.key}>{item.label}</button>)}</div><button className="planner-today" onClick={focusNow}>回到今天</button></div>
          <div className="domain-filter" aria-label="生活领域筛选">
            <button className={activeDomain === "all" ? "active" : ""} onClick={() => setActiveDomain("all")}>全部</button>
            {domainOptions.map(domain => domain.custom ? <span className="domain-filter-custom" key={domain.key}><button className={activeDomain === domain.key ? "active" : ""} style={{ "--domain-color": domain.color } as CSSProperties} onClick={() => setActiveDomain(domain.key)}><i />{domain.label}</button><button className="domain-edit-button" onClick={() => { const source = customDomains.find(item => item.id === domain.key) || null; setEditingDomain(source); setDomainOpen(true); }} aria-label={`编辑领域 ${domain.label}`}><Pencil size={12} /></button></span> : <button className={activeDomain === domain.key ? "active" : ""} style={{ "--domain-color": domain.color } as CSSProperties} onClick={() => setActiveDomain(domain.key)} key={domain.key}><i />{domain.label}</button>)}
            <button className="domain-add-button" onClick={() => { setEditingDomain(null); setDomainOpen(true); }}><Plus size={13} />自定义</button>
          </div>
        </div>

        <div className="vertical-timeline">
          <section className="planner-summary">
            <button className="planner-profile" onClick={() => setProfileOpen(true)}><span>{profile?.avatarSymbol || "我"}</span><div><small>个人档案</small><strong>{profile?.displayName || "建立个人档案"}</strong><p>{profile ? `${profile.identity || "记录中的我"} · 当前 ${currentAge}` : "填写出生日期，让年龄计算更准确"}</p></div><ChevronRight size={16} /></button>
            <div className="planner-stats"><span><strong>{goals.length}</strong>全部目标</span><span><strong>{activeGoals}</strong>进行中</span><span><strong>{entries.length}</strong>真实经历</span></div>
            <div className="planner-tracks"><header><span>人生主线</span><button onClick={() => { setEditingTrack(null); setTrackOpen(true); }}><Plus size={13} />新建</button></header><div>{tracks.length ? tracks.map(track => <button key={track.id} onClick={() => { setEditingTrack(track); setTrackOpen(true); }}><i style={{ background: track.color }} /><span><strong>{track.title}</strong><small>{track.progress}% · {track.status === "complete" ? "已完成" : "进行中"}</small></span></button>) : <button className="empty-track" onClick={() => { setEditingTrack(null); setTrackOpen(true); }}>＋ 建立第一条人生主线</button>}</div></div>
          </section>

          {featuredMemory && <button type="button" className={`featured-memory ${featuredCover ? "has-cover" : "text-only"}`} onClick={() => setSelectedMemory(featuredMemory)}>
            {featuredCover?.contentType.startsWith("image/") && <img src={featuredCover.url} alt="" />}
            {featuredCover?.contentType.startsWith("video/") && <video src={featuredCover.url} muted playsInline preload="metadata"><track kind="captions" /></video>}
            <span className="featured-memory-shade" />
            <span className="featured-memory-copy"><small>{featuredIsAnniversary && featuredYearsAgo > 0 ? `${featuredYearsAgo} 年前的今天` : "今天想起了"}</small><strong>{featuredMemory.title}</strong><q>{memoryQuote(featuredMemory)}</q><span><MapPin size={13} />{featuredMemory.locationName}<em>{entryEmotion(featuredMemory)}</em></span></span>
            <span className="featured-memory-action"><Quote size={17} />重新进入这段记忆</span>
          </button>}

          {loading ? <div className="vertical-timeline-loading"><LoaderCircle className="spin" />正在整理你的时间线…</div> : timelineGroups.map(group => {
            const now = new Date();
            const pastItems = group.isCurrent ? group.items.filter(item => new Date(item.date) <= now) : group.items;
            const futureItems = group.isCurrent ? group.items.filter(item => new Date(item.date) > now) : [];
            return <section className={`timeline-period ${group.isCurrent ? "current" : ""}`} key={group.key}>
              <header><span>{group.isCurrent ? "现在" : group.label}</span><div><strong>{group.label}</strong><small>{group.subtitle}</small></div></header>
              <div className="timeline-period-content">
                {pastItems.map(renderItem)}
                {group.isCurrent && <div className="timeline-now-marker" ref={nowMarkerRef}><i /><span>今天 · {displayDate(now)}</span></div>}
                {futureItems.map(renderItem)}
                {!group.items.length && <div className="timeline-period-empty"><span>这一阶段还没有安排</span><small>先写下一个想实现的结果</small></div>}
                <button className="timeline-period-add" onClick={() => openGoalForPeriod(group.targetDate)}><Plus size={14} />添加这一阶段的目标</button>
              </div>
            </section>;
          })}
        </div>
      </div>

      {error && <div className="mainline-error">{error}</div>}
      {profileOpen && <ProfileEditor initial={profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
      {goalOpen && <GoalEditor initial={editingGoal} profile={profile} goals={goals} edges={edges} tracks={tracks} entries={entries} domainOptions={domainOptions} defaultDomain={draftDomain} defaultTargetDate={draftTargetDate} onClose={() => { setGoalOpen(false); setEditingGoal(null); }} onSave={saveGoal} onDelete={editingGoal ? () => deleteGoal(editingGoal) : undefined} />}
      {trackOpen && <MainlineEditor initial={editingTrack} onClose={() => { setTrackOpen(false); setEditingTrack(null); }} onSave={saveTrack} />}
      {domainOpen && <DomainEditor initial={editingDomain} onClose={() => { setDomainOpen(false); setEditingDomain(null); }} onSave={saveDomain} onDelete={editingDomain ? () => deleteDomain(editingDomain) : undefined} />}
      {selectedMemory && <MemoryReplay entry={selectedMemory} media={mediaByEntry[selectedMemory.id] || []} hasPrevious={selectedMemoryIndex > 0} hasNext={selectedMemoryIndex >= 0 && selectedMemoryIndex < memorySequence.length - 1} onPrevious={() => setSelectedMemory(memorySequence[selectedMemoryIndex - 1])} onNext={() => setSelectedMemory(memorySequence[selectedMemoryIndex + 1])} onClose={() => setSelectedMemory(null)} onOpenMap={() => onEntrySelect(selectedMemory.id)} />}
    </section>
  );
}

function MemoryReplay({ entry, media, hasPrevious, hasNext, onPrevious, onNext, onClose, onOpenMap }: { entry: LifeEntry; media: LifeMedia[]; hasPrevious: boolean; hasNext: boolean; onPrevious: () => void; onNext: () => void; onClose: () => void; onOpenMap: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  const images = media.filter(value => value.contentType.startsWith("image/"));
  const videos = media.filter(value => value.contentType.startsWith("video/"));
  const audios = media.filter(value => value.contentType.startsWith("audio/"));
  const cover = images[0];
  const phase = entry.lifePhase ? phaseLabels[entry.lifePhase] : "";
  return <section className={`memory-replay ${cover ? "has-cover" : "text-only"}`} style={cover ? { "--replay-cover": `url(${JSON.stringify(cover.url).slice(1, -1)})` } as CSSProperties : undefined} aria-label={`记忆回放：${entry.title}`}>
    <div className="memory-replay-backdrop" />
    <header><div><small>MEMORY REPLAY</small><span>{displayDate(new Date(entry.occurredAt))}</span></div><nav><button type="button" onClick={onPrevious} disabled={!hasPrevious} aria-label="上一段记忆"><ChevronLeft /></button><button type="button" onClick={onNext} disabled={!hasNext} aria-label="下一段记忆"><ChevronRight /></button><button type="button" onClick={onClose} aria-label="关闭记忆回放"><X /></button></nav></header>
    <main>
      {(cover || videos[0]) && <div className="memory-replay-hero">{cover ? <img src={cover.url} alt={`${entry.title}的记忆照片`} /> : <video src={videos[0].url} controls playsInline preload="metadata"><track kind="captions" /></video>}</div>}
      <article className="memory-replay-story">
        <div className="memory-replay-meta"><span><MapPin size={13} />{entry.locationName}</span><span>{entryEmotion(entry)}</span>{phase && <span>{phase}</span>}{entry.people && <span>与 {entry.people}</span>}</div>
        <h2>{entry.title}</h2>
        <blockquote><Quote size={20} /><p>{memoryQuote(entry)}</p></blockquote>
        {entry.detail && <section><small>当时发生了什么</small><p>{entry.detail}</p></section>}
        {entry.lessons && <section className="memory-reflection"><small>这件事后来怎样影响了我</small><p>{entry.lessons}</p></section>}
        {audios.length > 0 && <section className="memory-audio-list"><small>听见当时的声音</small>{audios.map(audio => <div key={audio.id}><Volume2 size={16} /><span>{audio.fileName}</span><audio controls preload="none" src={audio.url}><track kind="captions" />你的浏览器不支持音频播放。</audio></div>)}</section>}
        {(images.length > 1 || videos.length > 0) && <section className="memory-gallery"><small>这段记忆留下的画面</small><div>{images.slice(1).map(image => <img src={image.url} alt={image.fileName} key={image.id} />)}{videos.map(video => <video src={video.url} controls playsInline preload="metadata" key={video.id}><track kind="captions" /></video>)}</div></section>}
        <button className="memory-open-map" type="button" onClick={onOpenMap}><MapPin size={15} />回到地图中的这个地点</button>
      </article>
    </main>
    <footer><button type="button" onClick={onPrevious} disabled={!hasPrevious}><ChevronLeft size={16} />上一段</button><span>{displayDate(new Date(entry.occurredAt))} · {entry.locationName}</span><button type="button" onClick={onNext} disabled={!hasNext}>下一段<ChevronRight size={16} /></button></footer>
  </section>;
}

function DomainEditor({ initial, onClose, onSave, onDelete }: { initial: LifeDomain | null; onClose: () => void; onSave: (payload: Pick<LifeDomain, "label" | "description" | "color"> & { id?: string }) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [color, setColor] = useState(initial?.color || "#70cfcf");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { await onSave({ id: initial?.id, label: String(data.get("label")), description: String(data.get("description")), color }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "保存领域失败"); setBusy(false); }
  };
  const remove = async () => {
    if (!onDelete || !window.confirm(`确定删除领域“${initial?.label}”吗？`)) return;
    setBusy(true); setError("");
    try { await onDelete(); } catch (cause) { setError(cause instanceof Error ? cause.message : "删除领域失败"); setBusy(false); }
  };
  return <div className="mainline-modal-backdrop"><form className="mainline-editor domain-editor" onSubmit={submit}>
    <header><div><small>{initial ? "EDIT DOMAIN" : "CUSTOM DOMAIN"}</small><h2>{initial ? "编辑自定义领域" : "添加自定义领域"}</h2></div><button type="button" onClick={onClose} aria-label="关闭领域编辑器"><X /></button></header>
    <div className="domain-editor-preview" style={{ "--domain-preview": color } as CSSProperties}><i /><span><strong>{initial?.label || "我的领域"}</strong><small>保存后会同步到筛选和目标表单</small></span></div>
    <div className="mainline-form">
      <label className="wide"><span>领域名称 *</span><input name="label" required maxLength={12} defaultValue={initial?.label} placeholder="例如：学习、家庭、精神世界" /></label>
      <label className="wide"><span>一句说明</span><input name="description" maxLength={30} defaultValue={initial?.description} placeholder="这个领域对你意味着什么" /></label>
      <label className="wide domain-color-field"><span>识别颜色</span><div><input name="color" type="color" value={color} onChange={event => setColor(event.target.value)} /><strong>{color.toUpperCase()}</strong></div></label>
    </div>
    {error && <div className="mainline-form-error">{error}</div>}
    <footer>{onDelete && <button className="delete-mainline" type="button" onClick={() => void remove()} disabled={busy}><Trash2 size={14} />删除领域</button>}<span /><button type="button" onClick={onClose}>取消</button><button className="save-mainline" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}{initial ? "保存修改" : "添加领域"}</button></footer>
  </form></div>;
}

function ProfileEditor({ initial, onClose, onSave }: { initial: LifeProfile | null; onClose: () => void; onSave: (payload: Partial<LifeProfile>) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { await onSave({ displayName: String(data.get("displayName")), birthDate: String(data.get("birthDate")), birthCity: String(data.get("birthCity")), currentCity: String(data.get("currentCity")), identity: String(data.get("identity")), planningAge: Number(data.get("planningAge")), values: String(data.get("values")).split(/[,，、]/).map(item => item.trim()).filter(Boolean), avatarSymbol: String(data.get("avatarSymbol")) }); } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); setBusy(false); } };
  return <div className="mainline-modal-backdrop"><form className="mainline-editor profile-editor" onSubmit={submit}><header><div><small>PROFILE</small><h2>编辑个人档案</h2></div><button type="button" onClick={onClose} aria-label="关闭个人档案"><X /></button></header><div className="profile-form-orb"><span>{initial?.avatarSymbol || "我"}</span><p>出生日期只用于计算年龄刻度，不会公开展示。</p></div><div className="mainline-form"><label><span>姓名或昵称 *</span><input name="displayName" required defaultValue={initial?.displayName} placeholder="你想如何称呼自己" /></label><label><span>头像文字</span><input name="avatarSymbol" maxLength={2} defaultValue={initial?.avatarSymbol || "我"} /></label><label><span>出生日期 *</span><input name="birthDate" type="date" required defaultValue={initial?.birthDate || isoDate(fallbackBirthDate())} /></label><label><span>规划到多少岁</span><input name="planningAge" type="number" min="1" max="120" defaultValue={initial?.planningAge || 80} /></label><label><span>出生城市</span><input name="birthCity" defaultValue={initial?.birthCity} /></label><label><span>当前城市</span><input name="currentCity" defaultValue={initial?.currentCity} /></label><label className="wide"><span>当前身份</span><input name="identity" defaultValue={initial?.identity} placeholder="例：刚毕业的创作者、正在创业的设计师" /></label><label className="wide"><span>五项人生价值</span><input name="values" defaultValue={initial?.values.join("，")} placeholder="自由，创造，真诚，健康，连接" /></label></div>{error && <div className="mainline-form-error">{error}</div>}<footer><span /><button type="button" onClick={onClose}>取消</button><button className="save-mainline" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}保存档案</button></footer></form></div>;
}

function GoalEditor({ initial, profile, goals, edges, tracks, entries, domainOptions, defaultDomain, defaultTargetDate, onClose, onSave, onDelete }: { initial: LifeGoal | null; profile: LifeProfile | null; goals: LifeGoal[]; edges: LifeGoalEdge[]; tracks: LifeTrack[]; entries: LifeEntry[]; domainOptions: DomainOption[]; defaultDomain: DomainKey; defaultTargetDate: string; onClose: () => void; onSave: (payload: Partial<LifeGoal> & { prerequisiteId?: string | null }) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const birth = profile?.birthDate ? new Date(profile.birthDate) : fallbackBirthDate();
  const target = initial?.targetDate || defaultTargetDate || isoDate(addMonths(new Date(), 6));
  const [timeMode, setTimeMode] = useState<LifeGoal["timeMode"]>(initial?.timeMode || "point");
  const [startDate, setStartDate] = useState(initial?.startDate || isoDate(new Date()));
  const [targetDate, setTargetDate] = useState(target);
  const prerequisite = initial ? edges.find(edge => edge.toGoalId === initial.id && edge.relation === "depends")?.fromGoalId || "" : "";
  const computedStartDate = new Date(startDate);
  const computedTargetDate = new Date(targetDate);
  const targetParts = ageParts(birth, computedTargetDate);
  const currentParts = ageParts(birth, new Date());

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (timeMode === "range" && computedTargetDate < computedStartDate) return setError("完成时间不能早于开始时间。");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const pointStart = initial?.startDate ? new Date(initial.startDate) : new Date();
    const safePointStart = pointStart > computedTargetDate ? computedTargetDate : pointStart;
    try {
      await onSave({
        id: initial?.id,
        title: String(data.get("title")),
        description: String(data.get("description")),
        why: String(data.get("why")),
        nextStep: String(data.get("nextStep")),
        startDate: isoDate(timeMode === "range" ? computedStartDate : safePointStart),
        targetDate: isoDate(computedTargetDate),
        domain: String(data.get("domain")) as LifeGoal["domain"],
        timeMode,
        nodeType: String(data.get("nodeType")) as LifeGoal["nodeType"],
        status: String(data.get("status")) as LifeGoal["status"],
        progress: Number(data.get("progress")),
        trackId: String(data.get("trackId")) || null,
        linkedEntryId: String(data.get("linkedEntryId")) || null,
        locationName: String(data.get("locationName")),
        prerequisiteId: String(data.get("prerequisiteId")) || null,
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); setBusy(false); }
  };

  return <div className="mainline-modal-backdrop goal-drawer-backdrop"><form className="mainline-editor goal-editor age-goal-editor goal-drawer" onSubmit={submit}>
    <header><div><small>{initial ? "EDIT GOAL" : "NEW GOAL"}</small><h2>{initial ? "编辑目标" : "创建一个新目标"}</h2><p>先确定结果、时间和下一步，其他信息可以稍后补充。</p></div><button type="button" onClick={onClose} aria-label="关闭目标编辑器"><X /></button></header>
    <div className="mainline-form">
      <label className="wide goal-title-field"><span>目标名称 *</span><input name="title" required defaultValue={initial?.title} placeholder="例如：完成并发布第一款独立产品" /></label>
      <div className="wide goal-primary-row">
        <label><span>生活领域</span><select name="domain" defaultValue={initial?.domain || defaultDomain}>{domainOptions.map(domain => <option value={domain.key} key={domain.key}>{domain.label}</option>)}</select></label>
        <label><span>计划完成时间</span><input type="date" required value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
      </div>
      <div className="wide goal-date-summary"><CalendarRange size={15} /><span><strong>{displayDate(computedTargetDate)}</strong><small>届时约 {targetParts.years} 岁 {targetParts.months} 个月 · 当前 {currentParts.years} 岁 {currentParts.months} 个月</small></span></div>
      {!profile && <div className="wide age-profile-warning">当前年龄为临时估算。设置出生日期后会显示准确年龄。</div>}
      <label className="wide"><span>完成标准</span><textarea name="description" rows={3} defaultValue={initial?.description} placeholder="看到什么结果，才算这个目标真正完成？" /></label>
      <label className="wide"><span>下一步行动</span><input name="nextStep" defaultValue={initial?.nextStep} placeholder="写下一个 30 分钟内可以开始的动作" /></label>

      <details className="wide goal-advanced">
        <summary>更多设置 <span>类型、状态、关联和依赖</span><ChevronDown size={15} /></summary>
        <div className="goal-advanced-grid">
          <div className="wide age-mode-field"><span>目标时间形式</span><div className="age-mode-switch"><button type="button" aria-pressed={timeMode === "point"} className={timeMode === "point" ? "active" : ""} onClick={() => setTimeMode("point")}><Target size={14} />某个时间达成<small>显示为一个节点</small></button><button type="button" aria-pressed={timeMode === "range"} className={timeMode === "range" ? "active" : ""} onClick={() => setTimeMode("range")}><CalendarRange size={14} />持续一段时间<small>显示为一段计划</small></button></div></div>
          {timeMode === "range" && <label className="wide"><span>开始时间</span><input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label>}
          <label><span>目标类型</span><select name="nodeType" defaultValue={initial?.nodeType || "goal"}><option value="goal">结果目标</option><option value="milestone">里程碑</option><option value="turning">转折点</option><option value="habit">长期习惯</option></select></label>
          <label><span>状态</span><select name="status" defaultValue={initial?.status || "planned"}><option value="planned">未开始</option><option value="active">进行中</option><option value="paused">暂缓</option><option value="complete">已完成</option></select></label>
          <label><span>完成进度（%）</span><input name="progress" type="number" min="0" max="100" defaultValue={initial?.progress || 0} /></label>
          <label><span>所属人生主线</span><select name="trackId" defaultValue={initial?.trackId || ""}><option value="">暂不归类</option>{tracks.map(track => <option value={track.id} key={track.id}>{track.title}</option>)}</select></label>
          <label className="wide"><span>为什么重要</span><textarea name="why" rows={2} defaultValue={initial?.why} /></label>
          <label><span>前置目标</span><select name="prerequisiteId" defaultValue={prerequisite}><option value="">没有前置目标</option>{goals.filter(goal => goal.id !== initial?.id).map(goal => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></label>
          <label><span>关联地图经历</span><select name="linkedEntryId" defaultValue={initial?.linkedEntryId || ""}><option value="">暂不关联</option>{entries.map(entry => <option value={entry.id} key={entry.id}>{entry.title} · {entry.locationName}</option>)}</select></label>
          <label className="wide"><span>关联地点</span><input name="locationName" defaultValue={initial?.locationName} placeholder="城市或区域" /></label>
        </div>
      </details>
    </div>
    {error && <div className="mainline-form-error">{error}</div>}
    <footer>{onDelete && <button className="delete-mainline" type="button" onClick={onDelete}><Trash2 size={14} />删除目标</button>}<span /><button type="button" onClick={onClose}>取消</button><button className="save-mainline" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}{initial ? "保存目标" : "创建目标"}</button></footer>
  </form></div>;
}

function MainlineEditor({ initial, onClose, onSave }: { initial: LifeTrack | null; onClose: () => void; onSave: (payload: Partial<LifeTrack>) => Promise<void> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); try { await onSave({ id: initial?.id, title: String(data.get("title")), description: String(data.get("description")), why: String(data.get("why")), nextStep: String(data.get("nextStep")), startDate: String(data.get("startDate")), endDate: String(data.get("endDate")), progress: Number(data.get("progress")), status: String(data.get("status")), color: String(data.get("color")), sortOrder: initial?.sortOrder }); } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); setBusy(false); } };
  return <div className="mainline-modal-backdrop"><form className="mainline-editor" onSubmit={submit}><header><div><small>{initial ? "EDIT MAINLINE" : "NEW MAINLINE"}</small><h2>{initial ? "编辑人生主线" : "建立一条人生主线"}</h2></div><button type="button" onClick={onClose} aria-label="关闭主线编辑器"><X /></button></header><div className="mainline-form"><label className="wide"><span>主线名称 *</span><input name="title" required defaultValue={initial?.title} placeholder="例：带着作品去看世界" /></label><label className="wide"><span>这条主线是什么</span><textarea name="description" rows={2} defaultValue={initial?.description} /></label><label className="wide"><span>为什么值得长期投入</span><textarea name="why" rows={2} defaultValue={initial?.why} /></label><label className="wide"><span>下一个最小行动</span><input name="nextStep" defaultValue={initial?.nextStep} /></label><label><span>开始日期 *</span><input name="startDate" type="date" required defaultValue={initial?.startDate || isoDate(new Date())} /></label><label><span>目标日期 *</span><input name="endDate" type="date" required defaultValue={initial?.endDate || isoDate(addMonths(new Date(), 12))} /></label><label><span>当前进度（%）</span><input name="progress" type="number" min="0" max="100" defaultValue={initial?.progress || 0} /></label><label><span>状态</span><select name="status" defaultValue={initial?.status || "active"}><option value="active">进行中</option><option value="paused">暂缓</option><option value="complete">已完成</option></select></label><label><span>主线颜色</span><input name="color" type="color" defaultValue={initial?.color || "#ff9665"} /></label></div>{error && <div className="mainline-form-error">{error}</div>}<footer><span /><button type="button" onClick={onClose}>取消</button><button className="save-mainline" disabled={busy}>{busy && <LoaderCircle className="spin" size={15} />}{initial ? "保存主线" : "创建主线"}</button></footer></form></div>;
}
