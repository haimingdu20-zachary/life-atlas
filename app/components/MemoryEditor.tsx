"use client";
/* eslint-disable @next/next/no-img-element -- previews use local object URLs and private media endpoints */

import {
  Camera, Check, ChevronDown, Clock3, Edit3, FileAudio, Globe2, ImagePlus, LoaderCircle,
  Lock, MapPin, Mic, Paperclip, Pencil, Plus, RotateCcw, Save, Sparkles, Trash2, Users, Video, X,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { LifeEntry, LifeMedia, LifeTrack } from "../lib/types";
import { aiRequestHeaders } from "../lib/ai-settings";

type Coordinates = { lat: number; lng: number };
export type PendingMedia = { id: string; file: File; url: string; stage: "start" | "moment" | "end"; capturedAt?: string; latitude?: number; longitude?: number };
type Suggestion = { title: string; summary: string; detail: string; lessons: string; emotion: string; emotions: string[]; lifePhase: string; people: string[]; tags: string[] };
type SuggestionOriginal = { title: string; summary: string; detail: string; lessons: string };
type Draft = { title?: string; rawDetail?: string; summary?: string; story?: string; lessons?: string; people?: string; tags?: string; emotion?: string; emotions?: string[]; lifePhase?: string; visibility?: string; occurredAt?: string; endedAt?: string; category?: string; trackId?: string };

export type MemoryEditorProps = {
  initial: LifeEntry | null;
  coordinates: Coordinates;
  placeName: string;
  onClose: () => void;
  onSave: (payload: Partial<LifeEntry>, media: PendingMedia[]) => Promise<void>;
};

const emotions = [
  ["calm", "平静", "#9eb7b4"], ["joy", "快乐", "#f3d36b"], ["excitement", "兴奋", "#ff9d5c"],
  ["moved", "感动", "#ef9bb1"], ["longing", "思念", "#b9a1dc"], ["sadness", "悲伤", "#7890a6"],
  ["regret", "遗憾", "#a98ac4"], ["anxiety", "焦虑", "#e7b56a"], ["anger", "愤怒", "#e77967"],
  ["loneliness", "孤独", "#75899a"], ["confusion", "迷茫", "#a0a6a5"], ["relief", "释然", "#86ddb0"],
] as const;

const lifePhases = [["", "无", "#899996"], ["turning", "转折", "#ff9665"], ["low", "低谷", "#7890a6"], ["rebirth", "重生", "#86ddb0"]] as const;

const styles = [
  ["original", "保留原话"], ["diary", "日记叙事"], ["honest", "克制真诚"],
  ["literary", "文学回忆"], ["growth", "成长复盘"], ["storymaster", "叙事润色"], ["grammar", "仅纠正语病"],
] as const;

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function loadDraft(key: string): Draft {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(window.localStorage.getItem(key) || "{}"); } catch { return {}; }
}

export default function MemoryEditor({ initial, coordinates, placeName, onClose, onSave }: MemoryEditorProps) {
  const draftKey = `life-atlas-draft-${initial?.id || `${coordinates.lat.toFixed(3)}-${coordinates.lng.toFixed(3)}`}`;
  const [draft] = useState(() => loadDraft(draftKey));
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [title, setTitle] = useState(draft.title ?? initial?.title ?? "");
  const [rawDetail, setRawDetail] = useState(draft.rawDetail ?? initial?.rawDetail ?? initial?.detail ?? "");
  const [summary, setSummary] = useState(draft.summary ?? initial?.summary ?? "");
  const [story, setStory] = useState(draft.story ?? initial?.detail ?? "");
  const [lessons, setLessons] = useState(draft.lessons ?? initial?.lessons ?? "");
  const [people, setPeople] = useState(draft.people ?? initial?.people ?? "");
  const [tags, setTags] = useState(draft.tags ?? initial?.tags.join("，") ?? "");
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>(() => draft.emotions?.length ? draft.emotions : initial?.emotions?.length ? initial.emotions : [draft.emotion ?? initial?.emotion ?? "calm"]);
  const emotion = selectedEmotions[0] || "calm";
  const [lifePhase, setLifePhase] = useState(draft.lifePhase ?? initial?.lifePhase ?? "");
  const [visibility, setVisibility] = useState(draft.visibility ?? initial?.visibility ?? "private");
  const [occurredAt, setOccurredAt] = useState(draft.occurredAt ?? localDateTime(initial?.occurredAt));
  const [endedAt, setEndedAt] = useState(draft.endedAt ?? (initial?.endedAt ? localDateTime(initial.endedAt) : ""));
  const [category, setCategory] = useState(draft.category ?? initial?.category ?? "growth");
  const [trackId, setTrackId] = useState(draft.trackId ?? initial?.trackId ?? "");
  const [latitude, setLatitude] = useState(coordinates.lat);
  const [longitude, setLongitude] = useState(coordinates.lng);
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [savedMedia, setSavedMedia] = useState<LifeMedia[]>([]);
  const [tracks, setTracks] = useState<LifeTrack[]>([]);
  const [chapterEditorOpen, setChapterEditorOpen] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestionOriginal, setSuggestionOriginal] = useState<SuggestionOriginal | null>(null);
  const [suggestionPeopleText, setSuggestionPeopleText] = useState("");
  const [suggestionTagsText, setSuggestionTagsText] = useState("");
  const [suggestionTone, setSuggestionTone] = useState("");
  const [aiMode, setAiMode] = useState<"openai" | "deepseek" | "local" | null>(null);
  const [tone, setTone] = useState("honest");
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedDraftAt, setSavedDraftAt] = useState<Date | null>(null);
  const [recording, setRecording] = useState(false);
  const [metadataSuggestion, setMetadataSuggestion] = useState<{ capturedAt?: string; latitude?: number; longitude?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop(): void } | null>(null);
  const mediaRef = useRef<PendingMedia[]>([]);

  useEffect(() => {
    let active = true;
    async function loadAuxiliaryData() {
      const requests: Promise<void>[] = [fetch("/api/tracks").then(async response => await response.json() as { tracks?: LifeTrack[] }).then(data => { if (active) setTracks(data.tracks || []); })];
      if (initial?.id) requests.push(fetch(`/api/media?entryId=${initial.id}`).then(async response => await response.json() as { media?: LifeMedia[] }).then(data => { if (active) setSavedMedia(data.media || []); }));
      await Promise.allSettled(requests);
    }
    void loadAuxiliaryData();
    return () => { active = false; };
  }, [initial?.id]);

  useEffect(() => {
    let active = true;
    const refreshAiMode = async () => {
      try {
        const response = await fetch("/api/ai/refine", { headers: aiRequestHeaders() });
        const data = await response.json() as { mode?: "openai" | "deepseek" | "local" };
        if (active) setAiMode(data.mode || "local");
      } catch { if (active) setAiMode("local"); }
    };
    const changed = () => { void refreshAiMode(); };
    void refreshAiMode();
    window.addEventListener("life-atlas-ai-settings-changed", changed);
    return () => { active = false; window.removeEventListener("life-atlas-ai-settings-changed", changed); };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const value: Draft = { title, rawDetail, summary, story, lessons, people, tags, emotion, emotions: selectedEmotions, lifePhase, visibility, occurredAt, endedAt, category, trackId };
      window.localStorage.setItem(draftKey, JSON.stringify(value));
      setSavedDraftAt(new Date());
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftKey, title, rawDetail, summary, story, lessons, people, tags, emotion, selectedEmotions, lifePhase, visibility, occurredAt, endedAt, category, trackId]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (rawDetail.trim() || media.length) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rawDetail, media.length]);

  useEffect(() => { mediaRef.current = media; }, [media]);
  useEffect(() => () => { mediaRef.current.forEach(item => URL.revokeObjectURL(item.url)); }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: PendingMedia[] = [];
    for (const file of Array.from(files)) {
      const item: PendingMedia = { id: crypto.randomUUID(), file, url: URL.createObjectURL(file), stage: "moment" };
      if (file.type.startsWith("image/")) {
        try {
          const exifr = await import("exifr");
          const metadata = await exifr.parse(file, { tiff: true, exif: true, gps: true });
          if (metadata?.DateTimeOriginal instanceof Date) item.capturedAt = localDateTime(metadata.DateTimeOriginal.toISOString());
          if (Number.isFinite(metadata?.latitude) && Number.isFinite(metadata?.longitude)) { item.latitude = metadata.latitude; item.longitude = metadata.longitude; }
          if (item.capturedAt || item.latitude !== undefined) setMetadataSuggestion({ capturedAt: item.capturedAt, latitude: item.latitude, longitude: item.longitude });
        } catch { /* Images without EXIF are valid. */ }
      }
      added.push(item);
    }
    setMedia(current => [...current, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const applyMetadata = () => {
    if (metadataSuggestion?.capturedAt) setOccurredAt(metadataSuggestion.capturedAt);
    if (metadataSuggestion?.latitude !== undefined) setLatitude(metadataSuggestion.latitude);
    if (metadataSuggestion?.longitude !== undefined) setLongitude(metadataSuggestion.longitude);
    setMetadataSuggestion(null);
  };

  const removeSavedMedia = async (id: string) => {
    const response = await fetch(`/api/media?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return setError("无法删除这个媒体文件");
    setSavedMedia(current => current.filter(item => item.id !== id));
  };

  const removePendingMedia = (id: string) => {
    setMedia(current => {
      const target = current.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter(item => item.id !== id);
    });
  };

  const openChapterEditor = (track?: LifeTrack) => {
    setEditingChapterId(track?.id || null);
    setChapterTitle(track?.title || "");
    setChapterError("");
    setChapterEditorOpen(true);
  };

  const saveChapter = async () => {
    const normalizedTitle = chapterTitle.trim();
    if (normalizedTitle.length < 2) return setChapterError("章节名称至少需要两个字。");
    setChapterBusy(true); setChapterError("");
    const editingTrack = tracks.find(track => track.id === editingChapterId);
    const start = new Date(occurredAt);
    const end = endedAt ? new Date(endedAt) : new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
    const payload = editingTrack ? { ...editingTrack, title: normalizedTitle } : {
      title: normalizedTitle,
      description: "自定义人生章节",
      why: "用于整理同一阶段发生的经历。",
      nextStep: "继续补充这一章节的经历",
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      status: "active",
      progress: 0,
      color: "#ff9665",
      sortOrder: Date.now(),
    };
    try {
      const response = await fetch("/api/tracks", { method: editingTrack ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { track?: LifeTrack; error?: string };
      if (!response.ok || !data.track) throw new Error(data.error || "保存章节失败");
      setTracks(current => editingTrack ? current.map(track => track.id === data.track!.id ? data.track! : track) : [...current, data.track!]);
      setTrackId(data.track.id); setChapterEditorOpen(false); setEditingChapterId(null); setChapterTitle("");
    } catch (cause) {
      setChapterError(cause instanceof Error ? cause.message : "保存章节失败");
    } finally { setChapterBusy(false); }
  };

  const startVoiceInput = () => {
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
    const Recognition = (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; continuous: boolean; interimResults: boolean; onresult: (event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void; onend: () => void; start(): void; stop(): void } }).webkitSpeechRecognition;
    if (!Recognition) return setError("当前浏览器不支持实时语音转写，可以上传录音文件。");
    const recognition = new Recognition();
    recognition.lang = "zh-CN"; recognition.continuous = true; recognition.interimResults = false;
    recognition.onresult = event => { let transcript = ""; for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) transcript += event.results[index][0].transcript; if (transcript) setRawDetail(current => `${current}${current ? "\n" : ""}${transcript}`); };
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition; recognition.start(); setRecording(true); setError("");
  };

  const refine = async () => {
    if (rawDetail.trim().length < 8) return setError("请先写下至少一两句真实片段。");
    setAiBusy(true); setError("");
    try {
      const response = await fetch("/api/ai/refine", { method: "POST", headers: { "Content-Type": "application/json", ...aiRequestHeaders() }, body: JSON.stringify({ title, locationName: placeName, occurredAt, detail: rawDetail, polishedDetail: story, summary, lessons, people, tags: tags.split(/[,，\s]+/).filter(Boolean), tone }) });
      const data = await response.json() as { refined?: Suggestion; error?: string; mode?: "openai" | "deepseek" | "local" };
      if (!response.ok || !data.refined) throw new Error(data.error || "整理失败");
      setSuggestionOriginal({ title, summary, detail: rawDetail, lessons });
      setSuggestion(data.refined); setSuggestionPeopleText(data.refined.people.join("，")); setSuggestionTagsText(data.refined.tags.join("，")); setSuggestionTone(tone); setAiMode(data.mode || aiMode || "local");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "整理失败"); }
    finally { setAiBusy(false); }
  };

  const toggleEmotion = (value: string) => {
    setSelectedEmotions(current => {
      if (value === "calm") return ["calm"];
      const withoutCalm = current.filter(item => item !== "calm");
      if (withoutCalm.includes(value)) {
        const next = withoutCalm.filter(item => item !== value);
        return next.length ? next : ["calm"];
      }
      return [...withoutCalm, value];
    });
  };

  const acceptAll = () => {
    if (!suggestion) return;
    setTitle(suggestion.title); setSummary(suggestion.summary); setStory(suggestion.detail); setLessons(suggestion.lessons); setSelectedEmotions(suggestion.emotions?.length ? suggestion.emotions : [suggestion.emotion]); setLifePhase(suggestion.lifePhase || ""); setPeople(suggestion.people.join("，")); setTags(suggestion.tags.join("，"));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rawDetail.trim()) return setError("请先写下这段经历。");
    setBusy(true); setError("");
    const finalTitle = title.trim() || suggestion?.title || summary.trim() || rawDetail.trim().slice(0, 24) || "未命名经历";
    try {
      await onSave({ id: initial?.id, title: finalTitle, occurredAt: new Date(occurredAt).toISOString(), endedAt: endedAt ? new Date(endedAt).toISOString() : null, locationName: placeName, latitude, longitude, category, status: initial?.status || "memory", mood: initial?.mood || 4, significance: initial?.significance || 3, summary, rawDetail, detail: story.trim() || rawDetail, lessons, people, emotion, emotions: selectedEmotions, lifePhase, visibility, tags: tags.split(/[,，\s]+/).filter(Boolean), trackId: trackId || null }, media);
      window.localStorage.removeItem(draftKey);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); setBusy(false); }
  };

  const cover = media.find(item => item.file.type.startsWith("image/"))?.url || savedMedia.find(item => item.contentType.startsWith("image/"))?.url;
  const activeEmotion = emotions.find(item => item[0] === emotion) || emotions[0];
  const activeEmotionLabels = selectedEmotions.map(value => emotions.find(item => item[0] === value)?.[1]).filter(Boolean).join("、") || "平静";
  const activePhase = lifePhases.find(item => item[0] === lifePhase) || lifePhases[0];

  return (
    <div className="memory-editor-backdrop">
      <form className="memory-studio" onSubmit={submit}>
        <header className="studio-header">
          <div className="studio-heading"><small>NEW MEMORY</small><h2>{initial ? "编辑这段经历" : "把这段人生轻轻放回地图"}</h2></div>
          <div className="record-mode" aria-label="记录模式"><button type="button" className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}>30 秒记录</button><button type="button" className={mode === "full" ? "active" : ""} onClick={() => setMode("full")}>完整经历</button></div>
          <button className="studio-close" type="button" onClick={onClose} aria-label="关闭记录器"><X /></button>
        </header>

        <div className="studio-layout">
          <div className="studio-write">
            <section className="quick-fields">
              <div className="compact-context"><span><MapPin size={14} />{placeName}</span><label><Clock3 size={14} /><input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} /></label></div>
              <input className="memory-title-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="经历标题（可不填，由 AI 生成）" />
              <div className="story-input-wrap"><textarea value={rawDetail} onChange={event => setRawDetail(event.target.value)} rows={9} placeholder="发生了什么？\n\n不用组织语言，可以直接粘贴一段杂乱的描述。" required /><div className="story-tools"><button type="button" className={recording ? "recording" : ""} onClick={startVoiceInput}><Mic size={15} />{recording ? "停止转写" : "语音转写"}</button><span>{rawDetail.length} 字</span></div></div>
            </section>

            <section className="scene-media">
              <div className="section-line"><div><small>02 · ADD THE SCENE</small><h3>添加现场</h3></div><button type="button" onClick={() => fileInputRef.current?.click()}><ImagePlus size={15} />照片、视频、语音或文件</button></div>
              <input ref={fileInputRef} hidden type="file" multiple accept="image/*,video/*,audio/*,.pdf,.txt,.json" onChange={event => void handleFiles(event.target.files)} />
              {metadataSuggestion && <div className="metadata-suggestion"><Camera size={15} /><span>发现照片的拍摄时间或位置，是否用于这段经历？</span><button type="button" onClick={applyMetadata}>采用</button><button type="button" onClick={() => setMetadataSuggestion(null)}>忽略</button></div>}
              <div className="media-timeline">
                {[...savedMedia.map(item => ({ id: item.id, name: item.fileName, type: item.contentType, url: item.url, stage: item.stage, saved: true })), ...media.map(item => ({ id: item.id, name: item.file.name, type: item.file.type, url: item.url, stage: item.stage, saved: false }))].map(item => (
                  <article className="media-chip" key={item.id}>{item.type.startsWith("image/") ? <img src={item.url} alt="" /> : item.type.startsWith("video/") ? <Video /> : item.type.startsWith("audio/") ? <FileAudio /> : <Paperclip />}<span><strong>{item.name}</strong><small>{item.type.split("/")[0]}</small></span>{!item.saved && <select value={item.stage} onChange={event => setMedia(current => current.map(mediaItem => mediaItem.id === item.id ? { ...mediaItem, stage: event.target.value as PendingMedia["stage"] } : mediaItem))}><option value="start">开始</option><option value="moment">经过</option><option value="end">结束</option></select>}<button type="button" onClick={() => item.saved ? void removeSavedMedia(item.id) : removePendingMedia(item.id)} aria-label={`移除${item.name}`}><Trash2 size={13} /></button></article>
                ))}
                {!media.length && !savedMedia.length && <button className="empty-media" type="button" onClick={() => fileInputRef.current?.click()}><Camera size={18} /><span>留下一张照片或一段声音</span></button>}
              </div>
            </section>

            <section className="ai-inline">
              <div className="ai-inline-head"><div><small>03 · ORGANIZE</small><h3><Sparkles size={16} />{aiMode === "deepseek" ? "DeepSeek 帮我整理" : aiMode === "openai" ? "OpenAI 帮我整理" : "本地智能整理"}</h3><p>只整理你提供的事实，不新增人物和情节。</p></div><select aria-label="整理风格" value={tone} onChange={event => setTone(event.target.value)}>{styles.map(item => <option value={item[0]} key={item[0]}>{item[1]}</option>)}</select><button type="button" onClick={refine} disabled={aiBusy}>{aiBusy ? <LoaderCircle className="spin" /> : <Sparkles />} {suggestion ? "重新生成" : "帮我整理"}</button></div>
              {tone === "storymaster" && <div className="storymaster-note"><strong>Storytelling Mastery</strong><span>保留事实和个人语气，润色句子、段落、转折与收尾；不会补写场景或情节。</span></div>}
              {suggestion && <div className="suggestions"><div className="suggestion-toolbar"><span>{suggestionTone !== tone ? "模板已更改，重新生成后会覆盖当前修改" : "已生成 7 项建议，均可直接编辑"}</span><button type="button" onClick={acceptAll}><Check size={14} />全部接受修改</button></div>
                <SuggestionCard label="标题" original={suggestionOriginal?.title || "未填写"} suggestion={suggestion.title} onChange={value => setSuggestion(current => current ? { ...current, title: value } : current)} onAccept={() => setTitle(suggestion.title)} onKeep={() => setTitle(suggestionOriginal?.title || "")} />
                <SuggestionCard label="一句话概括" original={suggestionOriginal?.summary || "未填写"} suggestion={suggestion.summary} onChange={value => setSuggestion(current => current ? { ...current, summary: value } : current)} onAccept={() => setSummary(suggestion.summary)} onKeep={() => setSummary(suggestionOriginal?.summary || "")} />
                <SuggestionCard label="完整叙事" original={suggestionOriginal?.detail || rawDetail} suggestion={suggestion.detail} onChange={value => setSuggestion(current => current ? { ...current, detail: value } : current)} onAccept={() => setStory(suggestion.detail)} onKeep={() => setStory(suggestionOriginal?.detail || rawDetail)} large />
                <SuggestionCard label="这件事对我的影响" original={suggestionOriginal?.lessons || "未填写"} suggestion={suggestion.lessons} placeholder="可以补充这件事对你的影响" onChange={value => setSuggestion(current => current ? { ...current, lessons: value } : current)} onAccept={() => setLessons(suggestion.lessons)} onKeep={() => setLessons(suggestionOriginal?.lessons || "")} />
                <div className="detected-facts editable-facts">
                  <label><span>主要情绪</span><div><select aria-label="编辑 AI 建议的主要情绪" value={suggestion.emotion} onChange={event => { const value = event.target.value; setSuggestion(current => current ? { ...current, emotion: value, emotions: [value, ...current.emotions.filter(item => item !== value)].slice(0, 6) } : current); }}>{emotions.map(item => <option value={item[0]} key={item[0]}>{item[1]}</option>)}</select><button type="button" aria-label="接受情绪建议" onClick={() => setSelectedEmotions(suggestion.emotions?.length ? suggestion.emotions : [suggestion.emotion])}>接受</button></div></label>
                  <label><span>人生阶段</span><div><select aria-label="编辑 AI 建议的人生阶段" value={suggestion.lifePhase} onChange={event => setSuggestion(current => current ? { ...current, lifePhase: event.target.value } : current)}>{lifePhases.map(item => <option value={item[0]} key={item[0] || "none"}>{item[1]}</option>)}</select><button type="button" aria-label="接受阶段建议" onClick={() => setLifePhase(suggestion.lifePhase || "")}>接受</button></div></label>
                  <label><span>人物</span><div><input aria-label="编辑 AI 建议的人物" value={suggestionPeopleText} onChange={event => { const value = event.target.value; setSuggestionPeopleText(value); setSuggestion(current => current ? { ...current, people: value.split(/[,，、]/).map(item => item.trim()).filter(Boolean).slice(0, 8) } : current); }} placeholder="用逗号分隔" /><button type="button" aria-label="接受人物建议" onClick={() => setPeople(suggestionPeopleText)}>接受</button></div></label>
                  <label><span>标签</span><div><input aria-label="编辑 AI 建议的标签" value={suggestionTagsText} onChange={event => { const value = event.target.value; setSuggestionTagsText(value); setSuggestion(current => current ? { ...current, tags: value.split(/[,，、\s]+/).map(item => item.trim()).filter(Boolean).slice(0, 6) } : current); }} placeholder="用逗号分隔" /><button type="button" aria-label="接受标签建议" onClick={() => setTags(suggestionTagsText)}>接受</button></div></label>
                </div>
              </div>}
            </section>

            <details className="more-memory" open={mode === "full"}><summary>更多信息 <ChevronDown size={15} /></summary><div className="more-grid">
              <label><span>结束时间（可选）</span><input type="datetime-local" value={endedAt} onChange={event => setEndedAt(event.target.value)} /></label>
              <div className="wide chapter-field"><span>人生章节</span><div className="chapter-picker"><select aria-label="人生章节" value={trackId} onChange={event => { setTrackId(event.target.value); setChapterEditorOpen(false); }}><option value="">暂不归类</option>{tracks.map(track => <option value={track.id} key={track.id}>{track.title}</option>)}</select><button type="button" onClick={() => openChapterEditor()}><Plus size={13} />新建章节</button>{trackId && <button type="button" onClick={() => openChapterEditor(tracks.find(track => track.id === trackId))}><Edit3 size={13} />编辑章节</button>}</div>{chapterEditorOpen && <div className="chapter-inline-editor"><input aria-label="章节名称" value={chapterTitle} onChange={event => setChapterTitle(event.target.value)} placeholder="输入自己的章节名称" /><button type="button" onClick={() => { setChapterEditorOpen(false); setChapterError(""); }}>取消</button><button type="button" className="save-chapter" onClick={() => void saveChapter()} disabled={chapterBusy}>{chapterBusy && <LoaderCircle className="spin" size={13} />}{editingChapterId ? "保存修改" : "保存章节"}</button>{chapterError && <small>{chapterError}</small>}</div>}</div>
              <div className="wide more-field"><span>当时的情绪（可多选）</span><div className="emotion-options">{emotions.map(item => <button type="button" aria-pressed={selectedEmotions.includes(item[0])} className={selectedEmotions.includes(item[0]) ? "active" : ""} onClick={() => toggleEmotion(item[0])} key={item[0]}><i style={{ background: item[2] }} />{item[1]}</button>)}</div></div>
              <div className="wide more-field"><span>人生阶段标记（可选）</span><div className="emotion-options phase-options">{lifePhases.map(item => <button type="button" className={lifePhase === item[0] ? "active" : ""} onClick={() => setLifePhase(item[0])} key={item[0] || "none"}><i style={{ background: item[2] }} />{item[1]}</button>)}</div></div>
              <label><span><Users size={13} />与谁一起</span><input value={people} onChange={event => setPeople(event.target.value)} placeholder="输入姓名，用逗号分隔" /></label>
              <label><span>标签</span><input value={tags} onChange={event => setTags(event.target.value)} /></label>
              <label className="wide"><span>这件事对我的影响</span><textarea rows={3} value={lessons} onChange={event => setLessons(event.target.value)} /></label>
              <label><span>类型</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="growth">成长</option><option value="adventure">探索</option><option value="work">作品</option><option value="relationship">关系</option><option value="health">身心</option><option value="reflection">反思</option></select></label>
              <label><span>私密等级</span><select value={visibility} onChange={event => setVisibility(event.target.value)}><option value="private">仅自己可见</option><option value="shared">指定的人可见</option><option value="public">公开</option></select></label>
            </div></details>
            {error && <div className="studio-error">{error}</div>}
          </div>

          <aside className="memory-preview">
            <div className="preview-label"><span>LIVE PREVIEW</span><small>保存后在地图上的样子</small></div>
            <div className="preview-map"><div className="preview-grid" /><span className="preview-dot" style={{ boxShadow: `0 0 0 10px ${activeEmotion[2]}24, 0 0 35px ${activeEmotion[2]}`, background: activeEmotion[2] }} /><div className="preview-coordinates"><MapPin size={13} />{placeName}<small>{latitude.toFixed(4)}, {longitude.toFixed(4)}</small></div></div>
            <article className="preview-memory-card">{cover ? <img className="preview-cover" src={cover} alt="记忆封面预览" /> : <div className="preview-cover empty"><Camera size={23} /><span>添加照片后会成为记忆封面</span></div>}<div className="preview-card-body"><div className="preview-meta"><i style={{ background: activeEmotion[2] }} />{activeEmotionLabels}{lifePhase ? ` · ${activePhase[1]}` : ""} · {new Date(occurredAt).toLocaleDateString("zh-CN")}</div><h3>{title || suggestion?.title || "这段经历的标题"}</h3><p>{summary || suggestion?.summary || rawDetail.slice(0, 70) || "你写下的一句话摘要会出现在这里。"}</p>{people && <span className="preview-people"><Users size={12} />{people}</span>}<div className="preview-tags">{tags.split(/[,，\s]+/).filter(Boolean).slice(0, 4).map(tag => <span key={tag}>#{tag}</span>)}</div></div></article>
            <div className="preview-timeline"><strong>照片时间线</strong>{["start", "moment", "end"].map((stage, index) => <div key={stage}><i className={media.some(item => item.stage === stage) ? "filled" : ""}>{index + 1}</i><span>{stage === "start" ? "开始" : stage === "moment" ? "经过" : "结束"}</span></div>)}</div>
            <div className="privacy-note"><Lock size={13} />{visibility === "private" ? "默认仅你自己可见" : visibility === "shared" ? "仅指定的人可见" : "这段记忆将公开"}</div>
          </aside>
        </div>

        <footer className="studio-footer"><div className="draft-state"><Save size={13} />{savedDraftAt ? `草稿已于 ${savedDraftAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 自动保存` : "正在保护草稿"}</div><button type="button" onClick={onClose}>稍后继续</button><button className="private-save" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : visibility === "public" ? <Globe2 /> : <Lock />}{visibility === "public" ? "保存并公开" : "保存为私人记忆"}</button></footer>
      </form>
    </div>
  );
}

function SuggestionCard({ label, original, suggestion, placeholder, onChange, onAccept, onKeep, large = false }: { label: string; original: string; suggestion: string; placeholder?: string; onChange: (value: string) => void; onAccept: () => void; onKeep: () => void; large?: boolean }) {
  return <article className={`suggestion-card editable ${large ? "large" : ""}`}><header><strong>{label}</strong><div><button type="button" onClick={onAccept}><Check size={13} />接受</button><button type="button" onClick={onKeep}><RotateCcw size={13} />保留原文</button></div></header><div className="suggestion-compare"><div><small>原文</small><p>{original}</p></div><div className="suggestion-edit"><small><Pencil size={11} />AI 整理后 · 可编辑</small><textarea aria-label={`编辑 AI 建议：${label}`} rows={large ? 8 : label === "标题" ? 2 : 4} value={suggestion} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></div></div></article>;
}
