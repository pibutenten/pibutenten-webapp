/**
 * 피부텐텐 — 최소 Service Worker.
 *
 * 목적:
 *  1) Android Chrome `beforeinstallprompt` 이벤트 발생 조건 충족
 *     (manifest.webmanifest + SW + fetch 핸들러).
 *  2) 미래 캐싱 전략(오프라인 등) 확장 지점.
 *
 * 의도적 가벼움:
 *  - 캐시 작업 없음 (Next.js 정적 자산은 자체 CDN/HTTP 캐시로 충분).
 *  - fetch 핸들러는 네트워크로 직행만 함 — Chrome의 "설치 가능" 신호용.
 *  - 변경 시 클라이언트가 즉시 새 SW를 받도록 skipWaiting/clientsClaim.
 */
const VERSION = "v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // 네트워크 직행 — 캐싱은 의도적으로 안 함.
  // (이 핸들러 자체가 Chrome의 "설치 가능" 휴리스틱에 필요)
  event.respondWith(fetch(event.request));
});
