"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  icon: React.ReactNode;
};

export type SessionInfo = {
  role: "admin" | "doctor" | "user";
  displayName: string;
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
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

export default function TopNav({ session }: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, startLogout] = useTransition();

  function handleLogout() {
    startLogout(async () => {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      // 풀 리로드 — layout의 session 캐시 확실히 비움
      window.location.assign("/feed");
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
          href="/feed"
          aria-label="피부텐텐 홈"
          className="flex items-center gap-2 shrink-0"
          onClick={(e) => {
            // /feed에서 로고 클릭 시 → F5와 동일한 풀 리로드
            if (pathname === "/feed") {
              e.preventDefault();
              if (typeof window !== "undefined") {
                window.location.assign("/feed");
              }
            }
            // 다른 경로는 /feed로 navigate
          }}
        >
          <Image
            src="/logo.png"
            alt="피부텐텐"
            width={32}
            height={32}
            priority
            className="rounded-full"
          />
          <span className="text-[16px] font-bold leading-none text-[var(--primary)] sm:text-[19px]">
            피부텐텐
          </span>
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

          {/* 본인 대시보드 (로그인) / 로그인 — 글쓰기는 NAV에 inline, 로그아웃은 /me 안에서 */}
          {session ? (
            <Link
              href={dashboardHref}
              className="flex items-center gap-1.5 rounded-md p-2 text-[14px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
              title={session.displayName}
            >
              {UserIcon}
              <span className="hidden sm:inline">
                {session.role === "admin" ? "관리자" : session.displayName}
              </span>
            </Link>
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
