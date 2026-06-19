"use client";

/**
 * useWeather — "오늘의 피부 날씨" 공용 데이터 훅.
 *
 * 카드(/record 상단)와 상세 페이지(/record/weather)가 같은 데이터를 공유한다.
 * 첫 표시 지연을 없애기 위한 2단 전략:
 *   1) 즉시 표시 — 직전 성공 스냅샷(localStorage seed, 30분)이 있으면 그대로, 없으면 대치동을
 *      곧장 fetch 해 측위를 기다리지 않고 카드를 먼저 채운다(stale-while-revalidate).
 *   2) 백그라운드 — Geolocation 측위가 끝나면 사용자 위치 데이터로 덮어쓴다(실패 시 대치동 확정).
 * 캐시(localStorage)는 좌표키 + "last" 키 두 곳에 기록 → 새 세션·새 탭·상세 페이지가 last 를
 *   즉시 재사용(재측위·재요청 없이 바로 렌더). Open-Meteo 2 API 는 병렬 fetch.
 */

import { useEffect, useState } from "react";
import { DEFAULT_LOC, fetchWeather, type WeatherSnapshot } from "./weather-logic";

const CACHE_TTL = 30 * 60 * 1000; // 30분
// 캐시 버전(v2) — 스냅샷 구조 변경(WeatherDay.pm25 추가) 시 옛 캐시를 폐기해 깨짐 방지.
const LAST_KEY = "pbtt-weather2:last";
const coordKey = (lat: number, lon: number) => `pbtt-weather2:${lat.toFixed(2)}:${lon.toFixed(2)}`;
// 측위 성공 직후 역지오코딩(동 이름) 도착 전 임시 표시용 placeholder. 이 이름은 LAST_KEY(상세
//   페이지·다음 방문 seed)에 굳히지 않는다 — localStorage 영구화로 "내 위치"가 잔존해 상세 페이지가
//   동 이름 대신 계속 "내 위치"를 보여주던 회귀 방지.
const MY_LOC = "내 위치";

function reviveHours(snap: WeatherSnapshot): WeatherSnapshot {
  return { ...snap, hours: snap.hours.map((h) => ({ ...h, t: new Date(h.t) })) };
}
function readCache(key: string): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(key);
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
    // localStorage 로 기록 → 새 세션·새 탭에서도 last seed 를 재사용해 첫 표시 지연 제거.
    localStorage.setItem(key, payload);
    // placeholder("내 위치")는 seed 로 굳히지 않음 — 역지오코딩 실패·지연 시 LAST_KEY 에 영구
    //   잔존해 상세 페이지가 동 이름 대신 "내 위치"를 계속 보여주던 회귀 방지. 실제 동 이름이
    //   도착하면 그때 LAST_KEY 갱신(아래 reverseGeocodeKo 콜백) → 다음 방문부터 동 이름 즉시 표시.
    if (snap.name !== MY_LOC) localStorage.setItem(LAST_KEY, payload); // 상세 페이지·다음 방문 즉시 표시용
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
    const ac = new AbortController();

    // 상세 페이지: 카드가 받아둔 last 스냅샷이 신선하면 즉시 표시(측위·fetch 생략).
    if (preferLast) {
      const last = readCache(LAST_KEY);
      if (last) {
        setSnap(last);
        return () => {
          mounted = false;
          ac.abort();
        };
      }
    }

    // 직전 성공 스냅샷(LAST_KEY). 있으면 1단에서 측위·fetch 없이 즉시 렌더.
    const lastSeed = readCache(LAST_KEY);

    // 정밀(측위) 결과가 한 번이라도 표시되면 필러(대치동)가 덮어쓰지 못하게 잠근다.
    //   precise=true  — 측위 성공 좌표.
    //   precise=false — 측위를 기다리지 않고 먼저 채우는 대치동 필러.
    // seed 가 있으면 그 자체를 '정밀'로 간주(직전 사용자 위치 결과) → 측위 실패 폴백(대치동)이
    //   더 정밀한 seed 를 덮어쓰지 않게 시작부터 잠근다([제안]7).
    let preciseShown = !!lastSeed;
    // 역지오코딩(동 이름)이 측위 fetch 보다 먼저 도착할 수 있음(병렬). 먼저 도착한 동 이름을
    //   여기 담아 뒤늦은 fetch 결과의 placeholder("내 위치")를 실제 이름으로 덮어 표시·캐시한다.
    let geoName: string | null = null;
    const show = (s: WeatherSnapshot, precise: boolean): boolean => {
      if (!mounted) return false;
      if (preciseShown && !precise) return false; // 늦게 온 필러가 정밀 결과를 덮지 않도록.
      if (precise) preciseShown = true;
      setSnap(s);
      return true;
    };
    const run = (lat: number, lon: number, name: string, precise: boolean) => {
      const cached = readCache(coordKey(lat, lon));
      if (cached) {
        show({ ...cached, name }, precise);
        return;
      }
      fetchWeather(lat, lon, name, ac.signal)
        .then((s) => {
          // 측위 fetch 가 역지오코딩보다 늦으면 이미 도착한 실제 동 이름을 입혀 표시·캐시.
          //   (fetchWeather 는 name 파라미터를 snap.name 그대로 반환한다는 계약에 의존 — 깨지면 이 조건 무력화.)
          const named = precise && s.name === MY_LOC && geoName ? { ...s, name: geoName } : s;
          if (show(named, precise)) writeCache(coordKey(lat, lon), named);
        })
        .catch((e: unknown) => {
          if (!mounted || ac.signal.aborted) return;
          // 필러 실패는 무시(측위 결과를 기다림). 정밀 fetch 실패만 에러로 노출.
          if (precise) setErr(e instanceof Error ? e.message : "날씨 정보를 불러오지 못했어요");
        });
    };

    // 1단(즉시): 직전 성공 스냅샷(LAST_KEY)이 신선하면 측위를 기다리지 말고 곧장 렌더(stale-while-revalidate).
    //   seed 가 없으면(첫 방문) 대치동을 즉시 병렬 fetch 해 스켈레톤 체류를 줄인다(필러).
    //   seed 가 있어도 아래 2단(측위)은 의도적으로 항상 실행 → 측위 성공 시 최신 사용자 위치로 갱신
    //   (seed 는 즉시 표시용 stale 값, 2단은 revalidate). seed 있으면 1단은 fetch 없이 setSnap 만.
    if (lastSeed) setSnap(lastSeed);
    else run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, false);

    // 2단(백그라운드): 측위 → 사용자 위치 정밀 결과로 덮어쓰기.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const { latitude, longitude } = p.coords;
          // 날씨는 좌표만 있으면 되므로 즉시 fetch — 지명(역지오코딩)을 기다리지 않아 첫 표시 지연 단축.
          run(latitude, longitude, MY_LOC, true);
          // 동 단위 지명은 병렬로 받아 도착 시 '이름만' 갱신(+캐시 이름 동기화). 실패하면 "내 위치" 유지.
          reverseGeocodeKo(latitude, longitude, ac.signal).then((name) => {
            if (!mounted || !name) return;
            geoName = name; // 측위 fetch 가 아직이면 run 의 then 에서 이 이름으로 덮어쓰도록 보관.
            setSnap((prev) => (prev ? { ...prev, name } : prev));
            const k = coordKey(latitude, longitude);
            const c = readCache(k);
            if (c) writeCache(k, { ...c, name });
          });
        },
        // 측위 실패: seed 가 없으면 대치동을 정밀(true)로 확정해 스켈레톤 종료. seed 가 있으면
        //   필러(false)로 보내 preciseShown 잠금에 걸리게 → 더 정밀한 seed 를 덮어쓰지 않음([제안]7).
        () => run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, !lastSeed),
        // 측위 실패(권한 거부/차단/타임아웃) 시 대치동 폴백. 첫 표시 지연을 줄이려:
        //   - enableHighAccuracy:false 명시(GPS 대신 빠른 네트워크 측위).
        //   - maximumAge 를 넓혀(60분) OS 가 캐시한 좌표를 측위 없이 즉시 반환하게 함.
        //   - timeout 단축(4s): 무응답·차단 시 빠르게 대치동 폴백으로 스켈레톤 종료.
        //   (단, 1단 seed·필러가 이 지연 동안 카드를 이미 채워둠.)
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 60 * 60 * 1000 },
      );
    } else {
      // geolocation 미지원: seed 없으면 대치동 확정(true), seed 있으면 그대로 유지(false).
      run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, !lastSeed);
    }
    return () => {
      mounted = false;
      ac.abort();
    };
  }, [preferLast]);

  return { snap, err };
}
