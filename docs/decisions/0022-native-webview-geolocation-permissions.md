# 0022 — 네이티브 WebView 측위는 권한 선언 + 플러그인이 필요하다 (피부날씨 '앱은 항상 대치동')

- **Status**: Accepted
- **Date**: 2026-06-25
- **Related**: `@capacitor/geolocation@8.2.0` · `src/components/skin/record/skin-weather/useWeather.ts` · `ios/App/App/Info.plist` · `android/app/src/main/AndroidManifest.xml` · ADR [0021](0021-no-free-api-proxy-through-shared-serverless-ip.md) · ADR [0018](0018-domain-migration-pbtt-to-pibutenten.md)

## Context

피부날씨 위치가 **앱(네이티브)에서는 항상 대치동(기본값)** 으로 표시됐다. 웹/PWA 의 동일 코드는
실제 동을 잘 잡는데 앱만 실패했다.

이 앱은 자체 번들 정적 자산을 띄우는 일반 Capacitor 앱이 아니라, **원격 URL
(`https://pibutenten.kr`)을 WebView 로 로드**하는 구조다(셸만 네이티브, 콘텐츠는 웹).
이 구조에서 측위가 실패한 원인은 두 가지가 동시에 빠져 있었기 때문이다.

1. **`@capacitor/geolocation` 플러그인 미설치.** WebView 안 웹 코드는 `navigator.geolocation`
   을 호출하지만, 네이티브 WebView 의 geolocation 은 OS 권한·브리지가 연결돼 있어야 작동한다.
2. **네이티브 위치 권한 선언 부재.** iOS `Info.plist` 에 `NSLocation*` 키가 없고, Android
   `AndroidManifest.xml` 에는 `INTERNET` 만 있고 `ACCESS_*_LOCATION` 이 없었다. 권한 선언이
   없으면 OS 가 사용자에게 권한 팝업조차 띄우지 않고, 사용자가 OS 설정에서 권한을 켜도 측위가
   거부된다.

결과적으로 앱에서는 측위가 즉시 실패 → `useWeather` 의 대치동 폴백이 잔존 → "앱은 항상 대치동".

(직전 2026-06-24 의 "웹·앱 전원 대치동" 장애와는 **별개 원인**이다. 그건 무료 per-IP API 를
공유 서버리스 IP 로 프록시한 설계 결함이었고 — ADR 0021 — 클라이언트 직접 호출 환원으로 해결됐다.
본 ADR 은 그 환원 이후에도 **앱에서만** 남아 있던 네이티브 측위 결손을 다룬다.)

## Decision

**원격 URL WebView 에서 측위하려면 (a) 네이티브 측위 플러그인 + (b) 플랫폼별 권한 선언이
둘 다 필요하다.** 다음을 적용한다.

1. **`@capacitor/geolocation@^8` 설치** (Capacitor 8.x 정합).
2. **`useWeather` 측위 호출부 플랫폼 분기** — 동적 import + 네이티브 가드(`NativeStatusBar`
   패턴 모방):
   - 네이티브(`Capacitor.isNativePlatform()`): `Geolocation.checkPermissions()` →
     미허용이면 `requestPermissions()` → `getCurrentPosition()`.
   - 웹/PWA: 기존 `navigator.geolocation.getCurrentPosition` 그대로.
   - `@capacitor/*` 미존재·로드 실패 시 자동 웹 경로 폴백 → **웹 번들에 플러그인 미포함, 웹 빌드
     무영향**.
   - 성공 → `run(lat, lon, "내 위치", precise=true)` + 병렬 역지오코딩. 실패 → 대치동 폴백.
     옵션(`enableHighAccuracy:false`, `timeout:4000`, `maximumAge:60분`)은 웹·네이티브 공통.
3. **iOS** `Info.plist`: `NSLocationWhenInUseUsageDescription` (한국어 사용 목적 문자열).
4. **Android** `AndroidManifest.xml`: `ACCESS_COARSE_LOCATION` 만. FINE 은 미선언 — 코드가
   `enableHighAccuracy:false` 라 동 단위로 충분하고, FINE 을 쓰지 않으므로 최소 권한 원칙 + Google
   Play '정밀 위치' 데이터 안전 신고·심사 부담 회피를 위해 선언하지 않는다.
5. **관측성**: 측위·fetch 가 대치동 폴백으로 떨어질 때 그 '왜'(geolocation 에러코드 vs fetch
   실패)를 `console.warn` 한 줄로 남긴다. UI 변경·외부 전송 없음.

## Consequences

- 앱에서도 OS 위치 권한 팝업이 뜨고, 허용 시 실제 동 단위 피부날씨가 표시된다.
- **권한 선언 + 플러그인은 네이티브 바이너리에 들어가므로 새 앱 빌드 + 스토어 재심사가 필요하다**
  (웹 배포만으로는 반영 안 됨 — `NativeStatusBar` 같은 런타임 보정과 다름). iOS 는 위치 권한
  사용 목적이 심사 항목이라 사용 목적 문자열이 그대로 평가된다.
- `useWeather` 의 폴백·잠금(preciseShown) 의미는 그대로 유지(웹 회귀 없음). 웹은 동적 import 의
  catch 로 기존 navigator 경로만 타므로 동작 불변.
- 권한 거부 시에는 설계상 대치동 폴백(기능 차단 아님) — 위치 없이도 기본 날씨는 보인다.

## 참고

- CHANGELOG `[2026-06-25] — 네이티브 측위(피부날씨 '앱은 항상 대치동') 근본 수정`
- 측위 획득 분기 코드: `useWeather.ts` `acquirePosition()`
- 스토어 재심사 필요성: `STORE_SUBMISSION_LOG.md`
