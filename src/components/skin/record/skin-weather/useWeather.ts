"use client";

/**
 * useWeather — "오늘의 피부 날씨" 공용 데이터 훅.
 *
 * 카드(/record 상단)와 상세 페이지(/record/weather)가 같은 데이터를 공유한다.
 * Geolocation(실패 시 대치동) → sessionStorage 캐시(30분) → Open-Meteo 2 API 병렬 fetch.
 * 캐시는 좌표키 + "last" 키 두 곳에 기록 → 상세 페이지는 카드가 받아둔 last 를 즉시 재사용
 *   (재요청·재측위 없이 바로 렌더, 직접 진입 시에만 새로 측위·fetch).
 */

import { useEffect, useState } from "react";
import { DEFAULT_LOC, fetchWeather, type WeatherSnapshot } from "./weather-logic";

const CACHE_TTL = 30 * 60 * 1000; // 30분
// 캐시 버전(v2) — 스냅샷 구조 변경(WeatherDay.pm25 추가) 시 옛 캐시를 폐기해 깨짐 방지.
const LAST_KEY = "pbtt-weather2:last";
const coordKey = (lat: number, lon: number) => `pbtt-weather2:${lat.toFixed(2)}:${lon.toFixed(2)}`;

function reviveHours(snap: WeatherSnapshot): WeatherSnapshot {
  return { ...snap, hours: snap.hours.map((h) => ({ ...h, t: new Date(h.t) })) };
}
function readCache(key: string): WeatherSnapshot | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, snap } = JSON.parse(raw) as { ts: number; snap: WeatherSnapshot };
    if (Date.now() - ts > CACHE_TTL) return null;
    return reviveHours(snap);
  } catch {
    return null;
  }
}
function writeCache(key: string, snap: WeatherSnapshot) {
  try {
    const payload = JSON.stringify({ ts: Date.now(), snap });
    sessionStorage.setItem(key, payload);
    sessionStorage.setItem(LAST_KEY, payload); // 상세 페이지 즉시 표시용
  } catch {
    /* 용량 초과 등 무시 */
  }
}

/** 좌표 → 한국어 동(행정동) 단위 지명. 무료·키 불필요 BigDataCloud reverse-geocode-client.
 *   administrative 배열에서 동/읍/면으로 끝나는 가장 세부 항목 우선, 없으면 locality/city.
 *   실패 시 null → 호출부에서 "내 위치" 폴백. */
async function reverseGeocodeKo(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`,
      { signal },
    );
    const j = (await r.json()) as {
      locality?: string;
      city?: string;
      localityInfo?: { administrative?: { name?: string }[] };
    };
    const admin = j.localityInfo?.administrative;
    if (Array.isArray(admin)) {
      // 세부(배열 뒤쪽)부터 동/읍/면으로 끝나는 이름 탐색.
      for (let i = admin.length - 1; i >= 0; i--) {
        const nm = admin[i]?.name;
        if (typeof nm === "string" && /[동읍면]$/.test(nm.trim())) return nm.trim();
      }
    }
    return j.locality || j.city || null;
  } catch {
    return null;
  }
}

/**
 * @param preferLast true(상세 페이지)면 좌표 측위 전에 last 캐시를 먼저 보여줘 즉시 렌더.
 */
export function useWeather(preferLast = false): { snap: WeatherSnapshot | null; err: string | null } {
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // geolocation 콜백은 abort 불가 — 언마운트 후 늦게 도착해도 setState 하지 않도록 가드.
    let mounted = true;
    // 상세 페이지: 카드가 받아둔 last 스냅샷이 신선하면 즉시 표시(측위·fetch 생략).
    if (preferLast) {
      const last = readCache(LAST_KEY);
      if (last) {
        setSnap(last);
        return;
      }
    }
    const ac = new AbortController();
    let done = false;
    const run = (lat: number, lon: number, name: string) => {
      if (done || !mounted) return;
      done = true;
      const cached = readCache(coordKey(lat, lon));
      if (cached) {
        setSnap({ ...cached, name });
        return;
      }
      fetchWeather(lat, lon, name, ac.signal)
        .then((s) => {
          if (!mounted) return;
          setSnap(s);
          writeCache(coordKey(lat, lon), s);
        })
        .catch((e: unknown) => {
          if (!mounted || ac.signal.aborted) return;
          setErr(e instanceof Error ? e.message : "날씨 정보를 불러오지 못했어요");
        });
    };
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const { latitude, longitude } = p.coords;
          // 실제 위치는 동 단위 지명으로 표시(역지오코딩). 실패해도 "내 위치"로 폴백.
          reverseGeocodeKo(latitude, longitude, ac.signal).then((name) => {
            if (!mounted) return;
            run(latitude, longitude, name || "내 위치");
          });
        },
        () => run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name),
        // 측위 실패(권한 거부/차단/타임아웃) 시 대치동 폴백. 첫 표시 지연을 줄이려 timeout 단축
        //   (네트워크 측위는 보통 2초 내, 9초는 과함). maximumAge 로 30분 내 재방문은 즉시.
        { timeout: 5000, maximumAge: 30 * 60 * 1000 },
      );
    } else {
      run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name);
    }
    return () => {
      mounted = false;
      ac.abort();
    };
  }, [preferLast]);

  return { snap, err };
}
