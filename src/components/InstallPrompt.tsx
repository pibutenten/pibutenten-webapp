"use client";

/**
 * 피부텐텐 PWA 설치 안내 모달 + Service Worker 등록.
 *
 * 노출 트리거 (둘 중 하나):
 *   1) `pibutenten:card-viewed` 이벤트가 5회 이상 (Card 50% 노출 시 1회)
 *   2) 로그인 사용자 — 첫 진입 후 4초 지연
 *
 * 노출 차단:
 *   - standalone 모드 (홈 화면 앱으로 실행 중)
 *   - 14일 내 사용자가 닫음 (localStorage)
 *   - 모바일이 아님 (데스크탑은 Chrome 자체 설치 메뉴가 별도 존재)
 *
 * deferred prompt 캡처:
 *   - layout.tsx의 head <Script>가 React 마운트 전에 `beforeinstallprompt`를 잡아
 *     window.__pibutenten_bip 에 저장한다.
 *   - 이 컴포넌트는 마운트 시 그 값을 가져오고, 이후 `pibutenten:bip-ready` 이벤트도 감시.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CARD_BUS_EVENTS } from "@/components/card/hooks/useCardBus";

type Props = { signedIn: boolean };

const STORAGE_DISMISSED_AT = "pwa-install-dismissed-at";
const STORAGE_QA_VIEW_COUNT = "pwa-qa-view-count";
const DISMISS_DAYS = 14;
const REQUIRED_QA_VIEWS = 5;
const SIGNED_IN_DELAY_MS = 4000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pibutenten_bip?: BeforeInstallPromptEvent | null;
  }
}

/** 단계 번호 동그라미 — 1, 2 시각화 */
function StepCircle({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[12px] font-bold text-[var(--primary)]">
      {children}
    </span>
  );
}

/** Safari 공유 아이콘 글리프 — 인라인 SVG */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block h-4 w-4 align-[-0.15em] text-[var(--primary)]"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/** Chrome 메뉴(⋮) 글리프 */
function MenuGlyph() {
  return (
    <span className="inline-flex items-center justify-center text-[var(--primary)]">
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4 align-[-0.15em]"
        aria-hidden="true"
      >
        <circle cx="12" cy="5" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="12" cy="19" r="1.6" />
      </svg>
    </span>
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  );
}

function isDismissedRecently(): boolean {
  try {
    const at = localStorage.getItem(STORAGE_DISMISSED_AT);
    if (!at) return false;
    const days = (Date.now() - Number(at)) / 86_400_000;
    return days < DISMISS_DAYS;
  } catch {
    return false;
  }
}

function detectPlatform(): "android" | "ios" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export default function InstallPrompt({ signedIn }: Props) {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">(
    "other",
  );
  // deferred prompt 보유 여부 — UI 표시용 (있으면 자동 설치, 없으면 안내 fallback)
  const [hasDeferred, setHasDeferred] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Service Worker 즉시 등록 — 지연 시 beforeinstallprompt 자격 평가에 늦을 수 있음
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패는 사용자 영향 없음 */
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 우상단 [앱 설치] 버튼 등에서 명시적으로 호출하는 강제 표시 — 항상 우선 등록.
    // dismiss·카운트 같은 자동 트리거 조건은 무시 (사용자가 명시적으로 요청한 것).
    // iOS도 안내 받을 수 있도록 모달 노출 (Apple 정책상 자동 설치는 불가하지만,
    // 사용자가 [앱 설치] 버튼을 눌렀을 때 짧은 단계 안내라도 보여줘야 함).
    const onForceShow = () => {
      if (isStandalone()) return;
      const plat = detectPlatform();
      if (plat === "other") return; // 데스크탑은 노출 안 함
      setPlatform(plat);
      // 재호출 보강: head Script 가 보관 중인 deferred event 가 있으면 다시 끌어와
      // [설치] 버튼이 자동 prompt() 를 띄우도록 한다 — 이전에 dismiss 후 Chrome 이
      // beforeinstallprompt 를 재발사한 케이스에서도 정상 동작.
      if (window.__pibutenten_bip) {
        deferredRef.current = window.__pibutenten_bip;
        setHasDeferred(true);
      }
      setShow(true);
    };
    window.addEventListener("pibutenten:install-show", onForceShow);

    // 자동 트리거 — 아래 조건들은 미충족이어도 force-show 리스너는 위에 등록됨.
    if (isStandalone()) {
      return () => {
        window.removeEventListener("pibutenten:install-show", onForceShow);
      };
    }
    if (isDismissedRecently()) {
      return () => {
        window.removeEventListener("pibutenten:install-show", onForceShow);
      };
    }

    // 자동 트리거는 Android만. iOS는 사용자가 명시적으로 [앱 설치] 버튼을 눌렀을 때만 안내.
    const plat = detectPlatform();
    if (plat !== "android") {
      return () => {
        window.removeEventListener("pibutenten:install-show", onForceShow);
      };
    }
    setPlatform(plat);

    // (1) head <Script>가 이미 캡처해둔 deferred event 가져오기
    if (window.__pibutenten_bip) {
      deferredRef.current = window.__pibutenten_bip;
      setHasDeferred(true);
    }
    // (2) 늦게 도착하는 경우 대비 — 'pibutenten:bip-ready' 커스텀 이벤트 listen
    const onBipReady = () => {
      if (window.__pibutenten_bip) {
        deferredRef.current = window.__pibutenten_bip;
        setHasDeferred(true);
      }
    };
    window.addEventListener("pibutenten:bip-ready", onBipReady);
    // (3) 안전망 — 컴포넌트가 일찍 마운트된 경우에도 잡히도록
    const onBefore = (e: Event) => {
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      setHasDeferred(true);
    };
    window.addEventListener("beforeinstallprompt", onBefore);

    // 노출 후보 평가
    const evaluate = () => {
      if (isStandalone() || isDismissedRecently()) return;
      setShow(true);
    };

    // 트리거 1: Q&A 5회 노출
    let count = 0;
    try {
      count = Number(sessionStorage.getItem(STORAGE_QA_VIEW_COUNT) || "0");
    } catch {}
    if (count >= REQUIRED_QA_VIEWS) evaluate();

    const onCardViewed = () => {
      count += 1;
      try {
        sessionStorage.setItem(STORAGE_QA_VIEW_COUNT, String(count));
      } catch {}
      if (count >= REQUIRED_QA_VIEWS) evaluate();
    };
    window.addEventListener(CARD_BUS_EVENTS.CARD_VIEWED, onCardViewed);

    // 트리거 2: 로그인 사용자 — 진입 4초 후
    let signInTimer: number | undefined;
    if (signedIn) {
      signInTimer = window.setTimeout(evaluate, SIGNED_IN_DELAY_MS);
    }

    return () => {
      window.removeEventListener("pibutenten:install-show", onForceShow);
      window.removeEventListener("pibutenten:bip-ready", onBipReady);
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener(CARD_BUS_EVENTS.CARD_VIEWED, onCardViewed);
      if (signInTimer !== undefined) window.clearTimeout(signInTimer);
    };
  }, [signedIn]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_DISMISSED_AT, String(Date.now()));
    } catch {}
    setShow(false);
  }, []);

  const install = useCallback(async () => {
    // 재호출 보강: deferredRef 가 비어 있어도 head Script 가 보관 중일 수 있으므로
    // 한 번 더 window.__pibutenten_bip 을 조회한다. (dismiss 후 Chrome 이 재발사한 케이스)
    let dp = deferredRef.current;
    if (!dp && typeof window !== "undefined" && window.__pibutenten_bip) {
      dp = window.__pibutenten_bip;
      deferredRef.current = dp;
    }
    if (dp) {
      try {
        await dp.prompt();
        await dp.userChoice;
      } catch {}
      deferredRef.current = null;
      window.__pibutenten_bip = null;
      setHasDeferred(false);
      setShow(false);
      return;
    }
    // deferred가 없으면 사용자에게 수동 설치 안내 — 닫지는 않고 화면 메시지만 변경
    setHasDeferred(false);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
    >
      <div className="w-[min(310px,100%)] rounded-[20px] bg-white p-6 shadow-[0_16px_48px_rgba(0,0,0,0.18)]">
        {/* 큰 로고 — 정사각형 비율의 시각적 무게중심 */}
        <div className="flex justify-center pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/splash-circle-512.png"
            alt=""
            width={128}
            height={128}
            className="h-32 w-32"
          />
        </div>
        <h2
          id="install-prompt-title"
          className="mt-5 text-center text-[18px] font-bold leading-[1.4] text-[var(--text)]"
        >
          홈 화면에
          <br />
          추가해보세요!
        </h2>
        {platform === "android" && hasDeferred ? (
          <p className="mt-3 text-center text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">
            클릭 한 번이면 빠르게 열 수 있어요.
          </p>
        ) : platform === "ios" ? (
          <>
            <p className="mt-3 text-center text-[13px] leading-[1.6] text-[var(--text-secondary)]">
              아이폰은 한 단계가 더 필요해요.
              <br />
              아래 순서대로 따라해보세요.
            </p>
            <ol className="mt-4 space-y-3 text-[13px] leading-[1.55] text-[var(--text-secondary)]">
              <li className="flex items-start gap-2.5">
                <StepCircle>1</StepCircle>
                <span>
                  화면 <span className="font-semibold">하단 가운데</span>의{" "}
                  <ShareGlyph /> <span className="font-semibold">공유</span>{" "}
                  버튼을 눌러주세요.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <StepCircle>2</StepCircle>
                <span>
                  메뉴를 조금 내리면{" "}
                  <span className="font-semibold">&ldquo;홈 화면에 추가&rdquo;</span>가
                  보여요. 눌러주세요.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <StepCircle>3</StepCircle>
                <span>
                  오른쪽 위{" "}
                  <span className="font-semibold">&ldquo;추가&rdquo;</span>를
                  누르면 끝!
                </span>
              </li>
            </ol>
          </>
        ) : (
          // Android인데 deferred prompt가 없는 경우 = 이미 설치된 디바이스로 추정.
          // 안내 단계 없이 짧은 한 줄만.
          <p className="mt-3 text-center text-[13.5px] leading-[1.6] text-[var(--text-secondary)]">
            이미 설치되어 있는 것 같아요.
            <br />홈 화면에서 앱 아이콘을 눌러주세요.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {platform === "android" && hasDeferred && (
            <button
              type="button"
              onClick={install}
              className="h-11 w-full rounded-[12px] bg-[var(--primary)] text-[14.5px] font-bold text-white transition-colors hover:bg-[var(--primary-dark)]"
            >
              설치
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="h-11 w-full rounded-[12px] border border-[var(--border)] bg-white text-[13.5px] font-medium text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
          >
            {platform === "android" && hasDeferred ? "나중에" : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
