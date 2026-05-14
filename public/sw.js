/**
 * 피부텐텐 — Service Worker.
 *
 * 목적:
 *  1) Android Chrome `beforeinstallprompt` 이벤트 발생 조건 충족
 *     (manifest.webmanifest + SW + fetch 핸들러).
 *  2) Web Push Notification 수신·표시·클릭 처리.
 *  3) 미래 캐싱 전략(오프라인 등) 확장 지점.
 *
 * 의도적 가벼움:
 *  - 캐시 작업 없음 (Next.js 정적 자산은 자체 CDN/HTTP 캐시로 충분).
 *  - fetch 핸들러는 네트워크 직행만 함 — Chrome의 "설치 가능" 신호용.
 *  - 변경 시 클라이언트가 즉시 새 SW를 받도록 skipWaiting/clientsClaim.
 */
const VERSION = "v2-push";

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
