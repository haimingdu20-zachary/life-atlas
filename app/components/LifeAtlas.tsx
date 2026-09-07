"use client";
/* eslint-disable @next/next/no-img-element -- private media is served through local authenticated endpoints */

import {
  BookOpen, CalendarDays, Compass, Crosshair, Download, Edit3, LoaderCircle,
  Map as MapIcon, MapPin, Plus, Route, Search, Settings2, Smartphone, Sparkles, Trash2, X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { LifeEntry, LifeMedia } from "../lib/types";
import GlobeMap, {
  type MapFocus,
  type MapLanguage,
  type MapViewport,
  type MapVisualMode,
} from "./GlobeMap";
import LifeMainline from "./LifeMainline";
import MemoryEditor, { type MemoryEditorProps, type PendingMedia } from "./MemoryEditor";
import ApiSettings from "./ApiSettings";
import { createTravelJournal, entryYear, filterMemories } from "../lib/travel-journal";

type Coordinates = { lat: number; lng: number };
type PlaceResult = { name: string; lat: number; lng: number; type?: string };

const categories: Record<string, { label: string; color: string }> = {
  growth: { label: "成长", color: "#ff9665" },
  adventure: { label: "探索", color: "#9fd8ff" },
  work: { label: "作品", color: "#f3d36b" },
  relationship: { label: "关系", color: "#d9a4ff" },
  health: { label: "身心", color: "#86ddb0" },
  reflection: { label: "反思", color: "#c3cfcd" },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value)).replaceAll("/", ".");
}

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function LifeAtlas() {
  const [entries, setEntries] = useState<LifeEntry[]>([]);
  const [selected, setSelected] = useState<LifeEntry | null>(null);
  const [draftLocation, setDraftLocation] = useState<Coordinates | null>(null);
  const [draftPlace, setDraftPlace] = useState("");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [zoom, setZoom] = useState(1.45);
  const [viewport, setViewport] = useState<MapViewport>({ lat: 32, lng: 104, zoom: 1.45, bearing: 0 });
  const [visualMode, setVisualMode] = useState<MapVisualMode>("memory");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<LifeEntry | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [mainlineOpen, setMainlineOpen] = useState(false);
  const [mapLanguage, setMapLanguage] = useState<MapLanguage>("zh");
  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [memoryYear, setMemoryYear] = useState("all");
  const [mapSearch, setMapSearch] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState("");

  const refreshEntries = async () => {
    const response = await fetch("/api/entries");
    if (!response.ok) throw new Error("无法读取经历");
    const data = await response.json() as { entries: LifeEntry[] };
    setEntries(data.entries);
  };

  useEffect(() => {
    let active = true;
    async function loadEntries() {
      try {
        const response = await fetch("/api/entries");
        const data = await response.json() as { entries: LifeEntry[] };
        if (active) setEntries(data.entries || []);
      } catch {
        if (active) setToast("本地经历暂时无法读取");
      }
    }
    void loadEntries();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const memoryYears = useMemo(() => Array.from(new Set(entries.map(entryYear).filter(Boolean))).sort((a, b) => Number(b) - Number(a)), [entries]);
  const filteredEntries = useMemo(() => filterMemories(entries, memoryYear, librarySearch), [entries, memoryYear, librarySearch]);
  const filteringMemories = memoryYear !== "all" || Boolean(librarySearch.trim());
  const shownPlaceCount = new Set(filteredEntries.map(entry => entry.locationName)).size;
  const clearMemoryFilters = () => { setMemoryYear("all"); setLibrarySearch(""); };

  const exportJournal = () => {
    if (!filteredEntries.length) return;
    const blob = new Blob([createTravelJournal(filteredEntries, memoryYear, librarySearch)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `人生地图-${memoryYear === "all" ? "全部年份" : memoryYear}-旅行手记.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast(`已导出 ${filteredEntries.length} 段文字经历`);
  };

  const identifyPlace = async (coordinates: Coordinates) => {
    setDraftPlace("正在识别城市与区域…");
    try {
      const response = await fetch(`/api/geocode?lat=${coordinates.lat}&lng=${coordinates.lng}`);
      const data = await response.json() as { results: PlaceResult[] };
      setDraftPlace(data.results?.[0]?.name || "未命名地点");
    } catch {
      setDraftPlace("未命名地点");
    }
  };

  const pickLocation = (coordinates: Coordinates) => {
    setSelected(null);
    setLibraryOpen(false);
    setDraftLocation(coordinates);
    void identifyPlace(coordinates);
  };

  const handleMapClick = (coordinates: Coordinates) => {
    if (zoom < 4.5) {
      setFocus({ ...coordinates, zoom: Math.min(zoom + 3, 7) });
      setToast("已靠近该区域，再点击一次选择城市或区县");
      return;
    }
    pickLocation(coordinates);
  };

  const searchPlaces = async (event: FormEvent) => {
    event.preventDefault();
    if (!mapSearch.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(mapSearch)}`);
      const data = await response.json() as { results: PlaceResult[] };
      setPlaceResults(data.results || []);
      if (!data.results?.length) setToast("没找到这个地方");
    } finally {
      setSearching(false);
    }
  };

  const choosePlace = (place: PlaceResult) => {
    const coordinates = { lat: place.lat, lng: place.lng };
    setMapSearch(place.name);
    setPlaceResults([]);
    setFocus({ ...coordinates, zoom: 10 });
    setDraftLocation(coordinates);
    setDraftPlace(place.name);
  };

  const locateMe = () => {
    navigator.geolocation?.getCurrentPosition(position => {
      const coordinates = { lat: position.coords.latitude, lng: position.coords.longitude };
      setFocus({ ...coordinates, zoom: 10 });
      pickLocation(coordinates);
    }, () => setToast("未获得定位权限"), { enableHighAccuracy: true });
  };

  const openNewEntry = () => {
    if (!draftLocation) return;
    setEditing(null);
    setEditorOpen(true);
  };

  const openMobileMap = () => {
    setLibraryOpen(false); setMainlineOpen(false); setSelected(null); setDraftLocation(null);
  };

  const startMobileRecord = () => {
    const begin = (coordinates: Coordinates) => {
      setSelected(null); setLibraryOpen(false); setMainlineOpen(false); setEditing(null);
      setDraftLocation(coordinates); setDraftPlace("正在识别当前位置…"); setFocus({ ...coordinates, zoom: Math.max(viewport.zoom, 10) });
      void identifyPlace(coordinates); setEditorOpen(true);
    };
    if (!navigator.geolocation) return begin({ lat: viewport.lat, lng: viewport.lng });
    navigator.geolocation.getCurrentPosition(position => begin({ lat: position.coords.latitude, lng: position.coords.longitude }), () => {
      setToast("未获得定位权限，已使用地图中心位置"); begin({ lat: viewport.lat, lng: viewport.lng });
    }, { enableHighAccuracy: true, timeout: 6000 });
  };

  const selectEntry = (id: string) => {
    const entry = entries.find(item => item.id === id);
    if (!entry) return;
    setDraftLocation(null);
    setSelected(entry);
    setFocus({ lat: entry.latitude, lng: entry.longitude, zoom: 9 });
  };

  const saveEntry = async (payload: Partial<LifeEntry>, media: PendingMedia[] = []) => {
    const entryId = payload.id || crypto.randomUUID();
    const response = await fetch("/api/entries", {
      method: payload.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, id: entryId }),
    });
    const data = await response.json() as { entry?: LifeEntry; error?: string };
    if (!response.ok) throw new Error(data.error || "保存失败");
    const savedEntryId = data.entry?.id || entryId;
    let failedUploads = 0;
    for (const item of media) {
      const formData = new FormData();
      formData.set("entryId", savedEntryId); formData.set("file", item.file); formData.set("stage", item.stage);
      if (item.capturedAt) formData.set("capturedAt", new Date(item.capturedAt).toISOString());
      if (item.latitude !== undefined) formData.set("latitude", String(item.latitude));
      if (item.longitude !== undefined) formData.set("longitude", String(item.longitude));
      const upload = await fetch("/api/media", { method: "POST", body: formData });
      if (!upload.ok) failedUploads += 1;
    }
    await refreshEntries();
    clearMemoryFilters();
    setEditorOpen(false);
    setEditing(null);
    setDraftLocation(null);
    setSelected(data.entry || null);
    setToast(failedUploads ? `经历已保存，${failedUploads} 个媒体文件上传失败` : "这段经历已放上地图");
  };

  const deleteEntry = async (entry: LifeEntry) => {
    if (!window.confirm(`确定删除“${entry.title}”吗？`)) return;
    const response = await fetch(`/api/entries?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
    if (!response.ok) return setToast("删除失败");
    setSelected(null);
    await refreshEntries();
    setToast("记录已删除");
  };

  return (
    <main className="earth-app">
      <GlobeMap
        entries={filteredEntries}
        selectedId={selected?.id}
        draftLocation={draftLocation}
        focus={focus}
        language={mapLanguage}
        visualMode={visualMode}
        onMapClick={handleMapClick}
        onEntrySelect={selectEntry}
        onZoomChange={setZoom}
        onViewportChange={setViewport}
      />

      <button className="earth-brand" onClick={() => setFocus({ lat: 32, lng: 104, zoom: 1.45 })}>
        <span><Compass size={18} /></span>
        <strong>人生地图</strong>
      </button>

      <form className="map-search" onSubmit={searchPlaces}>
        <Search size={17} />
        <input value={mapSearch} onChange={event => setMapSearch(event.target.value)} placeholder="搜索城市或区县" />
        {searching && <LoaderCircle className="spin" size={16} />}
        {placeResults.length > 0 && (
          <div className="map-search-results">
            {placeResults.map(place => (
              <button type="button" key={`${place.lat}-${place.lng}`} onClick={() => choosePlace(place)}>
                <MapPin size={14} /><span>{place.name}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      <nav className="earth-mode-switch" aria-label="地球显示模式">
        <span>EARTH VIEW</span>
        <button className={visualMode === "memory" ? "active" : ""} aria-pressed={visualMode === "memory"} onClick={() => setVisualMode("memory")}>记忆星球</button>
        <button className={visualMode === "real" ? "active" : ""} aria-pressed={visualMode === "real"} onClick={() => setVisualMode("real")}>真实地球</button>
        <button className={visualMode === "minimal" ? "active" : ""} aria-pressed={visualMode === "minimal"} onClick={() => setVisualMode("minimal")}>清晰地图</button>
      </nav>

      <div className="earth-actions">
        <div className="map-language-switch" aria-label="地图语言">
          <button className={mapLanguage === "zh" ? "active" : ""} aria-pressed={mapLanguage === "zh"} onClick={() => setMapLanguage("zh")}>中文</button>
          <button className={mapLanguage === "en" ? "active" : ""} aria-pressed={mapLanguage === "en"} onClick={() => setMapLanguage("en")}>EN</button>
        </div>
        <button onClick={locateMe} aria-label="定位到我的城市"><Crosshair size={18} /></button>
        <button className="api-settings-button" onClick={() => setApiSettingsOpen(true)} aria-label="AI API 设置" title="连接 OpenAI 或 DeepSeek">
          <Settings2 size={17} /><span>AI 接口</span>
        </button>
        <button className="mainline-button" onClick={() => { setMainlineOpen(true); setLibraryOpen(false); setSelected(null); setDraftLocation(null); }}><Route size={17} /><span>人生时间轴</span></button>
        <button className="library-button" onClick={() => { setLibraryOpen(value => !value); setSelected(null); setDraftLocation(null); }}>
          <BookOpen size={17} /><span>{entries.length} 段经历</span>
        </button>
      </div>

      <nav className="mobile-primary-nav" aria-label="移动端主导航">
        <button className={!libraryOpen && !mainlineOpen && !editorOpen && !apiSettingsOpen ? "active" : ""} onClick={openMobileMap}><MapIcon size={20} /><span>地图</span></button>
        <button className={libraryOpen ? "active" : ""} onClick={() => { setLibraryOpen(true); setMainlineOpen(false); setSelected(null); setDraftLocation(null); }}><BookOpen size={20} /><span>经历</span></button>
        <button className="mobile-record" onClick={startMobileRecord} aria-label="快速记录"><Plus size={26} /><span>记录</span></button>
        <button className={mainlineOpen ? "active" : ""} onClick={() => { setMainlineOpen(true); setLibraryOpen(false); setSelected(null); setDraftLocation(null); }}><Route size={20} /><span>时间线</span></button>
        <button className={apiSettingsOpen ? "active" : ""} onClick={() => setApiSettingsOpen(true)}><Sparkles size={20} /><span>AI</span></button>
      </nav>

      {filteringMemories && !libraryOpen && !mainlineOpen && !editorOpen && !apiSettingsOpen && (
        <div className="memory-filter-indicator" role="status">
          <button onClick={() => { setLibraryOpen(true); setSelected(null); setDraftLocation(null); }}>
            <CalendarDays size={15} /><span>{memoryYear === "all" ? "全部年份" : `${memoryYear} 年`}{librarySearch.trim() ? " · 关键词筛选" : ""} · {filteredEntries.length} 段经历</span>
          </button>
          <button onClick={clearMemoryFilters} aria-label="清除足迹筛选" title="显示全部经历"><X size={16} /></button>
        </div>
      )}

      {!draftLocation && !selected && !libraryOpen && !mainlineOpen && (
        <div className="zoom-guide">
          <span className="guide-ring" />
          <div>
            <strong>{zoom < 4.5 ? "滚轮或双指放大地球" : "点击一个城市或区域"}</strong>
            <small>{zoom < 4.5 ? "先找到经历发生的大致方向" : "不需要精确到街道门牌"}</small>
          </div>
        </div>
      )}

      <aside className="earth-telemetry" aria-label="地球视图信息">
        <div className="telemetry-status"><i /> LIFE ATLAS · ONLINE</div>
        <div className="telemetry-coordinates">
          <strong>{Math.abs(viewport.lat).toFixed(2)}°{viewport.lat >= 0 ? "N" : "S"}</strong>
          <strong>{Math.abs(viewport.lng).toFixed(2)}°{viewport.lng >= 0 ? "E" : "W"}</strong>
        </div>
        <div className="telemetry-meta">
          <span>{zoom < 4.5 ? "ORBIT" : zoom < 8 ? "CITY" : "DISTRICT"} / Z{zoom.toFixed(1)}</span>
          <span>{filteredEntries.length} MEMORIES · {shownPlaceCount} PLACES</span>
        </div>
      </aside>

      {draftLocation && (
        <section className="place-card">
          <button className="card-close" onClick={() => setDraftLocation(null)} aria-label="取消选择"><X size={17} /></button>
          <div className="place-pin"><MapPin size={18} /></div>
          <div className="place-copy">
            <small>已选择这个区域</small>
            <strong>{draftPlace || "正在识别位置…"}</strong>
            <span>{draftLocation.lat.toFixed(4)}, {draftLocation.lng.toFixed(4)}</span>
          </div>
          <button className="record-place" onClick={openNewEntry}><Plus size={17} />记录这里</button>
        </section>
      )}

      {selected && (
        <EntryCard
          entry={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setEditorOpen(true); }}
          onDelete={() => void deleteEntry(selected)}
          relatedCount={entries.filter(entry => entry.locationName === selected.locationName).length}
          onRelated={() => { setMemoryYear("all"); setLibrarySearch(selected.locationName); setSelected(null); setLibraryOpen(true); }}
        />
      )}

      {libraryOpen && (
        <aside className="experience-library">
          <div className="library-head">
            <div><small>MY PLACES</small><h2>我的经历</h2></div>
            <button onClick={() => setLibraryOpen(false)} aria-label="关闭经历列表"><X /></button>
          </div>
          <label className="library-search"><Search size={15} /><input value={librarySearch} onChange={event => { setLibrarySearch(event.target.value); setSelected(null); }} placeholder="搜索地点、经历或标签" /></label>
          <details className="home-screen-help">
            <summary><Smartphone size={17} />添加到手机桌面</summary>
            <div>
              <p><strong>iPhone：</strong>用 Safari 打开本站，点“分享”→“添加到主屏幕”。如果有“作为 Web App 打开”，请保持开启。</p>
              <p><strong>安卓：</strong>用 Chrome 打开本站，点右上角菜单→“添加到主屏幕”或“安装应用”。</p>
              <p>在微信里打开时，请先转到手机浏览器。添加后点桌面的“人生地图”图标即可进入，首次打开可能需要重新登录同一个 ChatGPT 账号。</p>
              <p className="home-screen-note">这是需要联网的网页 App，与本站共用线上记录。</p>
            </div>
          </details>
          <div className="memory-review">
            <label className="memory-year"><CalendarDays size={16} /><span>回看</span>
              <select aria-label="回看年份" value={memoryYear} onChange={event => { setMemoryYear(event.target.value); setSelected(null); }}>
                <option value="all">全部年份</option>
                {memoryYear !== "all" && !memoryYears.includes(memoryYear) && <option value={memoryYear}>{memoryYear} 年</option>}
                {memoryYears.map(year => <option key={year} value={year}>{year} 年</option>)}
              </select>
            </label>
            <p className="memory-review-stats" role="status"><strong>{filteredEntries.length}</strong> 段经历 <span>·</span> <strong>{shownPlaceCount}</strong> 个地点</p>
            <div className="memory-review-actions">
              <button onClick={exportJournal} disabled={!filteredEntries.length}><Download size={16} />导出旅行手记</button>
              {filteringMemories && <button className="memory-filter-reset" onClick={clearMemoryFilters}>清除筛选</button>}
            </div>
            <p className="memory-export-hint">导出当前结果的文字手记，不含照片和音视频。</p>
          </div>
          <div className="library-list">
            {filteredEntries.map(entry => (
              <button key={entry.id} onClick={() => { setLibraryOpen(false); selectEntry(entry.id); }}>
                <i style={{ background: categories[entry.category]?.color }} />
                <span><small>{formatDate(entry.occurredAt)} · {entry.locationName}</small><strong>{entry.title}</strong></span>
                <span>↗</span>
              </button>
            ))}
            {!filteredEntries.length && <div className="empty-library">还没有匹配的经历</div>}
          </div>
        </aside>
      )}

      {editorOpen && (
        <EntryEditor
          key={editing?.id || `${draftLocation?.lat}-${draftLocation?.lng}`}
          initial={editing}
          coordinates={editing ? { lat: editing.latitude, lng: editing.longitude } : draftLocation!}
          placeName={editing?.locationName || draftPlace}
          onClose={() => { setEditorOpen(false); setEditing(null); }}
          onSave={saveEntry}
        />
      )}

      {mainlineOpen && <LifeMainline entries={entries} onClose={() => setMainlineOpen(false)} onEntrySelect={id => { clearMemoryFilters(); setMainlineOpen(false); selectEntry(id); }} />}
      {apiSettingsOpen && <ApiSettings onClose={() => setApiSettingsOpen(false)} />}

      {toast && <div className="toast"><Sparkles size={15} />{toast}</div>}
    </main>
  );
}

function EntryCard({ entry, onClose, onEdit, onDelete, relatedCount, onRelated }: { entry: LifeEntry; onClose: () => void; onEdit: () => void; onDelete: () => void; relatedCount: number; onRelated: () => void }) {
  const [media, setMedia] = useState<LifeMedia[]>([]);
  useEffect(() => {
    let active = true;
    fetch(`/api/media?entryId=${entry.id}`).then(async response => await response.json() as { media?: LifeMedia[] }).then(data => { if (active) setMedia(data.media || []); }).catch(() => {});
    return () => { active = false; };
  }, [entry.id]);
  const cover = media.find(item => item.contentType.startsWith("image/"));
  const emotionLabels = { calm: "平静", joy: "快乐", excitement: "兴奋", moved: "感动", longing: "思念", sadness: "悲伤", regret: "遗憾", anxiety: "焦虑", anger: "愤怒", loneliness: "孤独", confusion: "迷茫", relief: "释然" };
  const emotionLabel = (entry.emotions?.length ? entry.emotions : [entry.emotion || "calm"]).map(value => emotionLabels[value as keyof typeof emotionLabels]).filter(Boolean).join("、") || "平静";
  const phaseLabel = { turning: "转折", low: "低谷", rebirth: "重生" }[entry.lifePhase || ""];
  return (
    <section className="entry-map-card">
      <div className="entry-card-actions">
        <button onClick={onEdit} aria-label="编辑经历"><Edit3 size={16} /></button>
        <button onClick={onClose} aria-label="关闭"><X size={17} /></button>
      </div>
      {cover && <img className="entry-card-cover" src={cover.url} alt="" />}
      <div className="entry-card-meta"><i style={{ background: categories[entry.category]?.color }} />{emotionLabel}{phaseLabel ? ` · ${phaseLabel}` : ""} · {formatDate(entry.occurredAt)}</div>
      <h2>{entry.title}</h2>
      <div className="entry-card-place"><MapPin size={14} />{entry.locationName}</div>
      {entry.summary && <p className="entry-card-summary">{entry.summary}</p>}
      {entry.detail && <p className="entry-card-detail">{entry.detail}</p>}
      <div className="entry-card-tags">{entry.tags.map(tag => <span key={tag}>#{tag}</span>)}</div>
      {entry.people && <div className="entry-card-people">与 {entry.people} 一起</div>}
      <button className="related-memories" onClick={onRelated}>查看这个地点的其他经历（{relatedCount}）</button>
      <button className="entry-delete" onClick={onDelete}><Trash2 size={14} />删除</button>
    </section>
  );
}

function EntryEditor(props: MemoryEditorProps) {
  return <MemoryEditor {...props} />;
}

export function LegacyEntryEditor({ initial, coordinates, placeName, onClose, onSave }: { initial: LifeEntry | null; coordinates: Coordinates; placeName: string; onClose: () => void; onSave: (payload: Partial<LifeEntry>) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [occurredAt, setOccurredAt] = useState(localDateTime(initial?.occurredAt));
  const [locationName] = useState(placeName || "未命名地点");
  const [category, setCategory] = useState(initial?.category || "growth");
  const [people, setPeople] = useState(initial?.people || "");
  const [rawDetail, setRawDetail] = useState(initial?.detail || "");
  const [polishedDetail, setPolishedDetail] = useState(initial?.detail || "");
  const [summary, setSummary] = useState(initial?.summary || "");
  const [lessons, setLessons] = useState(initial?.lessons || "");
  const [tags, setTags] = useState(initial?.tags.join("，") || "");
  const [tone, setTone] = useState("honest");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiMode, setAiMode] = useState<"openai" | "local" | null>(null);
  const [aiResultMode, setAiResultMode] = useState<"openai" | "local" | null>(null);
  const [aiState, setAiState] = useState<"idle" | "success" | "error">("idle");
  const [aiError, setAiError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function checkAiStatus() {
      try {
        const response = await fetch("/api/ai/refine");
        const data = await response.json() as { configured?: boolean; mode?: "openai" | "local" };
        if (active) { setAiConfigured(Boolean(data.configured)); setAiMode(data.mode || "local"); }
      } catch {
        if (active) { setAiConfigured(false); setAiMode("local"); }
      }
    }
    void checkAiStatus();
    return () => { active = false; };
  }, []);

  const refineWithAi = async () => {
    if (rawDetail.trim().length < 8) {
      setAiState("error");
      setAiError("请先写下至少一两句真实片段。");
      return;
    }
    setAiBusy(true); setAiState("idle"); setAiError("");
    try {
      const response = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, locationName, occurredAt, detail: rawDetail, polishedDetail, summary, lessons, people, tags: tags.split(/[,，\s]+/).filter(Boolean), tone }),
      });
      const data = await response.json() as { refined?: { summary: string; detail: string; lessons: string; tags: string[] }; error?: string; mode?: "openai" | "local" };
      if (!response.ok || !data.refined) throw new Error(data.error || "AI 完善失败");
      setSummary(data.refined.summary);
      setPolishedDetail(data.refined.detail);
      setLessons(data.refined.lessons);
      setTags(data.refined.tags.join("，"));
      setAiResultMode(data.mode || (aiConfigured ? "openai" : "local"));
      setAiState("success");
    } catch (cause) {
      setAiState("error");
      setAiError(cause instanceof Error ? cause.message : "AI 完善失败");
    } finally {
      setAiBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await onSave({
        id: initial?.id,
        title,
        occurredAt: new Date(occurredAt).toISOString(),
        locationName,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        category,
        status: initial?.status || "memory",
        mood: initial?.mood || 4,
        significance: initial?.significance || 3,
        people,
        detail: polishedDetail.trim() || rawDetail,
        summary,
        lessons,
        tags: tags.split(/[,，\s]+/).filter(Boolean),
        trackId: initial?.trackId || null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败"); setBusy(false);
    }
  };

  return (
    <div className="editor-backdrop">
      <form className="experience-editor" onSubmit={submit}>
        <header className="editor-head">
          <div><small>{initial ? "EDIT MEMORY" : "NEW MEMORY"}</small><h2>{initial ? "编辑这段经历" : "记录这里发生的事"}</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭编辑器"><X /></button>
        </header>

        <div className="editor-body">
          <div className="editor-place"><MapPin size={16} /><div><strong>{locationName}</strong><small>{coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}</small></div></div>
          <div className="editor-grid">
            <label className="wide"><span>经历标题 *</span><input required value={title} onChange={event => setTitle(event.target.value)} placeholder="给这段经历一个名字" /></label>
            <label><span>发生时间</span><input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} /></label>
            <label><span>类型</span><select value={category} onChange={event => setCategory(event.target.value)}>{Object.entries(categories).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            <label className="wide"><span>与谁一起</span><input value={people} onChange={event => setPeople(event.target.value)} placeholder="自己，或陪在你身边的人" /></label>
            <label className="wide raw-memory"><span>先写下你真实记得的片段 *</span><textarea required rows={6} value={rawDetail} onChange={event => { setRawDetail(event.target.value); if (aiState === "success") setAiState("idle"); }} placeholder="不用写得完整。场景、一句话、当时的感受……先把记得的留下来。" /></label>
          </div>

          <section className={`ai-refine-box ${aiMode === "local" ? "local-mode" : ""}`}>
            <div className="ai-refine-copy"><span><Sparkles size={16} />{aiMode === "local" ? "本地智能整理" : "AI 帮我完善"}</span><small>只整理你提供的事实，不会凭空编造细节。</small></div>
            <select value={tone} onChange={event => setTone(event.target.value)} aria-label="AI 润色风格"><option value="honest">克制真诚</option><option value="literary">细腻叙事</option><option value="concise">简洁日记</option></select>
            <button type="button" onClick={refineWithAi} disabled={aiBusy || aiConfigured === null}>{aiBusy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{aiBusy ? "正在整理…" : aiConfigured === null ? "检查能力…" : aiMode === "local" ? "本地整理" : "AI 完善"}</button>
            <div className={`ai-status-line ${aiState}`}>
              {aiMode === "local" && aiState === "idle" && <span>当前使用本地整理：自动断句、分段、清理重复、提取摘要与标签，内容不会离开你的电脑。</span>}
              {aiConfigured === true && aiState === "idle" && <span>AI 已连接，完善后的内容会单独出现在下方。</span>}
              {aiState === "success" && <span>{aiResultMode === "local" ? "本地整理已完成" : "AI 完善已完成"}，你可以在下方继续手动修改。</span>}
              {aiState === "error" && aiError && <span>{aiError}</span>}
            </div>
          </section>

          <div className="editor-grid polished-fields">
            <div className="polished-heading wide"><span>完善结果</span><small>原始片段会保留在上方，不会被覆盖。</small></div>
            <label className="wide"><span>一句话摘要</span><input value={summary} onChange={event => setSummary(event.target.value)} placeholder="这段经历最想留下的一句话" /></label>
            <label className="wide"><span>完整经历</span><textarea rows={6} value={polishedDetail} onChange={event => setPolishedDetail(event.target.value)} placeholder="AI 完善成功后会显示在这里；也可以手动填写。" /></label>
            <label className="wide"><span>我从中带走了什么</span><textarea rows={3} value={lessons} onChange={event => setLessons(event.target.value)} /></label>
            <label className="wide"><span>标签</span><input value={tags} onChange={event => setTags(event.target.value)} placeholder="城市漫步，第一次，重要的人" /></label>
          </div>
          {error && <div className="editor-error">{error}</div>}
        </div>

        <footer className="editor-actions">
          <button type="button" onClick={onClose}>取消</button>
          <button className="save-memory" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}<MapPin size={16} />保存到地图</button>
        </footer>
      </form>
    </div>
  );
}
