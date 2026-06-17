"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

/**
 * Push Notification 권한 + 구독 토글.
 *
 * 두 경로를 분기 지원 (2026-06-17, 앱스토어 Phase 2):
 *  - 웹(브라우저/PWA): Web Push(VAPID). Service Worker + pushManager.subscribe → /api/push/subscribe.
 *  - 네이티브(Capacitor iOS/Android): @capacitor/push-notifications 로 FCM 토큰 등록 →
 *    같은 /api/push/subscribe 에 { token, platform } 저장.
 *
 * 웹 경로 동작:
 *  1) 브라우저 권한 상태 확인 (default/granted/denied)
 *  2) Service Worker 등록 확인
 *  3) 현재 구독 여부 확인 (registration.pushManager.getSubscription)
 *  4) "켜기" → 권한 요청 + 구독 + 서버 저장
 *  5) "끄기" → 구독 해지 + 서버 삭제
 *  iOS Safari 16.4+ — 홈 화면 추가(PWA로 설치)된 경우에만 push 지원.
 *
 * 네이티브 경로 동작:
 *  1) checkPermissions 로 초기 상태. granted 면 register() 로 토큰 재확인(FCM 토큰 갱신 대비).
 *  2) "켜기" → requestPermissions → register() → 'registration' 이벤트로 토큰 수신 → 서버 저장.
 *  3) "끄기" → 서버 토큰 삭제 + unregister.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
// SSR 가드: 서버(Node) 렌더링 평가 시 Capacitor API 를 호출하지 않는다.
//   window 없으면 비네이티브로 간주 → 서버에서 'web' 분기. 클라이언트 hydration 후 실제 판정.
//   (초기 state 가 'loading' 으로 동일해 hydration mismatch 없음)
const IS_NATIVE =
  typeof window !== "undefined" && Capacitor.isNativePlatform();
const NATIVE_PLATFORM =
  typeof window !== "undefined" ? Capacitor.getPlatform() : "web"; // 'ios' | 'android' | 'web'

type State =
  | "loading"
  | "unsupported"
  | "needs-permission" // 권한 default — 켜기 가능
  | "denied" // 권한 denied — 설정에서 해제 필요
  | "off" // 권한 granted, 구독 없음
  | "on"; // 권한 granted, 구독 있음

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) view[i] = rawData.charCodeAt(i);
  return buf;
}

function isIOSStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIOSBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function PushNotificationToggle() {
  const [state, setState] = useState<State>("loading");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 네이티브 FCM 토큰 — 끄기(서버 삭제) 시 endpoint 로 사용.
  const nativeTokenRef = useRef<string | null>(null);

  // ===== 네이티브(Capacitor) 경로 =====
  useEffect(() => {
    if (!IS_NATIVE) return;
    let cancelled = false;

    // 토큰 수신 → 서버 저장 (켜기·자동등록 공용).
    const regHandle = PushNotifications.addListener(
      "registration",
      async (token) => {
        nativeTokenRef.current = token.value;
        try {
          const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: NATIVE_PLATFORM }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (!cancelled) setState("on");
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "구독 저장 실패");
        } finally {
          if (!cancelled) setWorking(false);
        }
      },
    );

    const errHandle = PushNotifications.addListener("registrationError", (err) => {
      if (cancelled) return;
      const msg =
        err && typeof (err as { error?: unknown }).error === "string"
          ? (err as { error: string }).error
          : "푸시 등록 실패";
      setError(msg);
      setWorking(false);
    });

    (async () => {
      try {
        const perm = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (perm.receive === "granted") {
          // 이미 허용 — 토큰 재확인(FCM 토큰은 갱신될 수 있음). 리스너가 on 처리.
          await PushNotifications.register();
        } else if (perm.receive === "denied") {
          setState("denied");
        } else {
          setState("needs-permission");
        }
      } catch {
        if (!cancelled) setState("needs-permission");
      }
    })();

    return () => {
      cancelled = true;
      regHandle.then((h) => h.remove()).catch(() => {});
      errHandle.then((h) => h.remove()).catch(() => {});
    };
  }, []);

  // ===== 웹(브라우저/PWA) 경로 — 초기 상태 확인 =====
  useEffect(() => {
    if (IS_NATIVE) return;
    let cancelled = false;
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      // iOS Safari — PWA 설치 안 됐으면 push 지원 X
      if (isIOSBrowser() && !isIOSStandalone()) {
        if (!cancelled) setState("unsupported");
        return;
      }

      const perm = Notification.permission;
      if (perm === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      if (perm === "default") {
        if (!cancelled) setState("needs-permission");
        return;
      }
      // granted — 구독 여부 확인
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    setError(null);

    // ----- 네이티브 -----
    if (IS_NATIVE) {
      setWorking(true);
      try {
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted") {
          setState(perm.receive === "denied" ? "denied" : "needs-permission");
          setWorking(false);
          return;
        }
        // 토큰 수신·서버 저장·state 전환은 'registration' 리스너가 처리(working 도 거기서 해제).
        await PushNotifications.register();
      } catch (e) {
        setError(e instanceof Error ? e.message : "구독 실패");
        setWorking(false);
      }
      return;
    }

    // ----- 웹 -----
    if (!VAPID_PUBLIC_KEY) {
      setError("VAPID 키가 설정되지 않았습니다");
      return;
    }
    setWorking(true);
    try {
      if (Notification.permission === "default") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          setState(result === "denied" ? "denied" : "needs-permission");
          return;
        }
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "구독 실패");
    } finally {
      setWorking(false);
    }
  }

  async function unsubscribe() {
    setError(null);

    // ----- 네이티브 -----
    if (IS_NATIVE) {
      setWorking(true);
      try {
        const token = nativeTokenRef.current;
        if (token) {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: token }),
          });
        }
        await PushNotifications.unregister().catch(() => {});
        setState("off");
      } catch (e) {
        setError(e instanceof Error ? e.message : "해지 실패");
      } finally {
        setWorking(false);
      }
      return;
    }

    // ----- 웹 -----
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "해지 실패");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-[var(--text)]">
          🔔 푸시 알림 (앱처럼 받기)
        </h2>
        <span className="text-[11px] text-[var(--text-muted)]">
          {working ? "처리 중…" : error ? `에러: ${error}` : ""}
        </span>
      </div>
      <p className="mb-3 text-[12px] text-[var(--text-secondary)]">
        브라우저를 닫아도 새 알림이 오면 OS 알림으로 받아볼 수 있어요.
      </p>

      {state === "loading" && (
        <p className="text-[12px] text-[var(--text-muted)]">상태 확인 중…</p>
      )}

      {state === "unsupported" && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-soft)] p-3 text-[12px] text-[var(--text-secondary)]">
          {isIOSBrowser()
            ? "iPhone/iPad는 홈 화면에 추가(PWA 설치) 후에만 푸시 알림을 받을 수 있어요. Safari 공유 메뉴 → '홈 화면에 추가'를 먼저 해주세요."
            : "현재 브라우저는 푸시 알림을 지원하지 않아요."}
        </div>
      )}

      {state === "denied" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          알림 권한이 차단되어 있어요.{" "}
          {IS_NATIVE
            ? "기기 설정 → 피부텐텐 → 알림에서 허용으로 변경한 뒤 다시 시도해 주세요."
            : "브라우저 주소창의 자물쇠 아이콘 → 사이트 권한에서 알림을 허용으로 변경한 뒤 다시 시도해 주세요."}
        </div>
      )}

      {(state === "needs-permission" || state === "off") && (
        <button
          type="button"
          onClick={subscribe}
          disabled={working}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          푸시 알림 켜기
        </button>
      )}

      {state === "on" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-[var(--text-secondary)]">
            ✓ 푸시 알림을 받고 있어요
          </span>
          <button
            type="button"
            onClick={unsubscribe}
            disabled={working}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] disabled:opacity-60"
          >
            끄기
          </button>
        </div>
      )}
    </div>
  );
}
