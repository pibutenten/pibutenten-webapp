"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
// v4 다중 identity 전환은 IdentitySwitcher로 (1개일 땐 단순 Link)
import IdentitySwitcher from "./IdentitySwitcher";
import NotificationsBell from "./NotificationsBell";
import BottomNav from "./BottomNav";
import { ROLES } from "@/lib/identity-shared";
// V-Phase(2026-06-07): 세션은 SSR prop 이 아니라 클라 SessionProvider 에서 받음
//   (layout 이 서버에서 세션을 안 읽게 함). 타입(SessionInfo)만 역방향 import 라 순환 없음.
import { useSession } from "@/lib/session-context";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  icon: React.ReactNode;
};

export type SessionIdentity = {
  /** 묶음 내 profile.id (UUID). 본 계정도 자체 profile.id 그대로. Critical-5 (2026-05-27). */
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** profiles.role 값: 'admin' | 'doctor' | 'user' (호환성 alias) */
  kind: string;
};

export type SessionInfo = {
  role: "admin" | "doctor" | "user";
  displayName: string;
  avatarUrl: string | null;
  /** v4 — 헤더 아바타 1-click 진입용 */
  handle: string | null;
  doctorSlug: string | null;
  /** v4 multi-identity — 본인이 보유한 모든 identity (본 계정 포함). 1개일 땐 dropdown 안 보임. */
  identities: SessionIdentity[];
  /** 현재 활성 identity id — 실제 profile.id (UUID). Critical-5 (2026-05-27) 이후 sentinel "primary" 폐지. */
  activeIdentityId: string;
} | null;

// 우상단 네비 아이콘 — 디자인 SVG(18×18) 1:1 사용. 활성/비활성 색 변화 없음 (자체 #474B4C 고정).
const SearchIcon = (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/icons/ic_nav_search.svg"
    alt=""
    width={18}
    height={18}
    className="h-[18px] w-[18px]"
    aria-hidden="true"
  />
);

const DoctorIcon = (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src="/icons/ic_nav_doctor.svg"
    alt=""
    width={18}
    height={18}
    className="h-[18px] w-[18px]"
    aria-hidden="true"
  />
);

function buildNavItems(_hasSession: boolean): NavItem[] {
  // 글쓰기 진입은 앱 라우트(/, /write 등)의 BottomNav 5탭이 담당. 콘텐츠 페이지 TopNav 는 검색·전문의만.
  void _hasSession;
  return [
    // 검색은 루트 /?q= 가 담당(/search 폐기 2026-06-12). 레거시 TopNav(인증 흐름)도 루트로.
    { href: "/", label: "검색", icon: SearchIcon },
    { href: "/doctors", label: "전문의", icon: DoctorIcon },
  ];
}

const UserIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

/** 앱 설치(다운로드) 아이콘 — 모바일 우상단에서 InstallPrompt 강제 호출 */
const InstallIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * 모바일 전용 앱 설치 버튼 — InstallPrompt 컴포넌트에 강제 표시 신호 전송.
 *
 * 자동 숨김 케이스:
 *   - standalone 모드 (이미 PWA로 실행 중)
 *   - localStorage 'pwa-installed' = '1' (appinstalled 이벤트 또는 자동 추정으로 마킹됨)
 *   - Android에서 페이지 로드 후 5초 동안 beforeinstallprompt가 발생 안 함
 *     → 이미 설치 완료 상태로 추정 (Chrome은 설치된 PWA에 대해 이벤트를 안 보냄)
 *   - 데스크탑 (Chrome 자체 설치 메뉴가 따로 있고, 이 버튼은 모바일 한정)
 *
 * iOS는 자동 설치 불가하지만 안내를 받을 수 있게 노출함 (안내 모달 단계 시각화).
 */
function InstallAppButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function isStandalone() {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      return Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      );
    }
    function isInstalledMarked() {
      try {
        return localStorage.getItem("pwa-installed") === "1";
      } catch {
        return false;
      }
    }

    if (isStandalone()) {
      setVisible(false);
      return;
    }

    const ua = navigator.userAgent;
    const isAndroid = /Android/.test(ua);
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    if (!isAndroid && !isIOS) {
      // 데스크탑은 노출 안 함
      setVisible(false);
      return;
    }

    // 노출 정책:
    //   - Android: beforeinstallprompt가 실제로 잡혔을 때만 노출 (= Chrome이 "설치 가능"으로 인식한 상태).
    //              잡히지 않으면 = 이미 설치됐거나 자격 미달 → 다운로드 버튼 자체를 보이지 않음.
    //   - iOS: 자동 설치 API가 없으므로 항상 노출 (안내 모달 단계 시각화 용도).
    //   - localStorage 'pwa-installed' 마킹이 있으면 우선 숨김, 단 deferred prompt 잡히면 즉시 해제.

    if (isIOS) {
      setVisible(true);
    } else {
      // Android — 우선 숨김. deferred 잡히면 보임.
      setVisible(!isInstalledMarked() && Boolean(window.__pibutenten_bip));
    }

    // appinstalled 이벤트 — 설치 직후 즉시 숨김
    const onInstalled = () => {
      try {
        localStorage.setItem("pwa-installed", "1");
      } catch {}
      setVisible(false);
    };
    window.addEventListener("pibutenten:installed", onInstalled);

    // beforeinstallprompt 발생 = Chrome이 "설치 가능"으로 인식 → 마킹 해제 + 버튼 노출
    const onBipReady = () => {
      try {
        localStorage.removeItem("pwa-installed");
      } catch {}
      setVisible(true);
    };
    window.addEventListener("pibutenten:bip-ready", onBipReady);

    return () => {
      window.removeEventListener("pibutenten:installed", onInstalled);
      window.removeEventListener("pibutenten:bip-ready", onBipReady);
    };
  }, []);

  function show() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("pibutenten:install-show"));
  }

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={show}
      aria-label="앱 설치"
      title="앱 설치"
      className="flex items-center gap-1.5 rounded-md p-2 text-[14px] font-medium text-[var(--text)] transition-colors hover:text-[var(--primary)] sm:hidden"
    >
      {InstallIcon}
    </button>
  );
}

export default function TopNav() {
  // 세션은 클라에서: 마운트 즉시 쿠키로 로그인 여부 확정(네트워크 없음) + /api/session 리치 보강.
  const session = useSession();
  const pathname = usePathname();

  // 메인 승격(2026-06-11): 사이트 전 페이지를 새 BottomNav 로 통일(상단바 일관성).
  //   예외 — 인증/온보딩 흐름(/login·/signup·/onboarding·/auth·/u 리다이렉트)만 기존 미니멀 TopNav.
  //   (이 화면들엔 앱 하단 5탭이 어울리지 않음). 그 외 전부 BottomNav.
  const isAuthFlow =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/u/");
  if (!isAuthFlow) return <BottomNav />;

  // 로그아웃 동작은 본인 프로필 페이지(/{handle}) 하단 LogoutButton으로 이동됨 (A5)
  // router/isLoggingOut/handleLogout/dashboardHref는 더 이상 사용 안 함 — 정리.

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur"
      style={{ background: "rgba(255,255,255,0.92)" }}
    >
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          aria-label="피부텐텐 홈"
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => {
            // 메인 / 에서 로고 클릭 시 → F5와 동일한 풀 리로드
            if (pathname === "/") {
              e.preventDefault();
              if (typeof window !== "undefined") {
                window.location.assign("/");
              }
            }
            // 다른 경로는 / 로 navigate
          }}
        >
          {/* 브랜드 로고 — tt: 아이콘 + 피부텐텐 워드마크 SVG */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand-logo.svg"
            alt="피부텐텐"
            className="h-7 w-auto sm:h-8"
          />
        </Link>

        <nav className="flex items-center gap-3 sm:gap-3">
          {buildNavItems(!!session).map((item) => {
            const isActive =
              !item.external &&
              (item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href));

            const baseCls =
              // WCAG 2.5.5 — 모바일 hit area 최소 44×44px 보장.
              // 모바일은 p-3(12px) → 20px icon + 24px = 44px. 데스크탑은 p-2(8px) 유지 (텍스트로 폭 확보됨).
              "flex min-h-[44px] items-center gap-1.5 rounded-md p-3 text-[14px] font-medium transition-colors sm:min-h-0 sm:p-2";
            // 활성/비활성 색 변화 없음 — 아이콘 자체 색(#474B4C) 유지. 라벨 텍스트만 hover 시 primary.
            const activeCls = isActive
              ? "text-[var(--text)]"
              : "text-[var(--text)] hover:text-[var(--primary)]";

            const content = (
              <>
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </>
            );

            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  title={item.label}
                  className={`${baseCls} ${activeCls}`}
                >
                  {content}
                </a>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`${baseCls} ${activeCls}`}
              >
                {content}
              </Link>
            );
          })}

          {/* 로그인 사용자: 알림 종 아이콘 (미확인 시 빨간 배지 + PWA Badge) */}
          {session && <NotificationsBell />}

          {/* 모바일 우상단 — 앱 설치 버튼 (데스크탑은 Chrome 자체 설치 메뉴가 있어 숨김) */}
          <InstallAppButton />

          {/* 본인 메뉴 (v4 multi-identity)
              - identity 1개 → 단순 Link (본인 프로필 즉시 이동)
              - identity 2+ → dropdown으로 활성 identity 전환 가능
              - 관리자: 항상 /admin 직행 */}
          {session ? (
            <IdentitySwitcher
              identities={session.identities}
              activeId={session.activeIdentityId}
              doctorSlug={session.doctorSlug}
              isAdmin={session.role === ROLES.ADMIN}
            />
          ) : (
            <Link
              href="/login"
              className="flex min-h-[44px] items-center gap-1.5 rounded-md p-3 text-[14px] font-medium text-[var(--text)] transition-colors hover:text-[var(--primary)] sm:min-h-0 sm:p-2"
              title="로그인"
            >
              {UserIcon}
              <span className="hidden sm:inline">로그인</span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
