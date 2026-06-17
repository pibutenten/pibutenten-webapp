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
    url: SERVER_URL,
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
    // 상태바(OS 시간·통신사 표시줄)가 웹 화면을 덮지 않게 — PWA 처럼 상태바 아래부터 콘텐츠 시작.
    //   overlaysWebView:false → 겹침 해소. 흰 배경(theme #FFFFFF)에 어두운 아이콘(style DARK).
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;
