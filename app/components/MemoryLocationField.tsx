"use client";

import { LoaderCircle, MapPin, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PlaceResult = { name: string; lat: number; lng: number; type?: string };
type Props = {
  value: string;
  identifying: boolean;
  latitude: number;
  longitude: number;
  onChange: (name: string) => void;
  onSelect: (place: PlaceResult) => void;
};

export default function MemoryLocationField({ value, identifying, latitude, longitude, onChange, onSelect }: Props) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const changeName = (name: string) => {
    requestRef.current?.abort();
    setBusy(false); setResults([]); setMessage(""); onChange(name);
  };

  const search = async () => {
    if (!value.trim()) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true); setResults([]); setMessage("");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(value.trim())}`, { signal: controller.signal });
      if (!response.ok) throw new Error("lookup failed");
      const data = await response.json() as { results?: PlaceResult[]; source?: string };
      if (controller.signal.aborted) return;
      setResults(data.results || []);
      if (data.source === "offline") setMessage("详细地图服务暂不可用，可先保存填写的地点；搜索结果仅支持城市。地图位置保持当前选点，选择结果后才会移动。");
      else if (!data.results?.length) setMessage("暂未找到这个地点，试试加上城市、分店名或街道。也可以直接保存填写的地点，地图位置保持当前选点。");
      else setMessage("请选择对应的地点，选中后会同步更新地图位置。");
    } catch {
      if (!controller.signal.aborted) setMessage("地点搜索暂时不可用，可先保存填写的地点，地图位置保持当前选点。");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return <div className="memory-location">
    <label htmlFor="memory-location-name"><MapPin size={14} />具体地点</label>
    <div className="memory-location-control">
      <input id="memory-location-name" value={value} maxLength={300} placeholder={identifying ? "正在识别地址，也可以直接填写…" : "城市、店名（分店）或街道地址"} onChange={event => changeName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} aria-describedby="memory-location-help" />
      <button type="button" onClick={() => void search()} disabled={busy || !value.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}查找位置</button>
    </div>
    <p id="memory-location-help">补充名称会保留当前选点；选择搜索结果可调整地图位置。</p>
    {message && <p className="memory-location-message" role="status">{message}</p>}
    {results.length > 0 && <div className="memory-location-results" aria-label="地点搜索结果">
      {results.map((place, index) => <button key={`${place.lat}-${place.lng}-${index}`} type="button" onClick={() => { requestRef.current?.abort(); setBusy(false); onSelect(place); setResults([]); setMessage("已更新地点名称和地图位置，保存经历后生效。"); }}><MapPin size={14} /><span>{place.name}</span>{["city", "country", "administrative"].includes(place.type || "") && <small>区域位置</small>}</button>)}
      <small>搜索数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></small>
    </div>}
    <small className="memory-location-coordinates">当前选点：{latitude.toFixed(5)}, {longitude.toFixed(5)}</small>
  </div>;
}
