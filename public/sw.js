/**
 * 피부텐텐 — Service Worker.
 *
 * 목적:
 *  1) Android Chrome `beforeinstallprompt` 이벤트 발생 조건 충족
 *     (manifest.webmanifest + SW + fetch 핸들러).
 *  2) Web Push Notification 수신·표시·클릭 처리.
 *  3) **새 deploy 감지 시 열려있는 모든 탭 자동 reload** — DB schema 변경
 *     (예: 컬럼 DROP) 직후 옛 build 의 JavaScript chunk 가 잔존하면 사용자가
 *     "schema cache 에 없는 컬럼" 에러 보던 회귀 차단 (2026-05-26).
 *
 * 의도적 가벼움:
 *  - fetch 응답 캐싱 없음 (Next.js 정적 자산은 자체 CDN/HTTP 캐시로 충분).
 *  - 변경 시 클라이언트가 즉시 새 SW를 받도록 skipWaiting/clientsClaim.
 *  - activate 시 controlled clients 자동 reload (새 chunk 강제 가져옴).
 */
// v5(2026-06-24): 날씨 프록시 되돌림(b79e39a) 등 누적 배포를 열린 클라이언트에 강제 전파.
//   버전이 바뀌어야 activate→전 탭 자동 reload 가 1회 동작해 옛 JS(프록시 버전) 캐시가 교체된다.
const VERSION = "v8-offline-cache-260625";

const STATIC_CACHE = "pbtt-static-v1";
const DYNAMIC_CACHE = "pbtt-dynamic-v1";
const EXPECTED_CACHES = [STATIC_CACHE, DYNAMIC_CACHE];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>피부텐텐</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#374151;text-align:center;padding:1rem}div{max-width:320px}h1{font-size:1.25rem;margin-bottom:.5rem}p{color:#6b7280;font-size:.875rem;line-height:1.5}</style></head><body><div><h1>네트워크 연결 끊김</h1><p>인터넷에 연결할 수 없어요.<br>연결을 확인한 뒤 다시 시도해 주세요.</p></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 이전 버전 캐시 정리
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !EXPECTED_CACHES.includes(k))
          .map((k) => caches.delete(k)),
      );

      await self.clients.claim();
      // 새 SW 가 활성화되면 (= 새 deploy 가 사용자 모바일에 도달) 열려있는
      // 모든 탭을 자동 reload → 옛 build chunk 잔존 차단.
      // 단발성 — SW version 이 바뀌어 새로 activate 될 때만 1회.
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const c of clients) {
          try {
            await c.navigate(c.url);
          } catch {
            /* 일부 브라우저는 navigate 차단 — 무시 */
          }
        }
      } catch {
        /* matchAll 실패해도 fetch handler 는 정상 작동 */
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;
  if (url.hostname.includes("supabase")) return;

  // /_next/static/ — Cache-First (빌드 해시가 포함된 불변 자산)
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, res.clone());
        }
        return res;
      })(),
    );
    return;
  }

  // same-origin — Network-First
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, res.clone());
            // LRU: 최신 50개만 유지
            const keys = await cache.keys();
            if (keys.length > 50) {
              await cache.delete(keys[0]);
            }
          }
          return res;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === "navigate") {
            return new Response(OFFLINE_HTML, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }
          return Response.error();
        }
      })(),
    );
    return;
  }

  // cross-origin (non-Supabase) — 네트워크 직행
  event.respondWith(fetch(request));
});

/**
 * Push 이벤트 — 서버에서 web-push로 보낸 알림 수신.
 * payload 예: { title, body, url, tag }
 * tag 동일하면 기존 알림 교체 (좋아요 N명 그룹화 시 활용 가능).
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "피부텐텐", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "피부텐텐";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
    tag: data.tag, // 동일 tag면 OS가 기존 알림 교체
    renotify: !!data.tag, // tag 있을 때 다시 알림 (좋아요 누적 시 사용자 재인지)
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * 알림 클릭 — 알림 닫고 해당 URL로 이동 (이미 열린 탭 있으면 포커스).
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // 같은 origin의 탭이 이미 있으면 그쪽으로 navigate + focus
      for (const client of allClients) {
        if ("focus" in client && "navigate" in client) {
          try {
            await client.navigate(targetUrl);
            return client.focus();
          } catch {
            // navigate 실패 시 새 창
          }
        }
      }
      // 없으면 새 창
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
