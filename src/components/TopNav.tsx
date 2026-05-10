"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
// PersonaSwitcher는 v4에서 헤더에서 제거됨 — 페르소나 전환은 프로필 페이지 안에서

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  icon: React.ReactNode;
};

export type SessionInfo = {
  role: "admin" | "doctor" | "user";
  displayName: string;
  avatarUrl: string | null;
  altDisplayName: string | null;
  altAvatarUrl: string | null;
  /** v4 — 헤더 아바타 1-click 진입용 */
  handle: string | null;
  altHandle: string | null;
  doctorSlug: string | null;
  persona: "official" | "personal";
} | null;

type TopNavProps = {
  session: SessionInfo;
};

const HomeIcon = (
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
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9.5" />
  </svg>
);

const SearchIcon = (
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
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

/**
 * 전문의 — 사람(머리+어깨) 위에 학사모. 본인 아이콘(UserIcon)과 동일 비율 유지.
 *  - 어깨: UserIcon과 정확히 같은 좌표 (x=4~20, y=15~21)
 *  - 머리: r=3.5 (UserIcon r=4보다 살짝 작아 학사모와 균형)
 *  - 학사모: 상단 y=3~8 영역에 얇게
 */
const DoctorIcon = (
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
    {/* 학사모 윗면 — 얇은 마름모 */}
    <path d="M3.5 5.5l8.5-2.5 8.5 2.5-8.5 2.5z" />
    {/* 우측 술띠 */}
    <path d="M20.5 5.5v3" />
    {/* 머리 */}
    <circle cx="12" cy="12" r="3.5" />
    {/* 어깨 — UserIcon과 동일 좌표 */}
    <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
  </svg>
);

const YoutubeIcon = (
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
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </svg>
);

const WriteIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

function buildNavItems(_hasSession: boolean): NavItem[] {
  // 글쓰기는 우하단 플로팅 버튼(FloatingWriteButton)으로 이동
  void _hasSession;
  return [
    { href: "/search", label: "검색", icon: SearchIcon },
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
      className="flex items-center gap-1.5 rounded-md p-2 text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)] sm:hidden"
    >
      {InstallIcon}
    </button>
  );
}

export default function TopNav({ session }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, startLogout] = useTransition();

  function handleLogout() {
    startLogout(async () => {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      // 풀 리로드 — layout의 session 캐시 확실히 비움
      window.location.assign("/");
    });
  }

  const dashboardHref =
    session?.role === "admin" ? "/admin" : "/me";

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] backdrop-blur"
      style={{ background: "rgba(255,255,255,0.92)" }}
    >
      <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-2 px-4 py-3 sm:px-6">
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

        <nav className="flex items-center gap-1 sm:gap-3">
          {buildNavItems(!!session).map((item) => {
            const isActive =
              !item.external &&
              (item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href));

            const baseCls =
              "flex items-center gap-1.5 rounded-md p-2 text-[14px] font-medium transition-colors";
            const activeCls = isActive
              ? "text-[var(--primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--primary)]";

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

          {/* 모바일 우상단 — 앱 설치 버튼 (데스크탑은 Chrome 자체 설치 메뉴가 있어 숨김) */}
          <InstallAppButton />

          {/* 본인 메뉴 (v4 1-click) — 드롭다운 X. 아바타·닉네임 클릭 → 본인 프로필 즉시 이동.
              관리자만 별도 [관리자] 아이콘 노출. 프로필 전환은 프로필 페이지 안 위젯에서. */}
          {session ? (
            <>
              {(() => {
                // 진입 URL 결정
                //  - 관리자: /admin (관리자는 본인 프로필 안 만들고 대시보드만)
                //  - 의사 official: /doctors/{slug}
                //  - 의사 personal · 회원: /{handle 또는 alt_handle}
                //  - handle 미설정 시 fallback /me
                const isPersonal = session.persona === "personal";
                const profileHref =
                  session.role === "admin"
                    ? "/admin"
                    : session.role === "doctor" && !isPersonal && session.doctorSlug
                      ? `/doctors/${session.doctorSlug}`
                      : (isPersonal ? session.altHandle : session.handle)
                        ? `/${isPersonal ? session.altHandle : session.handle}`
                        : "/me";
                const displayName = isPersonal
                  ? session.altDisplayName ?? session.displayName
                  : session.displayName;
                const avatarUrl = isPersonal
                  ? session.altAvatarUrl
                  : session.avatarUrl;
                return (
                  <Link
                    href={profileHref}
                    aria-label="내 프로필"
                    title="내 프로필"
                    className="flex items-center gap-1.5 rounded-md p-1 outline-none transition-colors hover:bg-[var(--bg-soft)] focus:outline-none focus-visible:ring-0"
                  >
                    <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-[var(--bg-soft)]">
                      {avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[12px]">
                          👤
                        </span>
                      )}
                    </span>
                    <span className="hidden max-w-[100px] truncate text-[13px] font-medium text-[var(--text)] sm:inline">
                      {displayName}
                    </span>
                  </Link>
                );
              })()}
              {/* 관리자 메뉴는 헤더에 없음 — /admin은 본인 프로필 페이지 안에서 진입 */}
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-md p-2 text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
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
