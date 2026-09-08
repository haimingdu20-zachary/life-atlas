import countriesJson from "@/public/offline/countries.json";
import citiesJson from "@/public/offline/cities.json";
import type { Position } from "geojson";

type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
type CountryFeature = { geometry: PolygonGeometry | MultiPolygonGeometry; properties: { name?: string; name_en?: string; name_zh?: string; admin?: string; iso2?: string; label_x?: number; label_y?: number } };
type CityFeature = { geometry: { type: "Point"; coordinates: Position }; properties: { name?: string; name_en?: string; local_name?: string; country?: string; admin1?: string | null; population?: number; rank?: number } };
type OfflineData = { countries: CountryFeature[]; cities: CityFeature[] };
type PlaceResult = { name: string; lat: number; lng: number; type: string; distanceMeters?: number };

type LookupResult = { results: PlaceResult[]; source: "online" | "offline"; provider?: "photon" | "nominatim"; areaName?: string };
const resultCache = new Map<string, LookupResult & { expiresAt: number }>();
const pendingLookups = new Map<string, Promise<LookupResult>>();

function cacheResult(key: string, value: LookupResult) {
  if (resultCache.size >= 500) resultCache.delete(resultCache.keys().next().value!);
  resultCache.set(key, { ...value, expiresAt: Date.now() + (value.source === "online" ? 86_400_000 : 15_000) });
}
const cityZhByEnglish: Record<string, string> = {
  beijing: "北京", shanghai: "上海", guangzhou: "广州", shenzhen: "深圳", hangzhou: "杭州", nanjing: "南京", suzhou: "苏州", jiaxing: "嘉兴", ningbo: "宁波",
  chengdu: "成都", chongqing: "重庆", wuhan: "武汉", "xi'an": "西安", xian: "西安", tianjin: "天津", qingdao: "青岛", xiamen: "厦门", fuzhou: "福州",
  changsha: "长沙", zhengzhou: "郑州", jinan: "济南", kunming: "昆明", nanning: "南宁", haikou: "海口", lhasa: "拉萨", urumqi: "乌鲁木齐", harbin: "哈尔滨",
  shenyang: "沈阳", dalian: "大连", changchun: "长春", hefei: "合肥", nanchang: "南昌", taiyuan: "太原", shijiazhuang: "石家庄", hohhot: "呼和浩特",
  lanzhou: "兰州", xining: "西宁", yinchuan: "银川", guiyang: "贵阳", sanya: "三亚", "hong kong": "香港", macau: "澳门", taipei: "台北",
};

function cityDisplayName(city: CityFeature) {
  const source = city.properties.name_en || city.properties.name || city.properties.local_name || "";
  return cityZhByEnglish[source.toLocaleLowerCase()] || city.properties.local_name || city.properties.name || city.properties.name_en || "";
}

const bundledWorldData: OfflineData = { countries: countriesJson.features as CountryFeature[], cities: citiesJson.features as CityFeature[] };

function insideRing(point: Position, ring: Position[]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentY] = ring[current]; const [previousX, previousY] = ring[previous];
    if ((currentY > point[1]) !== (previousY > point[1]) && point[0] < (previousX - currentX) * (point[1] - currentY) / (previousY - currentY) + currentX) inside = !inside;
  }
  return inside;
}

function insideCountry(point: Position, country: CountryFeature) {
  const polygons = country.geometry.type === "Polygon" ? [country.geometry.coordinates] : country.geometry.coordinates;
  return polygons.some(polygon => insideRing(point, polygon[0]) && !polygon.slice(1).some(hole => insideRing(point, hole)));
}

function distanceKm(from: Position, to: Position) {
  const radians = Math.PI / 180;
  const deltaLat = (to[1] - from[1]) * radians; const deltaLng = (to[0] - from[0]) * radians;
  const lat1 = from[1] * radians; const lat2 = to[1] * radians;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function offlineReverse(latitude: number, longitude: number): PlaceResult[] {
  const data = bundledWorldData; const point: Position = [longitude, latitude];
  const country = data.countries.find(feature => insideCountry(point, feature));
  const countryName = country?.properties.iso2 === "CN" ? "中国" : country?.properties.name_zh || country?.properties.name || country?.properties.admin || "未知区域";
  const candidates = country ? data.cities.filter(city => city.properties.country === country.properties.admin || city.properties.country === country.properties.name_en || city.properties.country === country.properties.name) : data.cities;
  const nearest = candidates.map(city => ({ city, distance: distanceKm(point, city.geometry.coordinates) })).sort((a, b) => a.distance - b.distance)[0];
  const nearestName = nearest ? cityDisplayName(nearest.city) : "";
  const cityName = nearest && nearest.distance <= 120 ? `${nearestName}${nearest.distance > 40 ? "附近" : ""}` : "";
  return [{ name: cityName ? `${countryName} · ${cityName}` : countryName, lat: latitude, lng: longitude, type: cityName ? "city" : "country" }];
}

function offlineSearch(query: string): PlaceResult[] {
  const data = bundledWorldData; const keyword = query.toLocaleLowerCase();
  const cities = data.cities.filter(city => {
    const zh = cityZhByEnglish[(city.properties.name_en || city.properties.name || "").toLocaleLowerCase()];
    return Boolean((zh && [zh, `${zh}市`, `中国${zh}`, `中国${zh}市`].includes(keyword)) || [city.properties.name, city.properties.name_en, city.properties.local_name, city.properties.country, city.properties.admin1].some(value => value?.toLocaleLowerCase().includes(keyword)));
  }).sort((a, b) => Number(b.properties.population || 0) - Number(a.properties.population || 0)).slice(0, 5).map(city => ({ name: city.properties.country === "China" ? `中国 · ${cityDisplayName(city)}` : [city.properties.country, city.properties.admin1, cityDisplayName(city)].filter(Boolean).join(" · "), lat: city.geometry.coordinates[1], lng: city.geometry.coordinates[0], type: "city" }));
  if (cities.length) return cities;
  return data.countries.filter(country => (country.properties.iso2 === "CN" && keyword === "中国") || [country.properties.name, country.properties.name_en, country.properties.name_zh, country.properties.admin].some(value => value?.toLocaleLowerCase().includes(keyword))).slice(0, 5).map(country => ({ name: country.properties.iso2 === "CN" ? "中国" : country.properties.name_zh || country.properties.name || country.properties.admin || query, lat: Number(country.properties.label_y || 0), lng: Number(country.properties.label_x || 0), type: "country" }));
}

async function onlineLookup(query: string | undefined, latitude: number, longitude: number, isReverse: boolean, signal: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL(isReverse ? "https://nominatim.openstreetmap.org/reverse" : "https://nominatim.openstreetmap.org/search");
  if (isReverse) { url.searchParams.set("lat", String(latitude)); url.searchParams.set("lon", String(longitude)); url.searchParams.set("zoom", "18"); }
  else { url.searchParams.set("q", query!); url.searchParams.set("limit", "5"); }
  url.searchParams.set("format", "jsonv2"); url.searchParams.set("accept-language", "zh-CN");
  const response = await fetch(url, { signal, headers: { "User-Agent": "LifeAtlas/1.0" } });
  if (!response.ok) return [];
  if (isReverse) {
    const item = await response.json() as { display_name?: string; lat?: string; lon?: string; type?: string };
    // The address describes the selected point; a nearby building must not move the pin.
    return item.display_name ? [{ name: item.display_name, lat: latitude, lng: longitude, type: item.type || "place" }] : [];
  }
  const items = await response.json() as Array<{ display_name: string; lat: string; lon: string; type: string }>;
  return items.map(item => ({ name: item.display_name, lat: Number(item.lat), lng: Number(item.lon), type: item.type })).filter(item => item.name && Number.isFinite(item.lat) && Math.abs(item.lat) <= 90 && Number.isFinite(item.lng) && Math.abs(item.lng) <= 180);
}

async function photonLookup(query: string | undefined, latitude: number, longitude: number, isReverse: boolean, signal: AbortSignal): Promise<PlaceResult[]> {
  const url = new URL(isReverse ? "https://photon.komoot.io/reverse" : "https://photon.komoot.io/api");
  if (isReverse) {
    url.searchParams.set("lat", String(latitude)); url.searchParams.set("lon", String(longitude));
    url.searchParams.set("radius", "1");
  } else url.searchParams.set("q", query!);
  url.searchParams.set("limit", isReverse ? "1" : "5");
  // Omitting lang preserves local Chinese place names on the public Photon server.
  const response = await fetch(url, { signal, headers: { "User-Agent": "HaimingLifeAtlas/1.0 (+https://github.com/haimingdu20-zachary/life-atlas)" } });
  if (!response.ok) return [];
  const data = await response.json() as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: number[] } }> };
  return (data.features || []).flatMap(feature => {
    const p = feature.properties || {};
    const point = feature.geometry?.coordinates;
    if (!point || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180 || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90) return [];
    const distanceMeters = isReverse ? Math.round(distanceKm([longitude, latitude], point) * 1000) : undefined;
    if (distanceMeters !== undefined && distanceMeters > 1000) return [];
    const parts = [p.countrycode === "CN" ? "中国" : p.country, p.state, p.city, p.county, p.district, p.locality, p.street, p.housenumber, p.name].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    const name = [...new Set(parts)].join(" · ");
    if (!name) return [];
    // Reverse results describe a nearby mapped object, not a confirmed visited venue.
    return [{ name: isReverse ? `${name}附近` : name, lat: isReverse ? latitude : point[1], lng: isReverse ? longitude : point[0], type: String(p.type || p.osm_value || "place"), ...(isReverse ? { distanceMeters } : {}) }];
  });
}

async function lookup(query: string | undefined, latitude: number, longitude: number, isReverse: boolean): Promise<LookupResult> {
  const area = isReverse ? offlineReverse(latitude, longitude) : undefined;
  const metadata = area ? { areaName: area[0].name } : {};
  const providers = process.env.ATLAS_PHOTON_ENABLED === "true"
    ? [["photon", photonLookup], ["nominatim", onlineLookup]] as const
    : [["nominatim", onlineLookup]] as const;
  for (const [provider, search] of providers) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const results = await search(query, latitude, longitude, isReverse, controller.signal);
      if (results.length) return { results, source: "online", provider, ...metadata };
    } catch { /* Try the independent provider before falling back to city data. */ }
    finally { clearTimeout(timer); }
  }
  return { results: area || offlineSearch(query!), source: "offline", ...metadata };
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim(); const latitude = Number(searchParams.get("lat")); const longitude = Number(searchParams.get("lng"));
  const isReverse = Boolean(searchParams.get("lat")?.trim() && searchParams.get("lng")?.trim()) && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  if (!query && !isReverse) return Response.json({ results: [] });
  const cacheKey = isReverse ? `r:${latitude},${longitude}` : `s:${query!.toLocaleLowerCase()}`;
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return Response.json({ results: cached.results, source: cached.source, provider: cached.provider, areaName: cached.areaName, cached: true });
  let pending = pendingLookups.get(cacheKey);
  if (!pending) {
    pending = lookup(query, latitude, longitude, isReverse).then(result => {
      cacheResult(cacheKey, result);
      return result;
    }).finally(() => pendingLookups.delete(cacheKey));
    pendingLookups.set(cacheKey, pending);
  }
  return Response.json(await pending);
}
