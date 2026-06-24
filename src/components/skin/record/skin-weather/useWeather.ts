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

// 측위 옵션(웹·네이티브 공통 의미). 첫 표시 지연을 줄이려:
//   - enableHighAccuracy:false (GPS 대신 빠른 네트워크 측위).
//   - maximumAge 를 넓혀(60분) OS 캐시 좌표를 측위 없이 즉시 반환.
//   - timeout 단축(4s): 무응답·차단 시 빠르게 대치동 폴백.
const GEO_OPTS = { enableHighAccuracy: false, timeout: 4000, maximumAge: 60 * 60 * 1000 } as const;

/**
 * 좌표 획득 — 플랫폼 분기.
 *   네이티브(Capacitor): `@capacitor/geolocation`(권한 체크·요청 + getCurrentPosition).
 *     원격 URL(https://pibutenten.kr)을 로드하는 WebView 는 OS 권한을 줘도 네이티브 권한 선언
 *     (iOS Info.plist NSLocation* · Android Manifest ACCESS_*_LOCATION)이 없으면 측위가 실패한다.
 *     그래서 웹의 navigator.geolocation 대신 네이티브 플러그인 경로가 필요하다(ADR 0022).
 *   웹/PWA: 기존 navigator.geolocation 그대로.
 * 동적 import + 네이티브 가드(NativeStatusBar 패턴 모방) — 웹 번들에 @capacitor/geolocation 미포함,
 *   플러그인 미설치·로드 실패 시 자동으로 웹 경로로 폴백(no-op 안전).
 * 실패 시 throw → 호출부에서 console.warn(관측성) 후 대치동 폴백.
 */
async function acquirePosition(): Promise<{ latitude: number; longitude: number }> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      // 권한 미결정이면 1회 요청. 허용되면 플러그인으로 측위, 아니면 아래 navigator 폴백.
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
      }
      if (perm.location === "granted" || perm.coarseLocation === "granted") {
        const p = await Geolocation.getCurrentPosition(GEO_OPTS);
        return { latitude: p.coords.latitude, longitude: p.coords.longitude };
      }
      // 권한 거부 → 아래 navigator 폴백 시도.
    }
  } catch {
    // 플러그인 미존재(UNIMPLEMENTED — 현재 출시 바이너리엔 @capacitor/geolocation 미포함) 또는
    //   import/호출 실패 → 항상 navigator.geolocation 으로 폴백한다. (플러그인 도입 빌드 전까지
    //   네이티브 앱도 기존처럼 웹뷰 측위로 동작 — UNIMPLEMENTED 하드실패로 대치동 고착되던 회귀 방지.)
  }
  // 웹/PWA, 또는 네이티브에서 플러그인 미사용·권한거부 시 — navigator.geolocation(웹뷰 측위).
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("geolocation unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      (err) => reject(err),
      GEO_OPTS,
    );
  });
}

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
    // placeholder("내 위치")와 기본값(대치동) 둘 다 seed 로 굳히지 않는다 — 실제 사용자 위치만 LAST_KEY 에.
    //   "내 위치": 역지오코딩 실패·지연 시 LAST_KEY 에 영구 잔존해 상세 페이지가 동 이름 대신 계속
    //     "내 위치"를 보여주던 회귀 방지.
    //   "대치동"(DEFAULT_LOC.name, 2026-06-25 추가): 첫 화면용 대치동 필러가 성공하면 그 대치동이
    //     LAST_KEY 에 저장돼, 이후 재방문이 매번 대치동을 먼저 띄우고 정밀 fetch 가 한 번이라도
    //     실패하면 대치동이 영구 고착됐다('전원 대치동' 잔존의 한 축). 필러는 seed 로 굳히지 않는다.
    //   실제 동 이름이 도착한 정밀 결과만 seed → 정밀 fetch 가 실패해도 마지막 *실제* 위치가 남는다.
    if (snap.name !== MY_LOC && snap.name !== DEFAULT_LOC.name) {
      localStorage.setItem(LAST_KEY, payload); // 상세 페이지·다음 방문 즉시 표시용 (실제 위치만)
    }
  } catch {
    /* 용량 초과 등 무시 */
  }
}

/** 좌표 → 한국어 지명. 무료·키 불필요 BigDataCloud reverse-geocode-client.
 *   - coarse=false(정밀 GPS): 동/읍/면 단위(administrative 배열 뒤쪽부터 동/읍/면 매칭), 없으면 locality/city.
 *   - coarse=true(IP 대략위치): 시/도 단위만(동·구는 IP 로 부정확하므로 의도적으로 안 내려감).
 *       principalSubdivision("서울특별시"→"서울", "부산광역시"→"부산") 우선, 없으면 city/locality.
 *   실패 시 null → 호출부에서 "내 위치" 폴백. */
async function reverseGeocodeKo(
  lat: number,
  lon: number,
  signal?: AbortSignal,
  coarse = false,
): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`,
      { signal },
    );
    const j = (await r.json()) as {
      locality?: string;
      city?: string;
      principalSubdivision?: string;
      localityInfo?: { administrative?: { name?: string }[] };
    };
    if (coarse) {
      // IP 대략위치 — 시/도 단위로만(동·구는 IP 로 부정확해 틀린 동네를 보여주지 않기 위함).
      const sido = (j.principalSubdivision || j.city || j.locality || "").trim();
      return sido ? sido.replace(/(특별시|광역시|특별자치시)$/, "") : null;
    }
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
export function useWeather(
  preferLast = false,
): { snap: WeatherSnapshot | null; err: string | null } {
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
          if (show(named, precise)) {
            writeCache(coordKey(lat, lon), named);
          }
        })
        .catch((e: unknown) => {
          if (!mounted || ac.signal.aborted) return;
          // 필러 실패는 무시(측위 결과를 기다림). 정밀 fetch 실패만 에러로 노출.
          if (precise) {
            // 관측성: 측위는 됐으나 Open-Meteo fetch 가 실패한 경우(위 측위 실패와 구분).
            const m = e instanceof Error ? e.message : String(e);
            console.warn("[weather] 날씨 fetch 실패(측위는 성공):", m);
            setErr(e instanceof Error ? e.message : "날씨 정보를 불러오지 못했어요");
          }
        });
    };

    // 측위(또는 IP 대략위치)로 받은 좌표 한 쌍을 표시·캐시·역지오코딩까지 처리하는 공용 경로.
    //   device-geo 성공과 IP 폴백이 동일 로직(run + reverseGeocodeKo + geoName/캐시 이름 동기화)을
    //   쓰므로 중복을 여기로 추출(DRY). name 은 항상 MY_LOC placeholder 로 시작하고, 역지오코딩이
    //   도착하면 실제 동/시 이름으로 갱신한다(IP city 는 영문이라 한국어 동 이름을 우선).
    //   coarse=true(IP 폴백)면 시 단위 이름만 표시(동·구는 IP 로 부정확). false(GPS)면 동까지.
    const useCoords = (lat: number, lon: number, precise: boolean, coarse = false) => {
      // 날씨는 좌표만 있으면 되므로 즉시 fetch — 지명(역지오코딩)을 기다리지 않아 첫 표시 지연 단축.
      run(lat, lon, MY_LOC, precise);
      // 지명은 병렬로 받아 도착 시 '이름만' 갱신(+캐시 이름 동기화). 실패하면 "내 위치" 유지.
      reverseGeocodeKo(lat, lon, ac.signal, coarse).then((name) => {
        if (!mounted || !name) return;
        geoName = name; // 측위 fetch 가 아직이면 run 의 then 에서 이 이름으로 덮어쓰도록 보관.
        setSnap((prev) => (prev ? { ...prev, name } : prev));
        const k = coordKey(lat, lon);
        const c = readCache(k);
        if (c) writeCache(k, { ...c, name });
      });
    };

    // 1단(즉시): 직전 성공 스냅샷(LAST_KEY)이 신선하면 측위를 기다리지 말고 곧장 렌더(stale-while-revalidate).
    //   seed 가 없으면(첫 방문) 대치동을 즉시 병렬 fetch 해 스켈레톤 체류를 줄인다(필러).
    //   seed 가 있어도 아래 2단(측위)은 의도적으로 항상 실행 → 측위 성공 시 최신 사용자 위치로 갱신
    //   (seed 는 즉시 표시용 stale 값, 2단은 revalidate). seed 있으면 1단은 fetch 없이 setSnap 만.
    if (lastSeed) setSnap(lastSeed);
    else run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, false);

    // 2단(백그라운드): 측위 → 사용자 위치 정밀 결과로 덮어쓰기.
    //   웹=navigator, 네이티브=@capacitor/geolocation 으로 acquirePosition 이 자동 분기.
    acquirePosition()
      .then(({ latitude, longitude }) => {
        if (!mounted) return;
        useCoords(latitude, longitude, true);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        // 관측성(과하지 않게 한 줄): 침묵 폴백의 '왜'를 콘솔에 남긴다. UI·외부 전송 없음.
        //   다음에 '전원 대치동' 류가 재발하면 콘솔에서 1분 안에 측위 실패 vs fetch 실패를 구분.
        const code = typeof err === "object" && err && "code" in err ? (err as { code: number }).code : undefined;
        const msg =
          err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
        console.warn("[weather] 측위 실패 → IP 대략위치 시도:", code != null ? `code ${code}` : "", msg);

        // 기기 측위 실패: 대치동으로 바로 가지 않고 먼저 접속 IP 기반 대략위치(/api/iploc)를 시도.
        //   IP 라우트는 Vercel 헤더만 읽어 외부호출이 없다(ADR 0021 무관). 성공하면 도시/동 수준
        //   대략위치를, 실패(404·네트워크·무효 좌표)하면 그때 비로소 대치동(최후 수단)으로 폴백.
        fetch("/api/iploc", { signal: ac.signal })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`iploc ${r.status}`))))
          .then((j: { lat?: unknown; lon?: unknown }) => {
            if (!mounted || ac.signal.aborted) return;
            const lat = Number(j?.lat);
            const lon = Number(j?.lon);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              // 대략위치 표시(coarse=true → 시 단위 이름만, 동·구 안 내려감). seed 없으면 정밀(true)로
              //   확정해 스켈레톤 종료, 있으면 필러(false)로 보내 더 정밀한 seed 를 덮어쓰지 않음.
              useCoords(lat, lon, !lastSeed, true);
            } else {
              throw new Error("iploc invalid coords");
            }
          })
          .catch((e: unknown) => {
            if (!mounted || ac.signal.aborted) return;
            console.warn("[weather] IP 대략위치 실패 → 대치동 폴백:", e instanceof Error ? e.message : String(e));
            // 최후 수단: 대치동. seed 가 없으면 정밀(true)로 확정해 스켈레톤 종료, 있으면 필러(false).
            run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, !lastSeed);
          });
      });
    return () => {
      mounted = false;
      ac.abort();
    };
  }, [preferLast]);

  return { snap, err };
}
