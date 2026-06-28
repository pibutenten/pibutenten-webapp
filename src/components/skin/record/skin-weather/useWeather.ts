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
//   - maximumAge 60초: OS 캐시 좌표 재사용을 '같은 세션의 짧은 재측위'까지만 허용.
//     (옛 60분은 해외 이동 후에도 출국 전 '서울' OS 캐시 좌표를 측위 없이 success 로 반환해
//      위치 고착의 한 축이 됐다 → 2026-06-29 축소. 즉시 표시는 localStorage seed 가 담당하므로
//      maximumAge 까지 길게 둘 이유가 없다.)
//   - timeout 단축(4s): 무응답·차단 시 빠르게 폴백.
const GEO_OPTS = { enableHighAccuracy: false, timeout: 4000, maximumAge: 60 * 1000 } as const;

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
function writeCache(key: string, snap: WeatherSnapshot, allowSeed = true) {
  try {
    const payload = JSON.stringify({ ts: Date.now(), snap });
    // localStorage 로 기록 → 새 세션·새 탭에서도 last seed 를 재사용해 첫 표시 지연 제거.
    localStorage.setItem(key, payload);
    // LAST_KEY(다음 방문·상세 페이지 즉시표시용 seed)는 '정밀 기기 측위(GPS)' 결과만 저장한다.
    //   - placeholder("내 위치")·기본값(대치동)은 seed 로 굳히지 않는다.
    //       "내 위치": 역지오코딩 실패·지연 시 LAST_KEY 에 잔존해 동 이름 대신 계속 "내 위치"를 보이던 회귀 방지.
    //       "대치동"(DEFAULT_LOC.name): 첫 화면용 필러가 seed 로 박혀 재방문마다 대치동을 먼저 띄우던 '전원 대치동' 회귀 방지.
    //   - IP 대략위치(coarse) 결과도 seed 로 굳히지 않는다(allowSeed=false, 2026-06-29 추가).
    //       IP 가 돌려준 시/도 이름(예 "서울")이 LAST_KEY 에 '실제 위치'로 박히면, 해외로 이동해도
    //       30분(TTL)간 그 옛 '서울'이 즉시 재사용되며 위치 고착을 자기강화하던 결함을 차단한다.
    //       IP 결과는 좌표키(coordKey) 캐시까지만 둬 같은 도시 재진입의 날씨 즉시표시는 유지한다.
    //   결과: 실제 동 이름이 도착한 정밀 GPS 결과만 seed → 정밀 fetch 가 실패해도 마지막 *실제 기기* 위치가 남는다.
    if (allowSeed && snap.name !== MY_LOC && snap.name !== DEFAULT_LOC.name) {
      localStorage.setItem(LAST_KEY, payload);
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

    // 표시 우선순위(낮음→높음): 필러(대치동) < 정밀(IP 대략위치 또는 기기 GPS) < 기기 GPS.
    //   precise=true  — 위치 결과(기기 GPS 또는 IP 대략위치). false — 대치동 필러.
    //   isDevice=true — 기기 GPS 정밀 측위(IP 대략위치는 false).
    // 두 잠금:
    //   preciseShown: 위치 결과가 한 번 표시되면 늦게 온 필러(대치동)가 덮지 못하게.
    //   deviceShown : 기기 GPS 결과가 한 번 표시되면 늦게 온 IP 대략위치가 덮지 못하게
    //     (측위·IP 를 병렬 실행하므로 IP 가 GPS 보다 늦게 와도 정밀을 보존).
    // seed 는 '정밀(preciseShown)'으로 간주(필러가 못 덮게)하되 'device 는 아님'으로 둔다 →
    //   옛 기기 seed(예 출국 전 '서울')를 이번 세션의 신선한 IP 결과(예 인도)가 정정할 수 있게 한다.
    let preciseShown = !!lastSeed;
    let deviceShown = false;
    // 역지오코딩(동 이름)이 측위 fetch 보다 먼저 도착할 수 있음(병렬). 먼저 도착한 동 이름을
    //   여기 담아 뒤늦은 fetch 결과의 placeholder("내 위치")를 실제 이름으로 덮어 표시·캐시한다.
    let geoName: string | null = null;
    const show = (s: WeatherSnapshot, precise: boolean, isDevice = false): boolean => {
      if (!mounted) return false;
      if (deviceShown && !isDevice) return false; // 늦게 온 IP·필러가 기기 GPS 정밀을 덮지 않도록.
      if (preciseShown && !precise) return false; // 늦게 온 필러가 위치 결과를 덮지 않도록.
      if (precise) preciseShown = true;
      if (isDevice) deviceShown = true;
      setSnap(s);
      return true;
    };
    const run = (lat: number, lon: number, name: string, precise: boolean, isDevice = false) => {
      const cached = readCache(coordKey(lat, lon));
      if (cached) {
        show({ ...cached, name }, precise, isDevice);
        return;
      }
      fetchWeather(lat, lon, name, ac.signal)
        .then((s) => {
          // 측위 fetch 가 역지오코딩보다 늦으면 이미 도착한 실제 동 이름을 입혀 표시·캐시.
          //   (fetchWeather 는 name 파라미터를 snap.name 그대로 반환한다는 계약에 의존 — 깨지면 이 조건 무력화.)
          //   geoName 은 '기기 GPS(device) 동 이름'만 보관하므로(useCoords 참조), device run 의
          //   placeholder("내 위치")에만 입힌다. coarse(IP) run 에 device 이름이 새지 않도록 isDevice 한정.
          const named = isDevice && s.name === MY_LOC && geoName ? { ...s, name: geoName } : s;
          if (show(named, precise, isDevice)) {
            // seed(LAST_KEY) 승격은 기기 GPS(isDevice) 결과만 — IP 대략위치는 coordKey 캐시까지만.
            writeCache(coordKey(lat, lon), named, isDevice);
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
      // coarse=false(기기 GPS)만 device(정밀 seed 대상). coarse=true(IP 대략위치)는 device 아님.
      const isDevice = precise && !coarse;
      // 날씨는 좌표만 있으면 되므로 즉시 fetch — 지명(역지오코딩)을 기다리지 않아 첫 표시 지연 단축.
      run(lat, lon, MY_LOC, precise, isDevice);
      // 지명은 병렬로 받아 도착 시 '이름만' 갱신(+캐시 이름 동기화). 실패하면 "내 위치" 유지.
      reverseGeocodeKo(lat, lon, ac.signal, coarse).then((name) => {
        if (!mounted || ac.signal.aborted || !name) return;
        // 이름 경로도 화면 잠금(deviceShown)을 따른다: 기기 GPS 정밀 결과가 이미 떴으면
        //   늦게 온 IP(개략) 시/도명("서울")이 그 정밀 동 이름을 덮지 못하게 차단(2026-06-29 검수 반영).
        if (deviceShown && !isDevice) return;
        // geoName(늦게 도착할 run 의 fetch 에 입힐 이름)은 기기 GPS 결과만 보관 — IP 시/도명이
        //   공유 변수를 통해 device 스냅에 새고 LAST_KEY seed 로까지 승격되던 경로 차단.
        if (isDevice) geoName = name;
        setSnap((prev) => (prev ? { ...prev, name } : prev));
        const k = coordKey(lat, lon);
        const c = readCache(k);
        if (c) writeCache(k, { ...c, name }, isDevice);
      });
    };

    // 1단(즉시): 직전 성공 스냅샷(LAST_KEY)이 신선하면 측위를 기다리지 말고 곧장 렌더(stale-while-revalidate).
    //   seed 가 없으면(첫 방문) 대치동을 즉시 병렬 fetch 해 스켈레톤 체류를 줄인다(필러).
    //   seed 가 있어도 아래 2단(측위)은 의도적으로 항상 실행 → 측위 성공 시 최신 사용자 위치로 갱신
    //   (seed 는 즉시 표시용 stale 값, 2단은 revalidate). seed 있으면 1단은 fetch 없이 setSnap 만.
    if (lastSeed) setSnap(lastSeed);
    else run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, false);

    // 2단(백그라운드): 위치 정밀화 — 기기 GPS(정밀)와 IP 대략위치를 '동시에' 출발시킨다.
    //   옛 구조는 측위 실패(reject)를 끝까지 기다린 뒤에야 IP 를 시도하는 직렬이라, 측위가
    //   사실상 불가능한 환경(예: 출시 네이티브 바이너리에 @capacitor/geolocation 미링크)에서도
    //   매 진입마다 navigator timeout(최대 GEO_OPTS.timeout=4s)을 통째로 버린 뒤에야 IP 로 떨어져
    //   '위치가 한참 뒤에 뜬다'는 지연을 만들었다(2026-06-29 수정).
    //   병렬 + show()의 deviceShown/preciseShown 잠금으로: IP 가 먼저 떠도 기기 GPS 가 도착하면
    //   정밀로 업그레이드되고, IP 가 GPS 보다 늦게 와도 정밀을 덮지 않는다. 둘 다 실패해도
    //   1단(seed 또는 대치동 필러)이 이미 화면을 채워둔다.

    // (a) 기기 GPS — 정밀(동 단위). 웹=navigator, 네이티브=@capacitor/geolocation 으로 자동 분기.
    acquirePosition()
      .then(({ latitude, longitude }) => {
        if (!mounted) return;
        useCoords(latitude, longitude, true); // coarse=false → isDevice=true(정밀 seed 대상)
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        // 관측성(한 줄): 침묵 폴백의 '왜'를 콘솔에 남긴다. UI·외부 전송 없음. IP 는 아래에서 병행 중.
        const code = typeof err === "object" && err && "code" in err ? (err as { code: number }).code : undefined;
        const msg =
          err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
        console.warn("[weather] 기기 측위 실패(IP 대략위치 병행):", code != null ? `code ${code}` : "", msg);
      });

    // (b) IP 대략위치 — 측위 성공을 기다리지 않고 동시에 시작(빠른 시 단위 폴백).
    //   /api/iploc 은 Vercel 엣지 IP 헤더만 읽어 외부호출이 없다(ADR 0021 무관). 정밀 GPS 가
    //   도착하면 show()의 deviceShown 가드로 이 coarse 결과를 자동으로 양보한다.
    fetch(`/api/iploc?_t=${Date.now()}`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`iploc ${r.status}`))))
      .then((j: { lat?: unknown; lon?: unknown }) => {
        if (!mounted || ac.signal.aborted) return;
        const lat = Number(j?.lat);
        const lon = Number(j?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          // 대략위치 표시(coarse=true → 시 단위 이름만, 동·구는 IP 로 부정확해 안 내려감).
          useCoords(lat, lon, true, true);
        } else {
          throw new Error("iploc invalid coords");
        }
      })
      .catch((e: unknown) => {
        if (!mounted || ac.signal.aborted) return;
        console.warn("[weather] IP 대략위치 실패:", e instanceof Error ? e.message : String(e));
        // 최후 수단(대치동)은 아무 위치 결과도 표시되지 않았고 seed 도 없을 때만 — 그 외엔
        //   1단 대치동 필러(seed 없을 때)·seed(있을 때)·기기 GPS 결과가 이미 화면을 채운다.
        //   precise=true 로 확정해 스켈레톤을 끝내고(에러 노출 가능), isDevice 는 false(seed 미승격).
        if (!preciseShown && !lastSeed) {
          run(DEFAULT_LOC.lat, DEFAULT_LOC.lon, DEFAULT_LOC.name, true);
        }
      });
    return () => {
      mounted = false;
      ac.abort();
    };
  }, [preferLast]);

  return { snap, err };
}
