# 투데이 "오늘의 피부 날씨" 위치 오류·지연 해결 계획서

> 작성: 2026-06-29 · 총괄디렉터(Claude) 종합. 4개 코드 검수 서브에이전트(A 클라이언트 상태머신 / B IP라우트·배포 / C 네이티브·Capacitor / D 서비스워커·성능) 병렬 조사 + 디렉터 독립 정독 교차검증.
>
> 증상: 인도에 있는데도 위치가 "서울(대치동)"로 표시되고, 로딩이 매우 느림. "예전엔 됐다."

> **실행 상태 (2026-06-29)**: **Phase 1(웹 수정) 완료·배포** — `useWeather.ts`(maximumAge 60초, IP seed 미승격, deviceShown 잠금, GPS·IP 병렬) + `next.config.ts`(CSP). 독립 검수관 2명 → [치명] 2건(이름 경로 잠금 우회) 수정 → 재검수 2명 통과(ship). `tsc`·`build` 0. CHANGELOG 2026-06-29 참조. **Phase 0(인도 IP 실측) 진행 중**(오너), **Phase 2(네이티브 재빌드) 보류**(Phase 1 효과 확인 후 결정).

---

## 0. 한 줄 결론

이건 단일 버그가 아니라 **여러 독립 실패가 모두 같은 폴백(대치동=서울)으로 수렴**하는 구조적 문제입니다. 핵심은 ① 출시된 네이티브 앱에 측위 기능 자체가 빠져 있고(스토어 재심사 미제출), ② 그 결과 유일한 위치원인 IP 폴백마저 **옛 좌표 재사용(maximumAge 60분)·seed 오염·헤더 미확인** 때문에 제대로 동작하지 못하며, ③ 측위를 직렬로 끝까지 기다린 뒤에야 IP를 시도하는 구조가 "느림"을 만듭니다.

중요한 희소식: **앱이 원격 URL(`https://pibutenten.kr/today`)을 그대로 띄우는 구조**라, 위치 결정 로직(클라이언트 JS) 수정은 **웹 배포만으로 현재 출시 앱에도 즉시 반영**됩니다. 스토어 재심사는 "정밀 GPS"를 켜는 데만 필요하고, "인도→서울"·"느림"의 상당 부분은 웹 배포로 먼저 잡을 수 있습니다.

---

## 1. 증상 → 원인 지도

### 1-A. 왜 "서울(대치동)"로 뜨는가

| # | 원인 | 위치 | 확정도 | 설명 |
|---|---|---|---|---|
| ① | **출시 앱에 측위 기능 부재** | 네이티브 바이너리 | 확정(high) | 출시본(iOS 빌드7·Android v1, 둘 다 2026-06-19 제출)은 GPS 권한·`@capacitor/geolocation` 추가(2026-06-25) **이전** 빌드. 이후 재빌드·재심사 0건. `android/.../capacitor.plugins.json`·`ios/.../packageClassList`에 geolocation 없음, `grep -ri geoloc ios·android` 0건. → 코드의 네이티브 측위 경로는 항상 UNIMPLEMENTED → `navigator.geolocation` 폴백 → 권한 미선언 WebView에서 이마저 실패. 즉 **device GPS = 0**. |
| ② | **`maximumAge: 60분`이 옛 서울 좌표를 "정밀"로 반환** | `useWeather.ts:31` (`GEO_OPTS`) | 유력(med) | W3C 규격상 60분 이내 OS 캐시 좌표가 있으면 새 측위 없이 그 좌표로 success. 출국 직전 한국에서 잡힌 서울 좌표가 WebView에서 `precise=true`로 반환→ `preciseShown` 잠금 → **IP 폴백(`.catch`)이 아예 실행 안 됨**. 회귀 분기점: dde43f0(2026-06-16, 30→60분). |
| ③ | **IP(개략) 결과의 시/도 이름이 실제위치 seed로 굳음** | `useWeather.ts:105-106, 231-243, 281` | 유력(med) | IP 폴백이 받은 역지오코딩 이름("서울")이 `writeCache`의 seed 가드(`MY_LOC`·`대치동`만 차단)를 통과해 `LAST_KEY`(실제위치 seed, 30분 TTL)에 저장. 30분 내 재진입 시 그 "서울" seed가 즉시 표시 + `preciseShown=true` 잠금 → 자기강화. 2026-06-26 SW 캐시 루프는 막았으나 seed 경로는 잔존. |
| ④ | **대치동(서울)이 최후 폴백 기본값** | `weather-logic.ts:15` (`DEFAULT_LOC`) | 확정 | GPS·IP 둘 다 실패하면 `대치동(37.4994,127.0628)`이 화면에 남음. 해외에서 위치 체인이 한 군데라도 끊기면 무조건 "서울". |
| ⑤ | **IP 폴백이 인도를 실제로 반환하는지 미확인** | `api/iploc/route.ts` + Vercel 헤더 | 미확정 | 라우트 자체는 정상(Vercel `x-vercel-ip-latitude/longitude`만 읽고 `(0,0)` 거부, 서울을 만드는 코드 없음). 그러나 **인도 IP에서 실제로 인도 좌표가 오는지, nodejs 런타임에 헤더가 채워지는지는 운영 실측이 안 됨**. 헤더가 비면 404→대치동(또 다른 서울 경로). 한국 로밍/캐리어 NAT로 한국 출구IP면 서울 반환 가능. **이 변수가 "웹 수정으로 충분한가 vs IP 방식 자체를 바꿔야 하는가"를 가른다.** |

> 교차검증으로 **배제된 가설**(헛다리 제거):
> - SW가 옛 서울 날씨를 캐시해 반환 → **불성립**. `sw.js`는 외부 도메인(Open-Meteo·BigDataCloud)을 무캐시 직행, `/api/`도 v9에서 완전 제외. iOS WKWebView는 SW 자체를 거의 안 돌림(=06-26 SW 수정이 네이티브엔 무효).
> - `/api/weather` 공유 egress IP 프록시 재발 → **불성립**(라우트 삭제 확인).
> - `Permissions-Policy: geolocation=()` 측위 전면 차단(과거 [치명]) → **현재 없음**(`geolocation=(self)` 정상).
> - 정적번들이라 `/api/iploc`가 안 잡힘 → **불성립**(원격 URL 로드라 동일 origin 도달 정상).

### 1-B. 왜 느린가 (위치 고착과 독립된 원인)

| # | 원인 | 위치 | 확정도 |
|---|---|---|---|
| ⑥ | **직렬 체인**: 측위를 끝까지 기다린 뒤에야 IP를 시도 | `useWeather.ts:254-292` | 확정(high) |
| | 흐름: `@capacitor/core` 동적 import → `isNativePlatform()` → `@capacitor/geolocation` 동적 import(미링크라 reject) → `navigator.geolocation`(권한 미선언 WebView에서 **즉시 거부가 아니라 무응답으로 timeout 4초 소진**) → 그제서야 `/api/iploc` → Open-Meteo 2곳 → BigDataCloud 역지오코딩. **측위가 처음부터 불가능한 바이너리인데 매 진입 4초+를 측위에 낭비.** | | | |
| ⑦ | **인도→서울 리전(icn1) 왕복** | `vercel.json` | 보조 | 동적 요청이 서울 리전 함수로 라우팅돼 해외 RTT 가중(헤더 값엔 무영향). |
| ⑧ | **클라이언트 전용 렌더 + 전체 화면 로딩 오버레이** | `SkinWeatherCard.tsx`, `today/loading.tsx`, `today/page.tsx:131-171` | 보조 | 날씨 카드는 SSR 없음(스켈레톤만). 또한 `/today` 자체가 `force-dynamic` + Supabase 8쿼리 `Promise.all`이 끝나야 떠서 날씨와 별개로 페이지 체감 로딩을 늘림. |

### 1-C. "예전엔 됐다"(회귀)의 정체

- 네이티브 앱이 생기기 전 **모바일 브라우저 PWA**로 쓰던 시절엔 `navigator.geolocation`이 정상 동작 → 위치가 맞았음. **네이티브 셸(측위 플러그인 없음)로 옮긴 뒤 GPS가 끊김.**
- 또는 한국에 있을 땐 "서울"이 우연히 맞아 보였음(해외에 나가서야 표면화).
- 2026-06-16 `maximumAge` 30→60분 확대가 옛 좌표 재사용 가능성을 키움.

---

## 2. 수정 범위 분리 (핵심 전략)

| 분류 | 내용 | 반영 경로 | 누가 |
|---|---|---|---|
| **웹 배포(즉효)** | `useWeather.ts` 로직 수정(maximumAge·seed 가드·병렬화·중립 폴백), `next.config.ts` CSP 도메인 | git push → Vercel 재배포 → **현재 출시 앱(원격 URL)에도 즉시 반영** | Claude 자동 |
| **네이티브 재빌드(정밀화)** | `cap sync`로 geolocation 플러그인 링크 + iOS/Android 빌드 + 스토어 재심사 | 새 바이너리 심사 통과 후 사용자 업데이트 | **오너 결정·자료 필요** |

→ "인도→서울"·"느림"의 큰 줄기는 **웹 배포만으로** 먼저 개선 가능. device GPS(동 단위 정밀)는 재빌드가 있어야 복원.

---

## 3. 단계별 실행 계획

### Phase 0 — 진단·차단 (가장 먼저, ⑤ 미확정 변수 확정)

목적: **IP 폴백이 인도를 실제로 반환하는지**를 확정해야 Phase 1 수정이 충분한지 판가름됩니다.

1. **오너 실측(10초)**: 인도 현지 단말의 브라우저로 `https://pibutenten.kr/api/iploc` 직접 열어 응답 JSON(`{lat, lon, city}`)을 확인·공유.
   - 인도 좌표가 오면 → 원인은 클라이언트 측(②③⑥) 확정 → Phase 1 웹 수정으로 해결 가능.
   - 서울 좌표/404가 오면 → IP 경로 자체 문제 → Phase 1에 "클라이언트에서 외부 IP-geo API 직접 호출" 대안 추가.
2. (병행) **임시 디버그 1줄**: `useWeather`의 측위/폴백 채택 경로와 좌표를 `console.warn`으로 1회 노출(이미 일부 있음) → 실기기에서 "GPS resolve(stale) vs reject vs IP" 중 무엇인지 현장 확정. 검증 후 제거.

### Phase 1 — 웹 배포 수정 (즉효, Claude 자동 수행)

> 모두 `useWeather.ts` / `next.config.ts` 한정. CLAUDE.md §3 자동 실행 룰(코드→빌드→코드검수관→commit·push→문서) 적용. 코드검수 [치명] 0 통과 후에만 배포.

1. **`maximumAge` 축소**(②): `GEO_OPTS.maximumAge`를 60분 → **0~60초** 수준으로. 즉시표시는 이미 localStorage seed가 담당하므로 길게 둘 이유가 없음(이중 stale 소스 제거).
2. **seed 가드 강화**(③): IP(개략) 결과를 **`LAST_KEY`(실제위치 seed)로 승격하지 않음**. 승격하더라도 coarse 표식을 달아 `preciseShown` 잠금을 걸지 않고, 다음 측위/IP 결과가 항상 덮어쓰게 함. → 출국 전 한국 "서울"이 인도에서 재사용되는 고리 차단.
3. **측위·IP 병렬화**(⑥, 느림 최대 개선): `acquirePosition()`과 `/api/iploc`를 **동시 출발**시키고, 먼저·더 신뢰할 수 있는 좌표를 채택(IP를 빠른 개략값으로 먼저 띄우고, 진짜 새 GPS fix가 오면 정밀값으로 업그레이드). → GPS 없는 출시 앱에서 매번 버리던 4초를 절약.
4. **CSP 도메인 보강**(잠복 지뢰): `next.config.ts` `connect-src`에 `https://air-quality-api.open-meteo.com`, `https://api.open-meteo.com`, `https://api.bigdatacloud.net` 추가. 현재 `Report-Only`라 차단은 안 되지만 enforce 전환 시 날씨 전면 실패 + 위반 로그 노이즈 제거.
5. (선택) **중립 폴백 UI**: 위치 확정 실패 시 "대치동"을 단정 표시하는 대신 "위치 확인 중"/마지막 실제 위치를 우선. 해외 사용자 오인 방지.
6. (Phase 0이 "IP 경로 문제"로 나오면) **대안**: 클라이언트에서 무료 외부 IP-geo(예 ipapi)로 직접 측위(ADR 0021 공유 egress 함정 회피 위해 서버 프록시 아닌 클라 직접). 단 per-IP 한도·CORS 검토.

### Phase 2 — 네이티브 재빌드 (정밀 GPS 복원, 오너 결정 필요)

1. `npx cap sync`(geolocation 플러그인·권한 네이티브 링크) → iOS/Android 빌드.
2. 실기기 스모크테스트: 첫 진입 위치 권한 팝업 → 허용 시 동 단위 표시 / 거부 시 IP·중립 폴백.
3. App Store / Play Console 재심사 제출. (서명 자산·심사 일정·"정밀 위치" 데이터 안전 신고는 오너 영역.)
- 근거: `STORE_SUBMISSION_LOG.md`상 2026-06-26 일괄 재심사가 "예정" 상태로 정체. 메모리 `pending-store-resubmit-gps.md`와 동일.

### Phase 3 — 검증·마무리

1. QA 계정(`qa-claude@pibutenten.kr`)으로 e2e: 위치 표시·갱신·폴백 경로.
2. 인도 오너 재현 확인(Phase 1 배포 후 즉시 / Phase 2 업데이트 후 정밀).
3. `CHANGELOG.md` + 관련 문서 동기화, 임시 디버그 제거.

---

## 4. 예상 부작용 / 회귀 점검

- `maximumAge` 축소 → 정밀 GPS 단말에서 새 측위 latency 소폭 증가 가능. 단 seed 즉시표시로 체감 상쇄.
- 병렬화 → `preciseShown`/seed 잠금 로직과 상호작용. 코드검수관 [치명] 점검 필수(늦게 온 개략값이 정밀값을 덮지 않도록 우선순위 보존).
- seed 가드 강화 → IP-only 사용자의 "재진입 즉시표시" 일부 손실 가능. coordKey 캐시로 보완.
- CSP는 Report-Only라 추가해도 기존 동작 무변경(안전).
- 웹 수정은 PWA·네이티브 WebView 모두 동일 origin이라 한 번에 반영.

---

## 5. 오너에게 필요한 결정·자료

1. **(필수) Phase 0 실측**: 인도 단말에서 `https://pibutenten.kr/api/iploc` 응답 공유.
2. **(결정) Phase 1 웹 수정 즉시 진행 여부** — 진행 시 Claude가 자동 수행·배포.
3. **(결정) Phase 2 스토어 재심사 진행 여부·시점** + 서명 자산.

---

## 6. 근거 출처

- 조사: 4-에이전트 워크플로 `today-location-bug-rootcause`(run `wf_5c2c7910-018`, 4 agents / 378k tokens).
- 핵심 파일: `useWeather.ts`, `weather-logic.ts`, `api/iploc/route.ts`, `capacitor.config.ts`, `next.config.ts`, `public/sw.js`, `android/.../capacitor.plugins.json`, `ios/.../capacitor.config.json`, `Info.plist`, `AndroidManifest.xml`, `STORE_SUBMISSION_LOG.md`.
- 관련: ADR 0021(공유 egress IP), ADR 0022(네이티브 WebView 측위 권한), CHANGELOG 2026-06-24/25/26.
