import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 설정 — 피부텐텐 모바일 앱 셸.
 *
 * 로드 방식: 원격 URL 로드 (server.url).
 *  - 본 앱은 SSR(Next.js) 이라 정적 번들 불가. 원격 사이트(pibutenten.kr)를 WebView 로 로드한다.
 *  - 이때 앱 origin 이 웹과 동일해져 CSP·쿠키·OAuth 콜백이 웹과 동일하게 동작한다.
 *  - webDir(native/www) 는 네트워크 단절 시 노출되는 오프라인 fallback 전용.
 *
 * dev/prod 분기:
 *  - 기본은 운영 서버(https://pibutenten.kr).
 *  - 로컬 실기기 테스트 시 CAP_SERVER_URL 환경변수로 dev 서버 지정
 *    (예: CAP_SERVER_URL="http://192.168.0.10:3000" npx cap sync).
 *    http 면 cleartext 자동 허용. ⚠ 릴리스 빌드 시에는 CAP_SERVER_URL 미설정 필수.
 *
 * 빌드·심사 메모: docs/plans/mobile-app-store-launch-plan.md 참조.
 */
const SERVER_URL =
  process.env.CAP_SERVER_URL?.replace(/\/$/, "") || "https://pibutenten.kr";
const IS_HTTPS = SERVER_URL.startsWith("https://");

const config: CapacitorConfig = {
  appId: "kr.pibutenten.app",
  appName: "피부텐텐",
  webDir: "native/www",
  server: {
    // 앱 첫 화면을 '투데이'(/today)로 — 네이티브 앱 전용 초기 URL. 웹/PWA 의 / 는 그대로 피드 유지
    //   (앱 바이너리가 여는 시작 주소라 웹 SEO·피드에 영향 없음). 피드는 하단 '피드' 탭으로 진입.
    url: `${SERVER_URL}/today`,
    // http(로컬 dev)일 때만 평문 허용. 운영(https)에서는 차단.
    cleartext: !IS_HTTPS,
    // WebView 내부 탐색 허용 도메인 화이트리스트.
    //   서드파티 리다이렉트·피싱 링크가 WebView 안에서 무제한 열리는 것을 차단.
    //   외부 OAuth(구글·카카오 등)는 Phase 3 에서 시스템 브라우저로 분리 예정.
    allowNavigation: ["pibutenten.kr", "*.pibutenten.kr"],
    // 로컬 자산 서빙 스킴 (deep link 스킴과 분리 — kr.pibutenten.app:// 는 Phase 3 에서 별도 도입).
    androidScheme: "https",
  },
  plugins: {
    // 상태바(OS 시간·통신사 표시줄).
    //   Android 15+(targetSdk 36) 는 edge-to-edge 강제 — @capacitor/status-bar 의
    //     overlaysWebView·backgroundColor 는 무시된다. 옛 overlaysWebView:false 경로
    //     (deprecated setSystemUiVisibility)는 코어 SystemBars 와 충돌해 헤더겹침 버그를 냈다.
    //   ⇒ '정석' 해결(2026-06-24): 아래 EdgeToEdge 플러그인이 OS 로 상태바 영역을 네이티브 예약
    //     (콘텐츠가 그 띠 밑으로 스크롤 못 함) + 상태바 배경을 헤더색(#e8f5fd)으로. 충돌나던
    //     deprecated 경로를 쓰지 않아 안전. (자세한 근거: 조사 보고 — Capacitor 8.4.0 기준.)
    //   style:"LIGHT" = 밝은 배경용 어두운 아이콘(헤더색 위 가독). iOS 는 EdgeToEdge 무영향이라
    //     overlaysWebView:true 유지 → 기존 env(safe-area) 동작 그대로(iOS 회귀 없음).
    StatusBar: {
      overlaysWebView: true,
      style: "LIGHT",
      backgroundColor: "#ffffff",
    },
    // Android edge-to-edge 정석 처리. 코어 SystemBars 의 CSS inset 주입을 끄고(disable),
    //   EdgeToEdge 플러그인이 WebView 를 상태바 아래로 네이티브 inset + 상태바 배경색 지정.
    //   두 키 모두 iOS 에선 no-op(Android 전용 플러그인).
    SystemBars: {
      insetsHandling: "disable",
    },
    EdgeToEdge: {
      // 이 플러그인은 상·하단 시스템 바를 모두 네이티브 inset 한다. 색을 안 주면 기본(검정 등)이 될 수
      //   있어 둘 다 지정: 상단 상태바 = 헤더색(#e8f5fd), 하단 내비바 = 탭바 배경과 같은 흰색(#ffffff).
      //   (구 단일 `backgroundColor` 키는 deprecated — statusBarColor/navigationBarColor 사용이 정석.)
      statusBarColor: "#e8f5fd",
      navigationBarColor: "#ffffff",
    },
    // 스플래시(앱 시작 화면) — PWA 처럼 원격 페이지 로딩 동안 파란 tt: 화면을 유지.
    //   네이티브 런치 스플래시(@drawable/splash, #4CBFF2)는 기본적으로 첫 프레임에서 즉시 사라져
    //   원격 URL(pibutenten.kr) 로딩 중 흰/빈 화면이 잠깐 보였다(원장님 요청).
    //   launchShowDuration 으로 표시 시간을 늘려 로딩 동안 스플래시가 보이게 한다.
    //   ⚠ launchAutoHide:true 유지 — 웹 JS 의 SplashScreen.hide() 에 의존하면
    //     원격 로드에서 브릿지 콜백이 안 떴을 때 파란 화면에 영구 정지될 위험이 있다.
    //     고정 시간 후 자동 소멸이라 어떤 네트워크 상황에서도 멈추지 않는다.
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#4cbff2",
      showSpinner: false,
    },
  },
};

export default config;
