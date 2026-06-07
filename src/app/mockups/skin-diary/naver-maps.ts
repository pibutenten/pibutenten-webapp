"use client";

/**
 * 네이버 지도 SDK 공용 로더 + 지오코딩 헬퍼.
 * - maps.js 를 geocoder 서브모듈 포함해 1회만 로드(NaverMap/검색이 공유).
 * - geocodePlace: 지명·주소·랜드마크 문자열 → 좌표(lat/lng). 실패 시 null.
 * - SSR 비호환(window 의존) → 함수 호출 시점(클라이언트)에만 동작.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;

let loader: Promise<void> | null = null;

export function loadNaverMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.naver?.maps?.Service) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    if (!CLIENT_ID) {
      reject(new Error("no naver client id"));
      return;
    }
    const existing = document.getElementById("naver-maps-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("naver maps load fail")));
      // 이미 로드 완료된 경우.
      if (w.naver?.maps) resolve();
      return;
    }
    const s = document.createElement("script");
    s.id = "naver-maps-sdk";
    s.async = true;
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}&submodules=geocoder`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("naver maps load fail"));
    document.head.appendChild(s);
  });
  return loader;
}

export async function geocodePlace(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    await loadNaverMaps();
  } catch {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const naver = (window as any).naver;
  if (!naver?.maps?.Service) return null;
  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    naver.maps.Service.geocode({ query: q }, (status: any, res: any) => {
      if (status !== naver.maps.Service.Status.OK) {
        resolve(null);
        return;
      }
      const a = res?.v2?.addresses?.[0];
      if (!a) {
        resolve(null);
        return;
      }
      const lat = parseFloat(a.y);
      const lng = parseFloat(a.x);
      if (Number.isFinite(lat) && Number.isFinite(lng)) resolve({ lat, lng });
      else resolve(null);
    });
  });
}
